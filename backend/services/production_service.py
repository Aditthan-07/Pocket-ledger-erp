"""
Pocket Ledger ERP - Production Service & Costing Engine
BOM Scaling, Production Run Execution, 3% Variance Rule Detection,
Direct Batch Overhead Allocation, and Packaging Consumption Accounting.
"""

import math
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.models import (
    ProductionRun,
    ProductionConsumption,
    Purchase,
    Party,
    Item,
    BOMHeader,
    BOMIngredient,
    BOMSKUMapping,
    StockLedger,
    StockTransactionType,
    AuditLog,
)
from backend.services.ledger_service import (
    get_item_balance,
    get_weighted_average_rate_paisa,
    record_stock_movement,
)
from backend.units import quantize_qty, paisa_to_rupees, format_rupees


VARIANCE_THRESHOLD_PCT = Decimal("3.0")


# --- 1. Purchase Service ---

def create_purchase(
    db: Session,
    bill_no: str,
    supplier_id: int,
    item_id: int,
    qty: Decimal,
    unit_rate_paisa: int,
    purchase_date: date,
    created_by: Optional[int] = None,
) -> Purchase:
    """
    Record an inbound supplier purchase:
    1. Validates supplier and item.
    2. Calculates total_paisa = qty * unit_rate_paisa.
    3. Persists Purchase row.
    4. Appends immutable PURCHASE entry to stock_ledger.
    5. Writes an audit_logs entry.
    """
    supplier = db.query(Party).filter(Party.id == supplier_id).first()
    if not supplier:
        raise ValueError(f"Supplier with ID {supplier_id} does not exist.")

    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError(f"Item with ID {item_id} does not exist.")

    dec_qty = quantize_qty(qty)
    if dec_qty <= Decimal("0.0000"):
        raise ValueError("Purchase quantity must be greater than zero.")
    if unit_rate_paisa < 0:
        raise ValueError("Unit rate in paisa cannot be negative.")

    total_paisa = int(round(dec_qty * Decimal(str(unit_rate_paisa))))

    purchase = Purchase(
        bill_no=bill_no,
        supplier_id=supplier_id,
        item_id=item_id,
        qty=dec_qty,
        unit_rate_paisa=unit_rate_paisa,
        total_paisa=total_paisa,
        purchase_date=purchase_date,
        created_by=created_by,
    )
    db.add(purchase)
    db.flush()

    # Append immutable stock ledger entry
    record_stock_movement(
        db=db,
        item_id=item_id,
        transaction_type=StockTransactionType.PURCHASE.value,
        qty_change=dec_qty,
        unit_rate_paisa=unit_rate_paisa,
        reference_type="PURCHASE",
        reference_id=purchase.id,
        notes=f"Purchase Bill #{bill_no} from {supplier.name}",
        created_by=created_by,
        allow_negative=False,
    )

    # Log to audit trail
    audit_entry = AuditLog(
        entity_type="purchases",
        entity_id=purchase.id,
        action="CREATE",
        details_json=(
            f'{{"bill_no": "{bill_no}", "item": "{item.sku_code}", '
            f'"qty": "{dec_qty}", "rate_paisa": {unit_rate_paisa}, "total_paisa": {total_paisa}}}'
        ),
        performed_by=created_by,
    )
    db.add(audit_entry)
    db.flush()

    return purchase


# --- 2. BOM Scaling & Production Preview ---

