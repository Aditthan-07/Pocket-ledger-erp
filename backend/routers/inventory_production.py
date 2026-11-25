"""
Pocket Ledger ERP - Inventory & Production API Router
Endpoints for live stock balances, append-only ledger history,
supplier purchases, BOM pack-size configuration, production run preview,
run execution with 3% variance flags, and overheads adjustment.
"""

from decimal import Decimal
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import (
    StockLedger,
    Purchase,
    BOMHeader,
    BOMSKUMapping,
    ProductionRun,
    Item,
    Party,
)
from backend.schemas import (
    StockBalanceItem,
    StockLedgerResponse,
    PurchaseCreate,
    PurchaseResponse,
    BOMHeaderResponse,
    BOMSKUMappingResponse,
    BOMSKUMappingCreate,
    BOMCreateRequest,
    BOMCloneRequest,
    BOMStatusUpdateRequest,
    ProductionPreviewRequest,
    ProductionPreviewResponse,
    ProductionRunExecuteRequest,
    ProductionRunExecuteResponse,
    ProductionBatchStartRequest,
    ProductionBatchStartResponse,
    ProductionBatchCompleteRequest,
    OverheadsPatchRequest,
    OverheadsPatchResponse,
)
from backend.services.ledger_service import (
    get_all_stock_balances,
    get_item_balance,
)
from backend.services.production_service import (
    create_purchase,
    preview_production_run,
    execute_production_run,
    start_production_run,
    complete_production_run,
    update_production_overheads,
    create_bom_sku_mapping,
    create_bom_recipe,
    clone_bom_version,
    update_bom_status,
)
from backend.units import paisa_to_rupees

router = APIRouter(prefix="/api", tags=["Inventory & Production"])


# --- 1. Inventory Balances & Ledger Endpoints ---

@router.get("/inventory/balances", response_model=List[StockBalanceItem])
def get_inventory_balances(db: Session = Depends(get_db)):
    """
    Retrieve live stock balances for all items.
    Stock is derived strictly from append-only stock_ledger via SUM(qty_change).
    """
    return get_all_stock_balances(db)