def preview_production_run(
    db: Session,
    finished_item_id: int,
    batches_count: Decimal = Decimal("1.0"),
) -> Dict[str, Any]:
    """
    Dry-run BOM scaling and availability check.
    Computes required ingredients, planned packaging, and flags stock shortages.
    """
    mapping = (
        db.query(BOMSKUMapping)
        .filter(BOMSKUMapping.finished_item_id == finished_item_id)
        .first()
    )
    if not mapping:
        raise ValueError(f"No BOM SKU mapping found for finished good ID {finished_item_id}.")

    bom = mapping.bom
    batches = quantize_qty(batches_count)
    if batches <= Decimal("0.0000"):
        raise ValueError("Batches count must be positive.")

    finished_item = mapping.finished_item
    expected_output_packets = quantize_qty(mapping.expected_yield_packets * batches)

    all_sufficient = True
    ingredients_preview = []
    total_est_rm_cost_paisa = Decimal("0.0")

    # Raw material ingredients check
    for ing in bom.ingredients:
        raw_item = ing.raw_item
        planned_qty = quantize_qty(ing.standard_qty * batches)
        current_bal = get_item_balance(db, ing.raw_item_id)
        is_sufficient = current_bal >= planned_qty
        if not is_sufficient:
            all_sufficient = False
        shortage = quantize_qty(max(Decimal("0.0000"), planned_qty - current_bal))
        rate_paisa = get_weighted_average_rate_paisa(db, ing.raw_item_id, as_decimal=True)
        est_cost = quantize_qty(planned_qty * rate_paisa, precision=Decimal("1"))
        total_est_rm_cost_paisa += est_cost

        ingredients_preview.append(
            {
                "item_id": raw_item.id,
                "sku_code": raw_item.sku_code,
                "name": raw_item.name,
                "name_ta": raw_item.name_ta,
                "unit": ing.unit,
                "standard_qty_per_batch": ing.standard_qty,
                "planned_qty": planned_qty,
                "current_stock": current_bal,
                "is_sufficient": is_sufficient,
                "shortage": shortage,
                "weighted_rate_paisa": int(round(rate_paisa)),
                "weighted_rate_rupees": paisa_to_rupees(int(round(rate_paisa))),
                "estimated_cost_paisa": int(est_cost),
                "estimated_cost_rupees": paisa_to_rupees(int(est_cost)),
            }
        )

    # Packaging: Pouches
    pouch_preview = None
    if mapping.pouch_item:
        pouch = mapping.pouch_item
        planned_pouches = quantize_qty(expected_output_packets * mapping.pouches_per_packet)
        pouch_bal = get_item_balance(db, pouch.id)
        pouch_suff = pouch_bal >= planned_pouches
        if not pouch_suff:
            all_sufficient = False
        pouch_shortage = quantize_qty(max(Decimal("0.0000"), planned_pouches - pouch_bal))
        pouch_rate = get_weighted_average_rate_paisa(db, pouch.id, as_decimal=True)
        pouch_cost = quantize_qty(planned_pouches * pouch_rate, precision=Decimal("1"))

        pouch_preview = {
            "item_id": pouch.id,
            "sku_code": pouch.sku_code,
            "name": pouch.name,
            "name_ta": pouch.name_ta,
            "unit": pouch.base_unit,
            "planned_qty": planned_pouches,
            "current_stock": pouch_bal,
            "is_sufficient": pouch_suff,
            "shortage": pouch_shortage,
            "weighted_rate_paisa": int(round(pouch_rate)),
            "weighted_rate_rupees": paisa_to_rupees(int(round(pouch_rate))),
            "estimated_cost_paisa": int(pouch_cost),
            "estimated_cost_rupees": paisa_to_rupees(int(pouch_cost)),
        }

    # Packaging: Cartons
    carton_preview = None
    if mapping.carton_item and mapping.packets_per_carton > 0:
        carton = mapping.carton_item
        planned_cartons = Decimal(str(math.ceil(expected_output_packets / Decimal(mapping.packets_per_carton))))
        carton_bal = get_item_balance(db, carton.id)
        carton_suff = carton_bal >= planned_cartons
        if not carton_suff:
            all_sufficient = False
        carton_shortage = quantize_qty(max(Decimal("0.0000"), planned_cartons - carton_bal))
        carton_rate = get_weighted_average_rate_paisa(db, carton.id, as_decimal=True)
        carton_cost = quantize_qty(planned_cartons * carton_rate, precision=Decimal("1"))

        carton_preview = {
            "item_id": carton.id,
            "sku_code": carton.sku_code,
            "name": carton.name,
            "name_ta": carton.name_ta,
            "unit": carton.base_unit,
            "planned_qty": planned_cartons,
            "current_stock": carton_bal,
            "is_sufficient": carton_suff,
            "shortage": carton_shortage,
            "weighted_rate_paisa": int(round(carton_rate)),
            "weighted_rate_rupees": paisa_to_rupees(int(round(carton_rate))),
            "estimated_cost_paisa": int(carton_cost),
            "estimated_cost_rupees": paisa_to_rupees(int(carton_cost)),
        }

    return {
        "bom_id": bom.id,
        "bom_code": bom.code,
        "bom_name": bom.name,
        "finished_item_id": finished_item.id,
        "finished_item_name": finished_item.name,
        "finished_item_sku": finished_item.sku_code,
        "batches_count": batches,
        "expected_output_packets": expected_output_packets,
        "can_produce": all_sufficient,
        "ingredients": ingredients_preview,
        "pouch_packaging": pouch_preview,
        "carton_packaging": carton_preview,
    }


# --- 3. Production Execution & Costing Engine ---

def execute_production_run(
    db: Session,
    finished_item_id: int,
    batches_count: Decimal,
    raw_materials_issued: List[Dict[str, Any]],
    actual_good_packets: Decimal,
    damaged_pouches: Decimal = Decimal("0.0"),
    cartons_used: int = 0,
    labour_cost_paisa: int = 0,
    overhead_cost_paisa: int = 0,
    run_date: Optional[date] = None,
    created_by: Optional[int] = None,
    run_number: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute a production run:
    1. Validates BOM mapping and ingredients.
    2. Enforces 3% Tolerance Rule on yield and raw material consumptions.
    3. Deducts actual raw materials issued from stock_ledger (PROD_ISSUE).
    4. Deducts total pouches consumed (actual_good_packets + damaged_pouches) from stock_ledger.
    5. Deducts cartons used from stock_ledger.
    6. Calculates exact batch cost:
       Total Cost = Raw Materials + Packaging + Labour + Overhead
       Cost per packet = round(Total Batch Cost / actual_good_packets)
    7. Adds finished goods output to stock_ledger (PROD_OUTPUT) with the computed unit rate.
    8. Records audit log.
    """
    if run_date is None:
        run_date = date.today()
    elif isinstance(run_date, str):
        try:
            run_date = date.fromisoformat(run_date)
        except Exception:
            run_date = date.today()

    batches = quantize_qty(batches_count)
    if batches <= Decimal("0.0000"):
        raise ValueError("Batches count must be greater than zero.")

    dec_good_packets = quantize_qty(actual_good_packets)
    if dec_good_packets <= Decimal("0.0000"):
        raise ValueError("Actual good packets must be greater than zero.")

    dec_damaged = quantize_qty(damaged_pouches)

    mapping = (
        db.query(BOMSKUMapping)
        .filter(BOMSKUMapping.finished_item_id == finished_item_id)
        .first()
    )
    if not mapping:
        raise ValueError(f"No BOM SKU mapping found for finished good ID {finished_item_id}.")

    bom = mapping.bom
    finished_item = mapping.finished_item

    # Planned yield & Yield Variance calculation
    expected_output_packets = quantize_qty(mapping.expected_yield_packets * batches)
    yield_variance_pct = quantize_qty(
        ((dec_good_packets - expected_output_packets) / expected_output_packets) * Decimal("100.0000")
    )
    yield_is_flagged = abs(yield_variance_pct) > VARIANCE_THRESHOLD_PCT

    has_variance_alert = yield_is_flagged

    if not run_number:
        today_str = run_date.strftime("%Y%m%d")
        existing_runs = db.query(ProductionRun).filter(ProductionRun.run_number.like(f"PR-{today_str}-%")).count()
        run_number = f"PR-{today_str}-{existing_runs + 1:04d}"

    # Map actual inputs by item_id
    actual_inputs_map = {rm["item_id"]: quantize_qty(rm["actual_qty"]) for rm in raw_materials_issued}

    # Verify all BOM ingredients are provided
    for ing in bom.ingredients:
        if ing.raw_item_id not in actual_inputs_map:
            raise ValueError(f"Missing actual quantity issued for raw material '{ing.raw_item.name}'.")

    # Step 1: Compute Raw Material Costs & Variances
    total_raw_material_cost_paisa = Decimal("0.0")
    consumptions_to_save = []
    consumptions_breakdown = []

    for ing in bom.ingredients:
        raw_id = ing.raw_item_id
        raw_item = ing.raw_item
        planned_qty = quantize_qty(ing.standard_qty * batches)
        actual_qty = actual_inputs_map[raw_id]

        # Invariant 3% variance rule
        var_pct = quantize_qty(
            ((actual_qty - planned_qty) / planned_qty) * Decimal("100.0000")
        )
        is_flagged = abs(var_pct) > VARIANCE_THRESHOLD_PCT
        if is_flagged:
            has_variance_alert = True

        # Weighted average rate at time of consumption
        rate_paisa = get_weighted_average_rate_paisa(db, raw_id, as_decimal=True)
        # Invariant: Item cost = actual_qty * rate_paisa
        item_cost_paisa = quantize_qty(actual_qty * rate_paisa, precision=Decimal("1"))
        total_raw_material_cost_paisa += item_cost_paisa

        consumptions_breakdown.append(
            {
                "item_id": raw_id,
                "name": raw_item.name,
                "sku_code": raw_item.sku_code,
                "unit": ing.unit,
                "planned_qty": planned_qty,
                "actual_qty": actual_qty,
                "variance_pct": var_pct,
                "is_flagged": is_flagged,
                "weighted_rate_paisa": float(rate_paisa),
                "cost_paisa": int(item_cost_paisa),
                "cost_rupees": paisa_to_rupees(int(item_cost_paisa)),
            }
        )

        consumptions_to_save.append(
            {
                "item_id": raw_id,
                "planned_qty": planned_qty,
                "actual_qty": actual_qty,
                "variance_pct": var_pct,
                "is_flagged": is_flagged,
                "rate_paisa": int(round(rate_paisa)),
            }
        )

    # Step 2: Compute Packaging Consumption & Costs
    # Total pouches consumed = actual_good_packets + damaged_pouches
    total_pouches_consumed = quantize_qty(dec_good_packets + dec_damaged)
    pouch_cost_paisa = Decimal("0.0")
    pouch_rate_paisa = Decimal("0.0")

    if mapping.pouch_item:
        pouch_rate_paisa = get_weighted_average_rate_paisa(db, mapping.pouch_item_id, as_decimal=True)
        pouch_cost_paisa = quantize_qty(total_pouches_consumed * pouch_rate_paisa, precision=Decimal("1"))

    # Cartons consumed
    dec_cartons = Decimal(str(cartons_used))
    carton_cost_paisa = Decimal("0.0")
    carton_rate_paisa = Decimal("0.0")

    if mapping.carton_item and cartons_used > 0:
        carton_rate_paisa = get_weighted_average_rate_paisa(db, mapping.carton_item_id, as_decimal=True)
        carton_cost_paisa = quantize_qty(dec_cartons * carton_rate_paisa, precision=Decimal("1"))

    total_packaging_cost_paisa = pouch_cost_paisa + carton_cost_paisa

    # Step 3: Total Batch Cost & Cost Per Packet
    total_batch_cost_paisa = (
        total_raw_material_cost_paisa
        + total_packaging_cost_paisa
        + Decimal(str(labour_cost_paisa))
        + Decimal(str(overhead_cost_paisa))
    )

    cost_per_packet_paisa = int(
        (total_batch_cost_paisa / dec_good_packets).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )

    selling_price = finished_item.selling_price_paisa
    gross_margin_pct = Decimal("0.0000")
    if selling_price > 0:
        gross_margin_pct = quantize_qty(
            ((Decimal(selling_price) - Decimal(cost_per_packet_paisa)) / Decimal(selling_price)) * Decimal("100.0000")
        )

    # Step 4: Persist ProductionRun Entity
    run = ProductionRun(
        run_number=run_number,
        bom_id=bom.id,
        finished_item_id=finished_item.id,
        batches_count=batches,
        expected_output_packets=expected_output_packets,
        actual_good_packets=dec_good_packets,
        damaged_pouches=dec_damaged,
        cartons_used=cartons_used,
        labour_cost_paisa=labour_cost_paisa,
        overhead_cost_paisa=overhead_cost_paisa,
        yield_variance_pct=yield_variance_pct,
        has_variance_alert=has_variance_alert,
        run_date=run_date,
        created_by=created_by,
    )
    db.add(run)
    db.flush()

    # Step 5: Persist Consumptions
    for cdata in consumptions_to_save:
        pc = ProductionConsumption(
            run_id=run.id,
            item_id=cdata["item_id"],
            planned_qty=cdata["planned_qty"],
            actual_qty=cdata["actual_qty"],
            variance_pct=cdata["variance_pct"],
            is_flagged=cdata["is_flagged"],
        )
        db.add(pc)

    # Step 6: Deduct from Stock Ledger (PROD_ISSUE)
    # 6a. Deduct Raw Materials
    for cdata in consumptions_to_save:
        record_stock_movement(
            db=db,
            item_id=cdata["item_id"],
            transaction_type=StockTransactionType.PROD_ISSUE.value,
            qty_change=-cdata["actual_qty"],
            unit_rate_paisa=cdata["rate_paisa"],
            reference_type="PRODUCTION_RUN",
            reference_id=run.id,
            notes=f"Production Run #{run.run_number} raw material issue",
            created_by=created_by,
            allow_negative=False,
        )

    # 6b. Deduct Pouches
    if mapping.pouch_item and total_pouches_consumed > Decimal("0.0000"):
        record_stock_movement(
            db=db,
            item_id=mapping.pouch_item_id,
            transaction_type=StockTransactionType.PROD_ISSUE.value,
            qty_change=-total_pouches_consumed,
            unit_rate_paisa=int(round(pouch_rate_paisa)),
            reference_type="PRODUCTION_RUN",
            reference_id=run.id,
            notes=f"Production Run #{run.run_number} pouches (Good: {dec_good_packets}, Damaged: {dec_damaged})",
            created_by=created_by,
            allow_negative=False,
        )

    # 6c. Deduct Cartons
    if mapping.carton_item and cartons_used > 0:
        record_stock_movement(
            db=db,
            item_id=mapping.carton_item_id,
            transaction_type=StockTransactionType.PROD_ISSUE.value,
            qty_change=-dec_cartons,
            unit_rate_paisa=int(round(carton_rate_paisa)),
            reference_type="PRODUCTION_RUN",
            reference_id=run.id,
            notes=f"Production Run #{run.run_number} cartons issue",
            created_by=created_by,
            allow_negative=False,
        )

    # Step 7: Add Finished Goods Output to Stock Ledger (PROD_OUTPUT)
    record_stock_movement(
        db=db,
        item_id=finished_item.id,
        transaction_type=StockTransactionType.PROD_OUTPUT.value,
        qty_change=dec_good_packets,
        unit_rate_paisa=cost_per_packet_paisa,
        reference_type="PRODUCTION_RUN",
        reference_id=run.id,
        notes=f"Production Run #{run.run_number} output @ {format_rupees(cost_per_packet_paisa)}/pkt",
        created_by=created_by,
        allow_negative=False,
    )

    # Step 8: Record Audit Log
    audit_entry = AuditLog(
        entity_type="production_runs",
        entity_id=run.id,
        action="EXECUTE",
        details_json=(
            f'{{"run_number": "{run.run_number}", "finished_sku": "{finished_item.sku_code}", '
            f'"good_packets": "{dec_good_packets}", "cost_per_packet_paisa": {cost_per_packet_paisa}, '
            f'"total_batch_cost_paisa": {int(total_batch_cost_paisa)}, "has_variance_alert": {has_variance_alert}}}'
        ),
        performed_by=created_by,
    )
    db.add(audit_entry)
    db.flush()

    return {
        "run_id": run.id,
        "run_number": run.run_number,
        "finished_item_id": finished_item.id,
        "finished_item_name": finished_item.name,
        "finished_item_sku": finished_item.sku_code,
        "batches_count": batches,
        "expected_output_packets": expected_output_packets,
        "actual_good_packets": dec_good_packets,
        "damaged_pouches": dec_damaged,
        "cartons_used": cartons_used,
        "yield_variance_pct": yield_variance_pct,
        "yield_is_flagged": yield_is_flagged,
        "has_variance_alert": has_variance_alert,
        "costing": {
            "raw_material_cost_paisa": int(total_raw_material_cost_paisa),
            "raw_material_cost_rupees": paisa_to_rupees(int(total_raw_material_cost_paisa)),
            "pouch_cost_paisa": int(pouch_cost_paisa),
            "pouch_cost_rupees": paisa_to_rupees(int(pouch_cost_paisa)),
            "carton_cost_paisa": int(carton_cost_paisa),
            "carton_cost_rupees": paisa_to_rupees(int(carton_cost_paisa)),
            "total_packaging_cost_paisa": int(total_packaging_cost_paisa),
            "total_packaging_cost_rupees": paisa_to_rupees(int(total_packaging_cost_paisa)),
            "labour_cost_paisa": labour_cost_paisa,
            "labour_cost_rupees": paisa_to_rupees(labour_cost_paisa),
            "overhead_cost_paisa": overhead_cost_paisa,
            "overhead_cost_rupees": paisa_to_rupees(overhead_cost_paisa),
            "total_batch_cost_paisa": int(total_batch_cost_paisa),
            "total_batch_cost_rupees": paisa_to_rupees(int(total_batch_cost_paisa)),
            "cost_per_packet_paisa": cost_per_packet_paisa,
            "cost_per_packet_rupees": paisa_to_rupees(cost_per_packet_paisa),
            "selling_price_paisa": selling_price,
            "selling_price_rupees": paisa_to_rupees(selling_price),
            "gross_margin_pct": gross_margin_pct,
        },
        "raw_materials_breakdown": consumptions_breakdown,
    }


# --- 4. Update Overheads Post-Run ---

def update_production_overheads(
    db: Session,
    run_id: int,
    labour_cost_paisa: int,
    overhead_cost_paisa: int,
    updated_by: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Update labour and overhead costs for an executed run:
    1. Recalculates total batch cost and new cost_per_packet_paisa.
    2. Updates ProductionRun entity.
    3. Updates unit_rate_paisa on the corresponding PROD_OUTPUT entry in stock_ledger.
    4. Logs to audit trail.
    """
    run = db.query(ProductionRun).filter(ProductionRun.id == run_id).first()
    if not run:
        raise ValueError(f"ProductionRun with ID {run_id} not found.")

    mapping = (
        db.query(BOMSKUMapping)
        .filter(BOMSKUMapping.finished_item_id == run.finished_item_id)
        .first()
    )

    # Recompute raw material costs from existing consumptions
    total_raw_material_cost_paisa = Decimal("0.0")
    for pc in run.consumptions:
        rate = get_weighted_average_rate_paisa(db, pc.item_id, as_decimal=True)
        total_raw_material_cost_paisa += quantize_qty(pc.actual_qty * rate, precision=Decimal("1"))

    # Packaging costs
    total_pouches = quantize_qty(run.actual_good_packets + run.damaged_pouches)
    pouch_rate = get_weighted_average_rate_paisa(db, mapping.pouch_item_id, as_decimal=True) if mapping.pouch_item_id else Decimal("0.0")
    pouch_cost = quantize_qty(total_pouches * pouch_rate, precision=Decimal("1"))

    carton_rate = get_weighted_average_rate_paisa(db, mapping.carton_item_id, as_decimal=True) if mapping.carton_item_id else Decimal("0.0")
    carton_cost = quantize_qty(Decimal(str(run.cartons_used)) * carton_rate, precision=Decimal("1"))

    packaging_cost = pouch_cost + carton_cost

    new_total_batch_cost_paisa = (
        total_raw_material_cost_paisa
        + packaging_cost
        + Decimal(str(labour_cost_paisa))
        + Decimal(str(overhead_cost_paisa))
    )

    new_cost_per_packet_paisa = int(
        (new_total_batch_cost_paisa / run.actual_good_packets).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )

    # Update run
    old_labour = run.labour_cost_paisa
    old_overhead = run.overhead_cost_paisa
    run.labour_cost_paisa = labour_cost_paisa
    run.overhead_cost_paisa = overhead_cost_paisa

    # Update PROD_OUTPUT entry in stock_ledger
    output_entry = (
        db.query(StockLedger)
        .filter(
            StockLedger.reference_type == "PRODUCTION_RUN",
            StockLedger.reference_id == run.id,
            StockLedger.transaction_type == StockTransactionType.PROD_OUTPUT.value,
        )
        .first()
    )
    if output_entry:
        output_entry.unit_rate_paisa = new_cost_per_packet_paisa
        output_entry.notes = (
            f"Production Run #{run.run_number} output @ {format_rupees(new_cost_per_packet_paisa)}/pkt "
            f"(Overheads updated: Labour {format_rupees(labour_cost_paisa)}, OH {format_rupees(overhead_cost_paisa)})"
        )

    # Log to audit trail
    audit_entry = AuditLog(
        entity_type="production_runs",
        entity_id=run.id,
        action="UPDATE_OVERHEADS",
        details_json=(
            f'{{"labour_old": {old_labour}, "labour_new": {labour_cost_paisa}, '
            f'"overhead_old": {old_overhead}, "overhead_new": {overhead_cost_paisa}, '
            f'"new_cost_per_packet_paisa": {new_cost_per_packet_paisa}}}'
        ),
        performed_by=updated_by,
    )
    db.add(audit_entry)
    db.flush()

    selling_price = run.finished_item.selling_price_paisa
    gross_margin_pct = Decimal("0.0000")
    if selling_price > 0:
        gross_margin_pct = quantize_qty(
            ((Decimal(selling_price) - Decimal(new_cost_per_packet_paisa)) / Decimal(selling_price)) * Decimal("100.0000")
        )

    return {
        "run_id": run.id,
        "run_number": run.run_number,
        "labour_cost_paisa": labour_cost_paisa,
        "overhead_cost_paisa": overhead_cost_paisa,
        "total_batch_cost_paisa": int(new_total_batch_cost_paisa),
        "total_batch_cost_rupees": paisa_to_rupees(int(new_total_batch_cost_paisa)),
        "cost_per_packet_paisa": new_cost_per_packet_paisa,
        "cost_per_packet_rupees": paisa_to_rupees(new_cost_per_packet_paisa),
        "gross_margin_pct": gross_margin_pct,
    }


# --- 5. Add BOM SKU Mapping (Decoupled Pack Size Creation) ---

def create_bom_sku_mapping(
    db: Session,
    bom_id: int,
    finished_item_id: int,
    expected_yield_packets: Decimal,
    pouch_item_id: Optional[int] = None,
    pouches_per_packet: Decimal = Decimal("1.0"),
    carton_item_id: Optional[int] = None,
    packets_per_carton: int = 20,
) -> BOMSKUMapping:
    """
    Link a new finished SKU (e.g. Murukku 500g) to an existing base BOM recipe.
    Enables adding pack sizes purely via data with zero code modifications!
    """
    bom = db.query(BOMHeader).filter(BOMHeader.id == bom_id).first()
    if not bom:
        raise ValueError(f"BOM with ID {bom_id} not found.")

    finished = db.query(Item).filter(Item.id == finished_item_id).first()
    if not finished:
        raise ValueError(f"Finished item with ID {finished_item_id} not found.")

    existing = (
        db.query(BOMSKUMapping)
        .filter(
            BOMSKUMapping.bom_id == bom_id,
            BOMSKUMapping.finished_item_id == finished_item_id,
        )
        .first()
    )
    if existing:
        raise ValueError(f"Finished SKU {finished.sku_code} is already mapped to BOM {bom.code}.")

    mapping = BOMSKUMapping(
        bom_id=bom_id,
        finished_item_id=finished_item_id,
        expected_yield_packets=quantize_qty(expected_yield_packets),
        pouch_item_id=pouch_item_id,
        pouches_per_packet=quantize_qty(pouches_per_packet),
        carton_item_id=carton_item_id,
        packets_per_carton=packets_per_carton,
    )
    db.add(mapping)
    db.flush()
    return mapping


# --- 6. Two-Step Production Lifecycle (Start Batch -> Complete Batch) ---

def start_production_run(
    db: Session,
    finished_item_id: int,
    batches_count: Decimal,
    raw_materials_issued: List[Dict[str, Any]],
    run_date: Optional[date] = None,
    created_by: Optional[int] = None,
    run_number: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Step A of 2-Step Production Lifecycle:
    Locks in planned vs. actual raw materials issued, immediately deducting raw
    materials from stock_ledger (PROD_ISSUE) and flagging any variance > 3%.
    Batch status is set to 'ISSUED'.
    """
    if run_date is None:
        run_date = date.today()
    elif isinstance(run_date, str):
        try:
            run_date = date.fromisoformat(run_date)
        except Exception:
            run_date = date.today()

    batches = quantize_qty(batches_count)
    if batches <= Decimal("0.0000"):
        raise ValueError("Batches count must be greater than zero.")

    mapping = (
        db.query(BOMSKUMapping)
        .filter(BOMSKUMapping.finished_item_id == finished_item_id)
        .first()
    )
    if not mapping:
        raise ValueError(f"No BOM SKU mapping found for finished good ID {finished_item_id}.")

    bom = mapping.bom
    finished_item = mapping.finished_item

    expected_output_packets = quantize_qty(mapping.expected_yield_packets * batches)

    if not run_number:
        today_str = run_date.strftime("%Y%m%d")
        existing_runs = db.query(ProductionRun).filter(ProductionRun.run_number.like(f"PR-{today_str}-%")).count()
        run_number = f"PR-{today_str}-{existing_runs + 1:04d}"

    actual_inputs_map = {rm["item_id"]: quantize_qty(rm["actual_qty"]) for rm in raw_materials_issued}

    for ing in bom.ingredients:
        if ing.raw_item_id not in actual_inputs_map:
            raise ValueError(f"Missing actual quantity issued for raw material '{ing.raw_item.name}'.")

    has_variance_alert = False
    consumptions_to_save = []
    consumptions_breakdown = []

    for ing in bom.ingredients:
        raw_id = ing.raw_item_id
        raw_item = ing.raw_item
        planned_qty = quantize_qty(ing.standard_qty * batches)
        actual_qty = actual_inputs_map[raw_id]

        var_pct = quantize_qty(
            ((actual_qty - planned_qty) / planned_qty) * Decimal("100.0000")
        )
        is_flagged = abs(var_pct) > VARIANCE_THRESHOLD_PCT
        if is_flagged:
            has_variance_alert = True

        rate_paisa = get_weighted_average_rate_paisa(db, raw_id, as_decimal=True)
        item_cost_paisa = quantize_qty(actual_qty * rate_paisa, precision=Decimal("1"))

        consumptions_breakdown.append({
            "item_id": raw_id,
            "name": raw_item.name,
            "sku_code": raw_item.sku_code,
            "unit": ing.unit,
            "planned_qty": planned_qty,
            "actual_qty": actual_qty,
            "variance_pct": var_pct,
            "is_flagged": is_flagged,
            "weighted_rate_paisa": float(rate_paisa),
            "cost_paisa": int(item_cost_paisa),
            "cost_rupees": paisa_to_rupees(int(item_cost_paisa)),
        })

        consumptions_to_save.append({
            "item_id": raw_id,
            "planned_qty": planned_qty,
            "actual_qty": actual_qty,
            "variance_pct": var_pct,
            "is_flagged": is_flagged,
            "rate_paisa": int(round(rate_paisa)),
        })

    # Create run with status = "ISSUED"
    run = ProductionRun(
        run_number=run_number,
        bom_id=bom.id,
        finished_item_id=finished_item.id,
        batches_count=batches,
        expected_output_packets=expected_output_packets,
        actual_good_packets=Decimal("0.0000"),
        damaged_pouches=Decimal("0.0000"),
        cartons_used=0,
        labour_cost_paisa=0,
        overhead_cost_paisa=0,
        yield_variance_pct=Decimal("0.0000"),
        has_variance_alert=has_variance_alert,
        status="ISSUED",
        run_date=run_date,
        created_by=created_by,
    )
    db.add(run)
    db.flush()

    for cdata in consumptions_to_save:
        pc = ProductionConsumption(
            run_id=run.id,
            item_id=cdata["item_id"],
            planned_qty=cdata["planned_qty"],
            actual_qty=cdata["actual_qty"],
            variance_pct=cdata["variance_pct"],
            is_flagged=cdata["is_flagged"],
        )
        db.add(pc)

    # Deduct raw materials immediately from stock_ledger
    for cdata in consumptions_to_save:
        record_stock_movement(
            db=db,
            item_id=cdata["item_id"],
            transaction_type=StockTransactionType.PROD_ISSUE.value,
            qty_change=-cdata["actual_qty"],
            unit_rate_paisa=cdata["rate_paisa"],
            reference_type="PRODUCTION_RUN",
            reference_id=run.id,
            notes=f"Production Run #{run.run_number} raw material issue (Step 1)",
            created_by=created_by,
            allow_negative=False,
        )

    db.flush()

    audit_entry = AuditLog(
        entity_type="production_runs",
        entity_id=run.id,
        action="START_BATCH",
        details_json=f'{{"run_number": "{run.run_number}", "status": "ISSUED", "batches": "{batches}"}}',
        performed_by=created_by,
    )
    db.add(audit_entry)

    return {
        "run_id": run.id,
        "run_number": run.run_number,
        "finished_item_id": finished_item.id,
        "finished_item_name": finished_item.name,
        "finished_item_sku": finished_item.sku_code,
        "batches_count": batches,
        "expected_output_packets": expected_output_packets,
        "status": "ISSUED",
        "has_variance_alert": has_variance_alert,
        "raw_materials_breakdown": consumptions_breakdown,
    }


def complete_production_run(
    db: Session,
    run_id: int,
    actual_good_packets: Decimal,
    damaged_pouches: Decimal = Decimal("0.0"),
    cartons_used: int = 0,
    labour_cost_paisa: int = 0,
    overhead_cost_paisa: int = 0,
    updated_by: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Step B of 2-Step Production Lifecycle:
    Records output good packets, damaged pouches, cartons used, labour and overhead costs.
    Deducts packaging from stock_ledger (PROD_ISSUE), adds finished goods to stock_ledger (PROD_OUTPUT)
    with exact absorbed unit cost, flags output yield variance > 3%, and marks run COMPLETED.
    """
    run = db.query(ProductionRun).filter(ProductionRun.id == run_id).first()
    if not run:
        raise ValueError(f"Production Run with ID {run_id} not found.")

    if run.status == "COMPLETED":
        raise ValueError(f"Production Run #{run.run_number} is already completed.")

    dec_good_packets = quantize_qty(actual_good_packets)
    if dec_good_packets <= Decimal("0.0000"):
        raise ValueError("Actual good packets must be greater than zero.")

    dec_damaged = quantize_qty(damaged_pouches)

    mapping = (
        db.query(BOMSKUMapping)
        .filter(BOMSKUMapping.finished_item_id == run.finished_item_id)
        .first()
    )
    if not mapping:
        raise ValueError(f"No BOM SKU mapping found for finished good ID {run.finished_item_id}.")

    finished_item = mapping.finished_item

    # Compute yield variance
    yield_variance_pct = quantize_qty(
        ((dec_good_packets - run.expected_output_packets) / run.expected_output_packets) * Decimal("100.0000")
    )
    yield_is_flagged = abs(yield_variance_pct) > VARIANCE_THRESHOLD_PCT

    # Raw material cost from existing consumptions
    total_raw_material_cost_paisa = Decimal("0.0")
    consumptions_breakdown = []
    for c in run.consumptions:
        rate_paisa = get_weighted_average_rate_paisa(db, c.item_id, as_decimal=True)
        item_cost_paisa = quantize_qty(c.actual_qty * rate_paisa, precision=Decimal("1"))
        total_raw_material_cost_paisa += item_cost_paisa
        consumptions_breakdown.append({
            "item_id": c.item_id,
            "name": c.raw_item.name if hasattr(c, "raw_item") and c.raw_item else f"Item #{c.item_id}",
            "sku_code": c.raw_item.sku_code if hasattr(c, "raw_item") and c.raw_item else "",
            "planned_qty": c.planned_qty,
            "actual_qty": c.actual_qty,
            "variance_pct": c.variance_pct,
            "is_flagged": c.is_flagged,
            "cost_paisa": int(item_cost_paisa),
            "cost_rupees": paisa_to_rupees(int(item_cost_paisa)),
        })

    # Packaging deductions
    total_pouches_consumed = quantize_qty(dec_good_packets + dec_damaged)
    pouch_cost_paisa = Decimal("0.0")
    pouch_rate_paisa = Decimal("0.0")

    if mapping.pouch_item and total_pouches_consumed > Decimal("0.0000"):
        pouch_rate_paisa = get_weighted_average_rate_paisa(db, mapping.pouch_item_id, as_decimal=True)
        pouch_cost_paisa = quantize_qty(total_pouches_consumed * pouch_rate_paisa, precision=Decimal("1"))
        record_stock_movement(
            db=db,
            item_id=mapping.pouch_item_id,
            transaction_type=StockTransactionType.PROD_ISSUE.value,
            qty_change=-total_pouches_consumed,
            unit_rate_paisa=int(round(pouch_rate_paisa)),
            reference_type="PRODUCTION_RUN",
            reference_id=run.id,
            notes=f"Production Run #{run.run_number} pouches (Good: {dec_good_packets}, Damaged: {dec_damaged})",
            created_by=updated_by,
            allow_negative=False,
        )

    dec_cartons = Decimal(str(cartons_used))
    carton_cost_paisa = Decimal("0.0")
    carton_rate_paisa = Decimal("0.0")

    if mapping.carton_item and cartons_used > 0:
        carton_rate_paisa = get_weighted_average_rate_paisa(db, mapping.carton_item_id, as_decimal=True)
        carton_cost_paisa = quantize_qty(dec_cartons * carton_rate_paisa, precision=Decimal("1"))
        record_stock_movement(
            db=db,
            item_id=mapping.carton_item_id,
            transaction_type=StockTransactionType.PROD_ISSUE.value,
            qty_change=-dec_cartons,
            unit_rate_paisa=int(round(carton_rate_paisa)),
            reference_type="PRODUCTION_RUN",
            reference_id=run.id,
            notes=f"Production Run #{run.run_number} cartons issue",
            created_by=updated_by,
            allow_negative=False,
        )

    total_packaging_cost_paisa = pouch_cost_paisa + carton_cost_paisa

    total_batch_cost_paisa = (
        total_raw_material_cost_paisa
        + total_packaging_cost_paisa
        + Decimal(str(labour_cost_paisa))
        + Decimal(str(overhead_cost_paisa))
    )

    cost_per_packet_paisa = int(
        (total_batch_cost_paisa / dec_good_packets).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )

    selling_price = finished_item.selling_price_paisa
    gross_margin_pct = Decimal("0.0000")
    if selling_price > 0:
        gross_margin_pct = quantize_qty(
            ((Decimal(selling_price) - Decimal(cost_per_packet_paisa)) / Decimal(selling_price)) * Decimal("100.0000")
        )

    # Finished Goods output to Stock Ledger
    record_stock_movement(
        db=db,
        item_id=finished_item.id,
        transaction_type=StockTransactionType.PROD_OUTPUT.value,
        qty_change=dec_good_packets,
        unit_rate_paisa=cost_per_packet_paisa,
        reference_type="PRODUCTION_RUN",
        reference_id=run.id,
        notes=f"Production Run #{run.run_number} output @ {format_rupees(cost_per_packet_paisa)}/pkt",
        created_by=updated_by,
        allow_negative=False,
    )

    # Update run record
    run.actual_good_packets = dec_good_packets
    run.damaged_pouches = dec_damaged
    run.cartons_used = cartons_used
    run.labour_cost_paisa = labour_cost_paisa
    run.overhead_cost_paisa = overhead_cost_paisa
    run.yield_variance_pct = yield_variance_pct
    run.has_variance_alert = run.has_variance_alert or yield_is_flagged
    run.status = "COMPLETED"

    audit_entry = AuditLog(
        entity_type="production_runs",
        entity_id=run.id,
        action="COMPLETE_BATCH",
        details_json=(
            f'{{"run_number": "{run.run_number}", "status": "COMPLETED", '
            f'"good_packets": "{dec_good_packets}", "cost_per_packet_paisa": {cost_per_packet_paisa}}}'
        ),
        performed_by=updated_by,
    )
    db.add(audit_entry)
    db.flush()

    return {
        "run_id": run.id,
        "run_number": run.run_number,
        "finished_item_id": finished_item.id,
        "finished_item_name": finished_item.name,
        "finished_item_sku": finished_item.sku_code,
        "batches_count": run.batches_count,
        "expected_output_packets": run.expected_output_packets,
        "actual_good_packets": dec_good_packets,
        "damaged_pouches": dec_damaged,
        "cartons_used": cartons_used,
        "yield_variance_pct": yield_variance_pct,
        "yield_is_flagged": yield_is_flagged,
        "has_variance_alert": run.has_variance_alert,
        "status": "COMPLETED",
        "costing": {
            "raw_material_cost_paisa": int(total_raw_material_cost_paisa),
            "raw_material_cost_rupees": paisa_to_rupees(int(total_raw_material_cost_paisa)),
            "pouch_cost_paisa": int(pouch_cost_paisa),
            "pouch_cost_rupees": paisa_to_rupees(int(pouch_cost_paisa)),
            "carton_cost_paisa": int(carton_cost_paisa),
            "carton_cost_rupees": paisa_to_rupees(int(carton_cost_paisa)),
            "total_packaging_cost_paisa": int(total_packaging_cost_paisa),
            "total_packaging_cost_rupees": paisa_to_rupees(int(total_packaging_cost_paisa)),
            "labour_cost_paisa": labour_cost_paisa,
            "labour_cost_rupees": paisa_to_rupees(labour_cost_paisa),
            "overhead_cost_paisa": overhead_cost_paisa,
            "overhead_cost_rupees": paisa_to_rupees(overhead_cost_paisa),
            "total_batch_cost_paisa": int(total_batch_cost_paisa),
            "total_batch_cost_rupees": paisa_to_rupees(int(total_batch_cost_paisa)),
            "cost_per_packet_paisa": cost_per_packet_paisa,
            "cost_per_packet_rupees": paisa_to_rupees(cost_per_packet_paisa),
            "selling_price_paisa": selling_price,
            "selling_price_rupees": paisa_to_rupees(selling_price),
            "gross_margin_pct": gross_margin_pct,
        },
        "raw_materials_breakdown": consumptions_breakdown,
    }


# --- 7. BOM Formula Versioning & Management ---

def clone_bom_version(
    db: Session,
    bom_id: int,
    new_code: Optional[str] = None,
    new_name: Optional[str] = None,
    ingredient_adjustments: Optional[List[Dict[str, Any]]] = None,
    archive_previous: bool = True,
) -> BOMHeader:
    """
    Clone an existing BOM recipe into a new version (V2.0, etc.) with full audit traceability.
    """
    old_bom = db.query(BOMHeader).filter(BOMHeader.id == bom_id).first()
    if not old_bom:
        raise ValueError(f"BOM with ID {bom_id} not found.")

    new_version = old_bom.version + 1
    new_ver_label = f"V{new_version}.0"
    code_to_use = new_code or f"{old_bom.code}-V{new_version}"
    name_to_use = new_name or f"{old_bom.name} ({new_ver_label})"

    existing_code = db.query(BOMHeader).filter(BOMHeader.code == code_to_use).first()
    if existing_code:
        code_to_use = f"{code_to_use}-{int(datetime.now().timestamp()) % 10000}"

    if archive_previous:
        old_bom.status = "ARCHIVED"
        old_bom.is_active = False

    new_bom = BOMHeader(
        code=code_to_use,
        name=name_to_use,
        name_ta=old_bom.name_ta,
        version=new_version,
        version_label=new_ver_label,
        status="ACTIVE",
        is_active=True,
    )
    db.add(new_bom)
    db.flush()

    adj_map = {}
    if ingredient_adjustments:
        adj_map = {adj["item_id"]: quantize_qty(adj["standard_qty"]) for adj in ingredient_adjustments}

    for ing in old_bom.ingredients:
        sqty = adj_map.get(ing.raw_item_id, ing.standard_qty)
        new_ing = BOMIngredient(
            bom_id=new_bom.id,
            raw_item_id=ing.raw_item_id,
            standard_qty=sqty,
            unit=ing.unit,
        )
        db.add(new_ing)

    for sm in old_bom.sku_mappings:
        new_sm = BOMSKUMapping(
            bom_id=new_bom.id,
            finished_item_id=sm.finished_item_id,
            expected_yield_packets=sm.expected_yield_packets,
            pouch_item_id=sm.pouch_item_id,
            pouches_per_packet=sm.pouches_per_packet,
            carton_item_id=sm.carton_item_id,
            packets_per_carton=sm.packets_per_carton,
        )
        db.add(new_sm)

    db.flush()
    return new_bom


def update_bom_status(db: Session, bom_id: int, status_str: str) -> BOMHeader:
    """Update status of a BOM recipe (ACTIVE, ARCHIVED, DRAFT)."""
    bom = db.query(BOMHeader).filter(BOMHeader.id == bom_id).first()
    if not bom:
        raise ValueError(f"BOM with ID {bom_id} not found.")

    bom.status = status_str.upper()
    bom.is_active = (bom.status == "ACTIVE")
    db.flush()
    return bom


def create_bom_recipe(
    db: Session,
    code: str,
    name: str,
    name_ta: Optional[str] = None,
    ingredients: Optional[List[Dict[str, Any]]] = None,
    sku_mappings: Optional[List[Dict[str, Any]]] = None,
) -> BOMHeader:
    """Create a new base BOM recipe with ingredients and SKU mappings."""
    existing = db.query(BOMHeader).filter(BOMHeader.code == code).first()
    if existing:
        raise ValueError(f"BOM with code '{code}' already exists.")

    bom = BOMHeader(
        code=code,
        name=name,
        name_ta=name_ta,
        version=1,
        version_label="V1.0",
        status="ACTIVE",
        is_active=True,
    )
    db.add(bom)
    db.flush()

    if ingredients:
        for ing in ingredients:
            bom_ing = BOMIngredient(
                bom_id=bom.id,
                raw_item_id=ing["raw_item_id"],
                standard_qty=quantize_qty(ing["standard_qty"]),
                unit=ing.get("unit", "kg"),
            )
            db.add(bom_ing)

    if sku_mappings:
        for sm in sku_mappings:
            mapping = BOMSKUMapping(
                bom_id=bom.id,
                finished_item_id=sm["finished_item_id"],
                expected_yield_packets=quantize_qty(sm["expected_yield_packets"]),
                pouch_item_id=sm.get("pouch_item_id"),
                pouches_per_packet=quantize_qty(sm.get("pouches_per_packet", Decimal("1.0"))),
                carton_item_id=sm.get("carton_item_id"),
                packets_per_carton=sm.get("packets_per_carton", 20),
            )
            db.add(mapping)

    db.flush()
    return bom