@router.get("/inventory/ledger", response_model=List[StockLedgerResponse])
def get_stock_ledger(
    item_id: Optional[int] = Query(None, description="Filter by item ID"),
    transaction_type: Optional[str] = Query(None, description="Filter by transaction type"),
    reference_type: Optional[str] = Query(None, description="Filter by reference type"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Retrieve append-only stock ledger entries with source reference audit links.
    """
    query = db.query(StockLedger)
    if item_id is not None:
        query = query.filter(StockLedger.item_id == item_id)
    if transaction_type is not None:
        query = query.filter(StockLedger.transaction_type == transaction_type)
    if reference_type is not None:
        query = query.filter(StockLedger.reference_type == reference_type)

    return query.order_by(StockLedger.id.desc()).offset(offset).limit(limit).all()


# --- 2. Purchases Endpoints ---

@router.post("/purchases", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
def record_purchase(payload: PurchaseCreate, db: Session = Depends(get_db)):
    """
    Record an inbound supplier purchase, append a PURCHASE entry to stock_ledger,
    and log to audit trail.
    """
    try:
        purchase = create_purchase(
            db=db,
            bill_no=payload.bill_no,
            supplier_id=payload.supplier_id,
            item_id=payload.item_id,
            qty=payload.qty,
            unit_rate_paisa=payload.unit_rate_paisa,
            purchase_date=payload.purchase_date,
            created_by=payload.created_by,
        )
        db.commit()
        db.refresh(purchase)
        return PurchaseResponse(
            id=purchase.id,
            bill_no=purchase.bill_no,
            supplier_id=purchase.supplier_id,
            supplier_name=purchase.supplier.name if purchase.supplier else f"Supplier #{purchase.supplier_id}",
            item_id=purchase.item_id,
            item_name=purchase.item.name if purchase.item else f"Item #{purchase.item_id}",
            item_sku=purchase.item.sku_code if purchase.item else None,
            qty=purchase.qty,
            unit_rate_paisa=purchase.unit_rate_paisa,
            total_paisa=purchase.total_paisa,
            purchase_date=purchase.purchase_date,
            created_by=purchase.created_by,
            created_at=purchase.created_at,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Purchase failed: {exc}")


@router.get("/purchases", response_model=List[PurchaseResponse])
def list_purchases(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List recorded supplier purchases in reverse chronological order with resolved party and item names."""
    purchases = db.query(Purchase).order_by(Purchase.id.desc()).offset(offset).limit(limit).all()
    results = []
    for p in purchases:
        results.append(
            PurchaseResponse(
                id=p.id,
                bill_no=p.bill_no,
                supplier_id=p.supplier_id,
                supplier_name=p.supplier.name if p.supplier else f"Supplier #{p.supplier_id}",
                item_id=p.item_id,
                item_name=p.item.name if p.item else f"Item #{p.item_id}",
                item_sku=p.item.sku_code if p.item else None,
                qty=p.qty,
                unit_rate_paisa=p.unit_rate_paisa,
                total_paisa=p.total_paisa,
                purchase_date=p.purchase_date,
                created_by=p.created_by,
                created_at=p.created_at,
            )
        )
    return results


# --- 3. BOM & Pack Size Management Endpoints ---

@router.get("/boms", response_model=List[BOMHeaderResponse])
def list_boms(db: Session = Depends(get_db)):
    """List base dough/mix recipes with ingredients and finished SKU mappings."""
    return db.query(BOMHeader).order_by(BOMHeader.id).all()


@router.post("/boms/sku-mapping", response_model=BOMSKUMappingResponse, status_code=status.HTTP_201_CREATED)
def add_bom_sku_mapping(payload: BOMSKUMappingCreate, db: Session = Depends(get_db)):
    """
    Add a new pack size (e.g. Murukku 500g) mapped to an existing base BOM recipe.
    Zero code change needed - pure data configuration.
    """
    try:
        mapping = create_bom_sku_mapping(
            db=db,
            bom_id=payload.bom_id,
            finished_item_id=payload.finished_item_id,
            expected_yield_packets=payload.expected_yield_packets,
            pouch_item_id=payload.pouch_item_id,
            pouches_per_packet=payload.pouches_per_packet,
            carton_item_id=payload.carton_item_id,
            packets_per_carton=payload.packets_per_carton,
        )
        db.commit()
        db.refresh(mapping)
        return mapping
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/boms", response_model=BOMHeaderResponse, status_code=status.HTTP_201_CREATED)
def create_bom(payload: BOMCreateRequest, db: Session = Depends(get_db)):
    """Create a new base BOM formula recipe with standard ingredients and SKU mappings."""
    try:
        ings = [ing.model_dump() for ing in payload.ingredients]
        skus = [sm.model_dump() for sm in payload.sku_mappings]
        bom = create_bom_recipe(
            db=db,
            code=payload.code,
            name=payload.name,
            name_ta=payload.name_ta,
            ingredients=ings,
            sku_mappings=skus,
        )
        db.commit()
        db.refresh(bom)
        return bom
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create BOM: {exc}")


@router.post("/boms/{bom_id}/clone", response_model=BOMHeaderResponse, status_code=status.HTTP_201_CREATED)
def clone_bom(bom_id: int, payload: BOMCloneRequest, db: Session = Depends(get_db)):
    """
    Clone an existing BOM formula recipe into a new version (e.g. V1.0 -> V2.0).
    Allows ingredient adjustments and archives the previous version.
    """
    try:
        new_bom = clone_bom_version(
            db=db,
            bom_id=bom_id,
            new_code=payload.new_code,
            new_name=payload.new_name,
            ingredient_adjustments=payload.ingredient_adjustments,
            archive_previous=payload.archive_previous,
        )
        db.commit()
        db.refresh(new_bom)
        return new_bom
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to clone BOM: {exc}")


@router.patch("/boms/{bom_id}/status", response_model=BOMHeaderResponse)
def patch_bom_status(bom_id: int, payload: BOMStatusUpdateRequest, db: Session = Depends(get_db)):
    """Update status of a BOM recipe (ACTIVE, ARCHIVED, DRAFT)."""
    try:
        bom = update_bom_status(db=db, bom_id=bom_id, status_str=payload.status)
        db.commit()
        db.refresh(bom)
        return bom
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# --- 4. Production Run Preview & Execution Endpoints ---

@router.post("/production/preview", response_model=ProductionPreviewResponse)
def preview_production(payload: ProductionPreviewRequest, db: Session = Depends(get_db)):
    """
    Dry-run BOM scaling and availability check.
    Calculates expected packet yield, required raw materials, packaging, and flags shortages.
    """
    try:
        preview = preview_production_run(
            db=db,
            finished_item_id=payload.finished_item_id,
            batches_count=payload.batches_count,
        )
        return preview
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post("/production/runs", response_model=ProductionRunExecuteResponse, status_code=status.HTTP_201_CREATED)
def run_production(payload: ProductionRunExecuteRequest, db: Session = Depends(get_db)):
    """
    Execute a production run (Single-call combined flow):
    - Deducts raw materials, pouches (good + damaged), and cartons from stock_ledger (PROD_ISSUE).
    - Adds good packets to stock_ledger (PROD_OUTPUT) with exact unit cost in unit_rate_paisa.
    - Evaluates 3% tolerance rule on ingredient consumption and output yield.
    - Returns full costing breakdown and variance alerts.
    """
    try:
        raw_issued = [{"item_id": rm.item_id, "actual_qty": rm.actual_qty} for rm in payload.raw_materials_issued]
        result = execute_production_run(
            db=db,
            finished_item_id=payload.finished_item_id,
            batches_count=payload.batches_count,
            raw_materials_issued=raw_issued,
            actual_good_packets=payload.actual_good_packets,
            damaged_pouches=payload.damaged_pouches,
            cartons_used=payload.cartons_used,
            labour_cost_paisa=payload.labour_cost_paisa,
            overhead_cost_paisa=payload.overhead_cost_paisa,
            run_date=payload.run_date,
            created_by=payload.created_by,
            run_number=payload.run_number,
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Production execution failed: {exc}")


@router.post("/production/runs/start", response_model=ProductionBatchStartResponse, status_code=status.HTTP_201_CREATED)
def start_production_batch(payload: ProductionBatchStartRequest, db: Session = Depends(get_db)):
    """
    Step A: Start a production batch (Status: ISSUED).
    Issues raw materials, locks input quantities, and verifies 3% recipe tolerance.
    """
    try:
        raw_issued = [{"item_id": rm.item_id, "actual_qty": rm.actual_qty} for rm in payload.raw_materials_issued]
        result = start_production_run(
            db=db,
            finished_item_id=payload.finished_item_id,
            batches_count=payload.batches_count,
            raw_materials_issued=raw_issued,
            run_date=payload.run_date,
            run_number=payload.run_number,
            created_by=payload.created_by,
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to start batch: {exc}")


@router.post("/production/runs/{run_id}/complete", response_model=ProductionRunExecuteResponse)
def complete_production_batch(run_id: int, payload: ProductionBatchCompleteRequest, db: Session = Depends(get_db)):
    """
    Step B: Complete an issued production batch (Status: COMPLETED).
    Records good packets, packaging scrap, carton usage, overheads, and calculates unit cost.
    """
    try:
        result = complete_production_run(
            db=db,
            run_id=run_id,
            actual_good_packets=payload.actual_good_packets,
            damaged_pouches=payload.damaged_pouches,
            cartons_used=payload.cartons_used,
            labour_cost_paisa=payload.labour_cost_paisa,
            overhead_cost_paisa=payload.overhead_cost_paisa,
            updated_by=payload.updated_by,
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to complete batch: {exc}")


@router.get("/production/runs")
def list_production_runs(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """List executed production runs with variance alerts and batch details."""
    runs = db.query(ProductionRun).order_by(ProductionRun.id.desc()).offset(offset).limit(limit).all()
    results = []
    for r in runs:
        # Get output stock entry to fetch recorded cost_per_packet_paisa
        output_entry = (
            db.query(StockLedger)
            .filter(
                StockLedger.reference_type == "PRODUCTION_RUN",
                StockLedger.reference_id == r.id,
                StockLedger.transaction_type == "PROD_OUTPUT",
            )
            .first()
        )
        unit_rate = output_entry.unit_rate_paisa if output_entry else 0

        # Compute costing details for completed runs
        costing_data = None
        if (r.status and r.status.upper() == "COMPLETED") or not r.status:
            raw_entries = (
                db.query(StockLedger)
                .filter(
                    StockLedger.reference_type == "PRODUCTION_RUN",
                    StockLedger.reference_id == r.id,
                    StockLedger.transaction_type == "PROD_ISSUE",
                )
                .all()
            )
            raw_cost_paisa = 0
            pouch_cost_paisa = 0
            carton_cost_paisa = 0
            for entry in raw_entries:
                cost_paisa = int(abs(entry.qty_change) * (entry.unit_rate_paisa or 0))
                if entry.item:
                    sku = (entry.item.sku_code or "").upper()
                    name = (entry.item.name or "").lower()
                    cat = getattr(entry.item.category, "value", str(entry.item.category)).upper()
                    if sku.startswith("PKG-POUCH") or (cat == "PACKAGING" and "pouch" in name):
                        pouch_cost_paisa += cost_paisa
                    elif sku.startswith("PKG-CTN") or "carton" in name:
                        carton_cost_paisa += cost_paisa
                    else:
                        raw_cost_paisa += cost_paisa
                else:
                    raw_cost_paisa += cost_paisa

            total_batch_cost = raw_cost_paisa + pouch_cost_paisa + carton_cost_paisa + (r.labour_cost_paisa or 0) + (r.overhead_cost_paisa or 0)
            good_pkts = float(r.actual_good_packets or 1)
            cost_per_pkt = unit_rate if unit_rate > 0 else (int(total_batch_cost / good_pkts) if good_pkts > 0 else 0)
            selling_price = r.finished_item.selling_price_paisa if r.finished_item else 5000
            margin_pct = round(((selling_price - cost_per_pkt) / selling_price) * 100, 2) if selling_price > 0 else 0.0

            costing_data = {
                "raw_material_cost_paisa": raw_cost_paisa,
                "raw_material_cost_rupees": paisa_to_rupees(raw_cost_paisa),
                "pouch_cost_paisa": pouch_cost_paisa,
                "pouch_cost_rupees": paisa_to_rupees(pouch_cost_paisa),
                "carton_cost_paisa": carton_cost_paisa,
                "carton_cost_rupees": paisa_to_rupees(carton_cost_paisa),
                "total_packaging_cost_paisa": pouch_cost_paisa + carton_cost_paisa,
                "total_packaging_cost_rupees": paisa_to_rupees(pouch_cost_paisa + carton_cost_paisa),
                "labour_cost_paisa": r.labour_cost_paisa or 0,
                "labour_cost_rupees": paisa_to_rupees(r.labour_cost_paisa or 0),
                "overhead_cost_paisa": r.overhead_cost_paisa or 0,
                "overhead_cost_rupees": paisa_to_rupees(r.overhead_cost_paisa or 0),
                "total_batch_cost_paisa": total_batch_cost,
                "total_batch_cost_rupees": paisa_to_rupees(total_batch_cost),
                "cost_per_packet_paisa": cost_per_pkt,
                "cost_per_packet_rupees": paisa_to_rupees(cost_per_pkt),
                "selling_price_paisa": selling_price,
                "selling_price_rupees": paisa_to_rupees(selling_price),
                "gross_margin_pct": float(margin_pct),
            }

        results.append(
            {
                "id": r.id,
                "run_number": r.run_number,
                "status": r.status,
                "finished_item_id": r.finished_item_id,
                "finished_item_name": r.finished_item.name,
                "finished_item_sku": r.finished_item.sku_code,
                "batches_count": r.batches_count,
                "expected_output_packets": r.expected_output_packets,
                "actual_good_packets": r.actual_good_packets,
                "damaged_pouches": r.damaged_pouches,
                "cartons_used": r.cartons_used,
                "yield_variance_pct": r.yield_variance_pct,
                "has_variance_alert": r.has_variance_alert,
                "cost_per_packet_paisa": unit_rate,
                "cost_per_packet_rupees": paisa_to_rupees(unit_rate),
                "labour_cost_paisa": r.labour_cost_paisa,
                "overhead_cost_paisa": r.overhead_cost_paisa,
                "costing": costing_data,
                "run_date": r.run_date,
                "created_at": r.created_at,
            }
        )
    return results


# --- 5. Overheads Post-Run Adjustment ---

@router.patch("/production/runs/{run_id}/overheads", response_model=OverheadsPatchResponse)
def patch_production_overheads(
    run_id: int,
    payload: OverheadsPatchRequest,
    db: Session = Depends(get_db),
):
    """
    Add or update labour and overhead costs post-run:
    Recalculates total batch cost and unit cost per packet,
    updates PROD_OUTPUT entry in stock_ledger, and records audit trail.
    """
    try:
        result = update_production_overheads(
            db=db,
            run_id=run_id,
            labour_cost_paisa=payload.labour_cost_paisa,
            overhead_cost_paisa=payload.overhead_cost_paisa,
            updated_by=payload.updated_by,
        )
        db.commit()
        return result
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update overheads: {exc}")
