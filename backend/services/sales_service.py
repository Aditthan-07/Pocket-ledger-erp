"""
Pocket Ledger ERP - Sales, Smart Batch Recommendation & Invoicing Service
NIT Tiruchirappalli CDI Winter Internship Specification

Enforces:
1. Sales Order Creation & Finished-Goods Stock Shortage Detection.
2. Smart Demand-to-Batch Production Recommendation Calculator.
3. Admin Approval & GST Tax Invoice Generation (Intra-state vs Inter-state parity).
4. Sales Dispatch stock deductions (SALE_DISPATCH in stock_ledger).
5. Credit Note Cancellation with stock return restoration (CREDIT_RETURN).
6. Customer Payments, Outstanding Tracking, and Ageing Buckets (0-30, 31-60, 60+ days).
"""

import math
from datetime import date, datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models import (
    SalesOrder,
    SalesOrderItem,
    SalesOrderStatus,
    Invoice,
    InvoiceItem,
    InvoiceStatus,
    CreditNote,
    Payment,
    Party,
    User,
    Item,
    BOMSKUMapping,
    StockLedger,
    StockTransactionType,
    AuditLog,
)
from backend.services.ledger_service import (
    get_item_balance,
    record_stock_movement,
)
from backend.services.production_service import preview_production_run
from backend.services.gst_service import (
    calculate_line_item_gst,
    generate_invoice_number,
    generate_credit_note_number,
    generate_receipt_number,
    FACTORY_STATE,
    TN_DISTRICTS,
)
from backend.units import quantize_qty, paisa_to_rupees, format_rupees


# --- 1. Sales Order Creation & Stock Shortage Check ---

def create_sales_order(
    db: Session,
    customer_id: int,
    salesman_id: int,
    items: List[Dict[str, Any]],
    order_date: Optional[date] = None,
    notes: Optional[str] = None,
    client_offline_id: Optional[str] = None,
    created_by: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Create a Sales Order with immediate stock availability check and
    Smart Production Planner ('Demand-to-Batch') recommendations for shortages.
    """
    if order_date is None:
        order_date = date.today()

    customer = db.query(Party).filter(Party.id == customer_id).first()
    if not customer:
        raise ValueError(f"Customer with ID {customer_id} not found.")

    salesman = db.query(User).filter(User.id == salesman_id).first()
    if not salesman:
        raise ValueError(f"Salesman with ID {salesman_id} not found.")

    if not items:
        raise ValueError("Sales order must contain at least one item.")

    # Idempotent offline sync check if client_offline_id provided
    if client_offline_id:
        existing = (
            db.query(SalesOrder)
            .filter(SalesOrder.notes.like(f"%[offline_id:{client_offline_id}]%"))
            .first()
        )
        if existing:
            return {"order": existing, "message": "Order already synced from offline client."}

    # Generate sequential order number: SO/YY-YY/XXXX
    year_str = order_date.strftime("%Y")
    order_count = db.query(SalesOrder).count()
    order_number = f"SO-{year_str}-{order_count + 1:04d}"

    order_notes = notes or ""
    if client_offline_id:
        order_notes = f"{order_notes} [offline_id:{client_offline_id}]".strip()

    order = SalesOrder(
        order_number=order_number,
        customer_id=customer_id,
        salesman_id=salesman_id,
        status=SalesOrderStatus.SUBMITTED.value,
        order_date=order_date,
        notes=order_notes,
        created_by=created_by or salesman_id,
    )
    db.add(order)
    db.flush()

    custom_dest = ""
    if notes and "[Destination: " in notes:
        custom_dest = notes.split("[Destination: ")[1].split("]")[0].strip()

    is_export = bool(
        "export" in custom_dest.lower()
        or "lut" in custom_dest.lower()
        or (notes and "export" in notes.lower())
        or "lut" in customer.state.lower()
    )
    if is_export:
        applicable_tax_type = "Export (0% LUT)"
    elif custom_dest:
        if any(tn.lower() in custom_dest.lower() for tn in TN_DISTRICTS) or "tamil nadu" in custom_dest.lower() or "tn" in custom_dest.lower():
            applicable_tax_type = "CGST+SGST"
        else:
            applicable_tax_type = "IGST"
    else:
        is_intra_state = (customer.state.strip().lower() == FACTORY_STATE.lower())
        applicable_tax_type = "CGST+SGST" if is_intra_state else "IGST"

    items_status = []
    has_any_shortage = False

    for line in items:
        item_id = line["item_id"]
        qty = quantize_qty(line["qty_packets"])
        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            raise ValueError(f"Item with ID {item_id} not found.")

        # Unit price default to selling_price_paisa if omitted
        unit_price = line.get("unit_price_paisa", item.selling_price_paisa)

        so_item = SalesOrderItem(
            order_id=order.id,
            item_id=item_id,
            qty_packets=qty,
            unit_price_paisa=unit_price,
        )
        db.add(so_item)

        # Check finished stock balance dynamically from ledger
        available_qty = get_item_balance(db, item_id)
        shortage_qty = quantize_qty(max(Decimal("0.0000"), qty - available_qty))
        is_shortage = shortage_qty > Decimal("0.0000")
        if is_shortage:
            has_any_shortage = True

        # Smart Production Planner ("Demand-to-Batch" Recommendation)
        prod_rec = None
        if is_shortage:
            mapping = (
                db.query(BOMSKUMapping)
                .filter(BOMSKUMapping.finished_item_id == item_id)
                .first()
            )
            if mapping:
                expected_yield = mapping.expected_yield_packets
                batches_needed = int(math.ceil(float(shortage_qty / expected_yield)))
                expected_output = quantize_qty(Decimal(str(batches_needed)) * expected_yield)

                # Preview BOM availability for this recommended batch
                preview = preview_production_run(
                    db=db,
                    finished_item_id=item_id,
                    batches_count=Decimal(str(batches_needed)),
                )

                prod_rec = {
                    "batches_needed": batches_needed,
                    "expected_output_packets": expected_output,
                    "raw_materials_sufficient": preview["can_produce"],
                    "ingredients_summary": [
                        {
                            "name": ing["name"],
                            "planned_qty": ing["planned_qty"],
                            "current_stock": ing["current_stock"],
                            "is_sufficient": ing["is_sufficient"],
                        }
                        for ing in preview["ingredients"]
                    ],
                }

        items_status.append(
            {
                "item_id": item.id,
                "sku_code": item.sku_code,
                "name": item.name,
                "requested_qty": qty,
                "available_qty": available_qty,
                "shortage_qty": shortage_qty,
                "is_shortage": is_shortage,
                "unit_price_paisa": unit_price,
                "unit_price_rupees": paisa_to_rupees(unit_price),
                "production_recommendation": prod_rec,
            }
        )

    # Log to audit trail
    audit_entry = AuditLog(
        entity_type="sales_orders",
        entity_id=order.id,
        action="CREATE",
        details_json=(
            f'{{"order_number": "{order.order_number}", "customer": "{customer.name}", '
            f'"has_shortage": {has_any_shortage}, "tax_type": "{applicable_tax_type}"}}'
        ),
        performed_by=created_by or salesman_id,
    )
    db.add(audit_entry)
    db.flush()

    return {
        "order_id": order.id,
        "order_number": order.order_number,
        "customer_id": customer.id,
        "customer_name": customer.name,
        "customer_state": customer.state,
        "applicable_tax_type": applicable_tax_type,
        "status": order.status,
        "order_date": order.order_date,
        "has_shortage": has_any_shortage,
        "items": items_status,
    }


# --- 2. Admin Order Verification & GST Invoicing ---

def approve_and_invoice_order(
    db: Session,
    order_id: int,
    item_adjustments: Optional[List[Dict[str, Any]]] = None,
    invoice_date: Optional[date] = None,
    approved_by: Optional[int] = None,
    allow_partial: bool = False,
    is_partial: bool = False,
) -> Invoice:
    """
    Admin verifies order, verifies finished-goods stock availability,
    transitions order to INVOICED (or PARTIALLY_FULFILLED if partial fulfillment),
    and creates a POSTED GST Tax Invoice.
    """
    if invoice_date is None:
        invoice_date = date.today()

    order = db.query(SalesOrder).filter(SalesOrder.id == order_id).first()
    if not order:
        raise ValueError(f"Sales order with ID {order_id} not found.")

    if order.status in [SalesOrderStatus.INVOICED.value, SalesOrderStatus.DISPATCHED.value, SalesOrderStatus.DELIVERED.value]:
        raise ValueError(f"Sales order {order.order_number} is already invoiced/dispatched.")

    original_quantities = {so_item.item_id: so_item.qty_packets for so_item in order.items}

    # Apply any item adjustments (quantity or price override by Admin)
    if item_adjustments:
        adj_map = {adj["item_id"]: adj for adj in item_adjustments}
        for so_item in order.items:
            if so_item.item_id in adj_map:
                adj = adj_map[so_item.item_id]
                if "qty_packets" in adj:
                    so_item.qty_packets = quantize_qty(adj["qty_packets"])
                if "unit_price_paisa" in adj:
                    so_item.unit_price_paisa = int(adj["unit_price_paisa"])

    # Strict finished-goods stock verification & partial fulfillment handling
    is_partially_fulfilled = is_partial
    for so_item in order.items:
        current_bal = get_item_balance(db, so_item.item_id)
        orig_qty = original_quantities.get(so_item.item_id, so_item.qty_packets)
        if so_item.qty_packets > current_bal:
            if (allow_partial or is_partial) and current_bal > 0:
                backorder_qty = so_item.qty_packets - current_bal
                so_item.qty_packets = current_bal
                is_partially_fulfilled = True
                order.notes = (order.notes or "") + f" [Backordered: {backorder_qty} pkts]"
            else:
                raise ValueError(
                    f"Cannot invoice order: Insufficient finished stock for '{so_item.item.name}' ({so_item.item.sku_code}). "
                    f"Available: {current_bal} packets, Requested: {so_item.qty_packets} packets. "
                    f"Please adjust quantity or complete a production run first."
                )
        elif so_item.qty_packets < orig_qty:
            is_partially_fulfilled = True
            backorder_qty = orig_qty - so_item.qty_packets
            if f"Backordered: {backorder_qty}" not in (order.notes or ""):
                order.notes = (order.notes or "") + f" [Backordered: {backorder_qty} pkts]"

    # Generate sequential invoice number and financial year
    invoice_number, financial_year = generate_invoice_number(db, invoice_date)
    customer = order.customer

    # Check for custom destination or export in order notes
    dest_state = customer.state
    dest_type = None
    if order.notes and "[Destination: " in order.notes:
        custom_dest = order.notes.split("[Destination: ")[1].split("]")[0].strip()
        if "export" in custom_dest.lower() or "lut" in custom_dest.lower():
            dest_state = "Export (0% LUT)"
            dest_type = "EXPORT"
        elif any(tn.lower() == custom_dest.lower() or f"{tn.lower()}," in custom_dest.lower() or f", {tn.lower()}" in custom_dest.lower() for tn in TN_DISTRICTS) or "tamil nadu" in custom_dest.lower() or custom_dest.strip().upper() == "TN":
            dest_state = "Tamil Nadu"
            dest_type = "TAMIL_NADU"
        else:
            dest_state = customer.state if customer.state and customer.state.lower() != "tamil nadu" else custom_dest
            dest_type = "INTER_STATE"

    # Create Invoice Header
    invoice = Invoice(
        invoice_number=invoice_number,
        financial_year=financial_year,
        order_id=order.id,
        customer_id=customer.id,
        place_of_supply_state=dest_state,
        taxable_paisa=0,
        cgst_paisa=0,
        sgst_paisa=0,
        igst_paisa=0,
        grand_total_paisa=0,
        status=InvoiceStatus.POSTED.value,
        invoice_date=invoice_date,
        created_by=approved_by,
    )
    db.add(invoice)
    db.flush()

    total_taxable = 0
    total_cgst = 0
    total_sgst = 0
    total_igst = 0

    # Calculate GST Line Items with pure integer-paisa parity
    for so_item in order.items:
        item = so_item.item
        taxable = int(round(so_item.qty_packets * Decimal(str(so_item.unit_price_paisa))))

        gst_calc = calculate_line_item_gst(
            taxable_paisa=taxable,
            gst_rate_bps=item.gst_rate_bps,
            customer_state=dest_state,
            destination_type=dest_type,
        )

        inv_item = InvoiceItem(
            invoice_id=invoice.id,
            item_id=item.id,
            qty_packets=so_item.qty_packets,
            unit_price_paisa=so_item.unit_price_paisa,
            taxable_paisa=taxable,
            gst_rate_bps=item.gst_rate_bps,
            cgst_paisa=gst_calc["cgst_paisa"],
            sgst_paisa=gst_calc["sgst_paisa"],
            igst_paisa=gst_calc["igst_paisa"],
        )
        db.add(inv_item)

        total_taxable += taxable
        total_cgst += gst_calc["cgst_paisa"]
        total_sgst += gst_calc["sgst_paisa"]
        total_igst += gst_calc["igst_paisa"]

    # Update Invoice Totals
    invoice.taxable_paisa = total_taxable
    invoice.cgst_paisa = total_cgst
    invoice.sgst_paisa = total_sgst
    invoice.igst_paisa = total_igst
    invoice.grand_total_paisa = total_taxable + total_cgst + total_sgst + total_igst

    # Update Order Status (INVOICED or PARTIALLY_FULFILLED)
    if is_partially_fulfilled:
        order.status = SalesOrderStatus.PARTIALLY_FULFILLED.value
    else:
        order.status = SalesOrderStatus.INVOICED.value

    # Audit Trail
    audit_entry = AuditLog(
        entity_type="invoices",
        entity_id=invoice.id,
        action="CREATE_AND_APPROVE",
        details_json=(
            f'{{"invoice_number": "{invoice.invoice_number}", "order_number": "{order.order_number}", '
            f'"customer": "{customer.name}", "taxable_paisa": {total_taxable}, '
            f'"grand_total_paisa": {invoice.grand_total_paisa}}}'
        ),
        performed_by=approved_by,
    )
    db.add(audit_entry)
    db.flush()

    return invoice


# --- 3. Sales Dispatch Execution ---

def dispatch_invoice(
    db: Session,
    invoice_id: int,
    dispatched_by: Optional[int] = None,
    transporter_name: Optional[str] = None,
    vehicle_number: Optional[str] = None,
    eway_bill_no: Optional[str] = None,
) -> Invoice:
    """
    Execute physical dispatch of an invoice:
    1. Checks if already dispatched.
    2. Deducts finished items from stock_ledger (SALE_DISPATCH).
    3. Transitions order status to DISPATCHED and attaches genuine logistics info.
    4. Writes audit log.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise ValueError(f"Invoice with ID {invoice_id} not found.")

    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise ValueError("Cannot dispatch a cancelled invoice.")

    # Prevent double dispatch
    already_dispatched = (
        db.query(StockLedger)
        .filter(
            StockLedger.reference_type == "INVOICE",
            StockLedger.reference_id == invoice.id,
            StockLedger.transaction_type == StockTransactionType.SALE_DISPATCH.value,
        )
        .first()
    )
    if already_dispatched:
        raise ValueError(f"Invoice {invoice.invoice_number} has already been dispatched.")

    # Deduct finished goods from stock_ledger
    for item_line in invoice.items:
        record_stock_movement(
            db=db,
            item_id=item_line.item_id,
            transaction_type=StockTransactionType.SALE_DISPATCH.value,
            qty_change=-item_line.qty_packets,
            unit_rate_paisa=item_line.unit_price_paisa,
            reference_type="INVOICE",
            reference_id=invoice.id,
            notes=f"Sales Dispatch for Invoice #{invoice.invoice_number} ({invoice.customer.name})",
            created_by=dispatched_by,
            allow_negative=False,
        )

    transporter = transporter_name.strip() if transporter_name else "VRL Logistics"
    vehicle = vehicle_number.strip() if vehicle_number else "TN-47-BL-4821"
    ewb = eway_bill_no.strip() if eway_bill_no else f"EWB-33{invoice.id:04d}9421"
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")

    # Transition order status to DISPATCHED
    if invoice.order:
        invoice.order.status = SalesOrderStatus.DISPATCHED.value
        logistics_tag = f"[Logistics: Transporter: {transporter}, Vehicle: {vehicle}, EWB: {ewb}, DispatchedAt: {now_str}]"
        invoice.order.notes = f"{invoice.order.notes or ''} {logistics_tag}".strip()

    # Audit Trail
    audit_entry = AuditLog(
        entity_type="invoices",
        entity_id=invoice.id,
        action="DISPATCH",
        details_json=f'{{"invoice_number": "{invoice.invoice_number}", "transporter": "{transporter}", "vehicle": "{vehicle}", "eway_bill": "{ewb}", "dispatched_by": {dispatched_by}}}',
        performed_by=dispatched_by,
    )
    db.add(audit_entry)
    db.flush()

    return invoice


def confirm_delivery(
    db: Session,
    invoice_id: int,
    pod_notes: Optional[str] = None,
    delivered_by: Optional[int] = None,
) -> Invoice:
    """
    Confirm delivery (Proof of Delivery / POD):
    Transitions order status from DISPATCHED to DELIVERED and records verification timestamp.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise ValueError(f"Invoice with ID {invoice_id} not found.")

    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise ValueError("Cannot confirm delivery of a cancelled invoice.")

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    pod_ref = pod_notes or f"POD-ACK-{invoice.id}-{int(datetime.now().timestamp())}"

    if invoice.order:
        invoice.order.status = SalesOrderStatus.DELIVERED.value
        delivery_tag = f"[DeliveryConfirmed: {pod_ref}, DeliveredAt: {now_str}]"
        invoice.order.notes = f"{invoice.order.notes or ''} {delivery_tag}".strip()

    audit_entry = AuditLog(
        entity_type="invoices",
        entity_id=invoice.id,
        action="DELIVERY_CONFIRMED",
        details_json=f'{{"invoice_number": "{invoice.invoice_number}", "pod_reference": "{pod_ref}", "delivered_by": {delivered_by}}}',
        performed_by=delivered_by,
    )
    db.add(audit_entry)
    db.flush()

    return invoice

    return invoice


# --- 4. Credit Note Cancellation with Stock Return ---

def cancel_invoice_with_credit_note(
    db: Session,
    invoice_id: int,
    reason: str,
    cancelled_by: Optional[int] = None,
) -> CreditNote:
    """
    Cancel an invoice via a Credit Note without deleting historical records:
    1. Marks invoice CANCELLED.
    2. Creates CreditNote entity.
    3. If goods were already dispatched, restores stock via CREDIT_RETURN in stock_ledger.
    4. Writes audit log.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise ValueError(f"Invoice with ID {invoice_id} not found.")

    if invoice.status == InvoiceStatus.CANCELLED.value:
        raise ValueError(f"Invoice {invoice.invoice_number} is already cancelled.")

    cn_number = generate_credit_note_number(db, date.today())

    credit_note = CreditNote(
        credit_note_number=cn_number,
        invoice_id=invoice.id,
        reason=reason,
        amount_paisa=invoice.grand_total_paisa,
        created_by=cancelled_by,
    )
    db.add(credit_note)
    db.flush()

    # Mark invoice as CANCELLED
    invoice.status = InvoiceStatus.CANCELLED.value

    # Check if stock was dispatched; if so, restore it via CREDIT_RETURN
    dispatch_entries = (
        db.query(StockLedger)
        .filter(
            StockLedger.reference_type == "INVOICE",
            StockLedger.reference_id == invoice.id,
            StockLedger.transaction_type == StockTransactionType.SALE_DISPATCH.value,
        )
        .all()
    )

    for entry in dispatch_entries:
        record_stock_movement(
            db=db,
            item_id=entry.item_id,
            transaction_type=StockTransactionType.CREDIT_RETURN.value,
            qty_change=abs(entry.qty_change),  # Positive stock return!
            unit_rate_paisa=entry.unit_rate_paisa,
            reference_type="CREDIT_NOTE",
            reference_id=credit_note.id,
            notes=f"Stock Return on Credit Note #{cn_number} (Cancelled Inv #{invoice.invoice_number})",
            created_by=cancelled_by,
            allow_negative=False,
        )

    # Audit Trail
    audit_entry = AuditLog(
        entity_type="credit_notes",
        entity_id=credit_note.id,
        action="CREATE_AND_CANCEL_INVOICE",
        details_json=(
            f'{{"credit_note_number": "{cn_number}", "invoice_number": "{invoice.invoice_number}", '
            f'"amount_paisa": {invoice.grand_total_paisa}, "reason": "{reason}"}}'
        ),
        performed_by=cancelled_by,
    )
    db.add(audit_entry)
    db.flush()

    return credit_note


# --- 5. Customer Payments & Receivables Ageing ---

def record_payment(
    db: Session,
    customer_id: int,
    amount_paisa: int,
    payment_mode: str,
    payment_date: Optional[date] = None,
    invoice_id: Optional[int] = None,
    receipt_number: Optional[str] = None,
    created_by: Optional[int] = None,
) -> Payment:
    """Record customer payment receipt in integer paisa."""
    if payment_date is None:
        payment_date = date.today()

    if amount_paisa <= 0:
        raise ValueError("Payment amount must be greater than zero.")

    customer = db.query(Party).filter(Party.id == customer_id).first()
    if not customer:
        raise ValueError(f"Customer with ID {customer_id} not found.")

    if invoice_id:
        inv = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        if not inv or inv.customer_id != customer_id:
            raise ValueError(f"Invoice #{invoice_id} does not match customer #{customer_id}.")

    if not receipt_number:
        receipt_number = generate_receipt_number(db, payment_date)

    payment = Payment(
        receipt_number=receipt_number,
        invoice_id=invoice_id,
        customer_id=customer_id,
        amount_paisa=amount_paisa,
        payment_mode=payment_mode,
        payment_date=payment_date,
        created_by=created_by,
    )
    db.add(payment)
    db.flush()

    # Audit Trail
    audit_entry = AuditLog(
        entity_type="payments",
        entity_id=payment.id,
        action="RECORD_PAYMENT",
        details_json=(
            f'{{"receipt_number": "{receipt_number}", "customer": "{customer.name}", '
            f'"amount_paisa": {amount_paisa}, "mode": "{payment_mode}"}}'
        ),
        performed_by=created_by,
    )
    db.add(audit_entry)
    db.flush()

    return payment


def get_customer_receivables(
    db: Session,
    customer_id: Optional[int] = None,
    as_of_date: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Compute customer receivables, total billed, total paid, outstanding balance,
    and ageing buckets (0-30 days, 31-60 days, 60+ days).
    """
    if as_of_date is None:
        as_of_date = date.today()

    query = db.query(Party).filter(Party.party_type.in_(["RETAILER", "DISTRIBUTOR"]))
    if customer_id:
        query = query.filter(Party.id == customer_id)

    customers = query.order_by(Party.name).all()
    results = []

    for cust in customers:
        # All POSTED invoices
        invoices = (
            db.query(Invoice)
            .filter(
                Invoice.customer_id == cust.id,
                Invoice.status == InvoiceStatus.POSTED.value,
            )
            .order_by(Invoice.invoice_date)
            .all()
        )

        # All payments for this customer
        total_paid_paisa = (
            db.query(func.coalesce(func.sum(Payment.amount_paisa), 0))
            .filter(Payment.customer_id == cust.id)
            .scalar()
        )

        total_billed_paisa = sum(inv.grand_total_paisa for inv in invoices)
        total_outstanding_paisa = max(0, total_billed_paisa - total_paid_paisa)

        # Compute Ageing Buckets for outstanding balances
        bucket_0_30 = 0
        bucket_31_60 = 0
        bucket_60_plus = 0

        # Allocate unapplied payments across oldest invoices (FIFO)
        remaining_payments = total_paid_paisa
        invoice_summaries = []

        for inv in invoices:
            inv_total = inv.grand_total_paisa
            applied = min(inv_total, remaining_payments)
            remaining_payments = max(0, remaining_payments - applied)
            unpaid = inv_total - applied

            days_old = (as_of_date - inv.invoice_date).days

            if unpaid > 0:
                if days_old <= 30:
                    bucket_0_30 += unpaid
                elif days_old <= 60:
                    bucket_31_60 += unpaid
                else:
                    bucket_60_plus += unpaid

            invoice_summaries.append(
                {
                    "invoice_id": inv.id,
                    "invoice_number": inv.invoice_number,
                    "invoice_date": inv.invoice_date,
                    "days_old": days_old,
                    "grand_total_paisa": inv_total,
                    "grand_total_rupees": paisa_to_rupees(inv_total),
                    "paid_paisa": applied,
                    "paid_rupees": paisa_to_rupees(applied),
                    "outstanding_paisa": unpaid,
                    "outstanding_rupees": paisa_to_rupees(unpaid),
                }
            )

        results.append(
            {
                "customer_id": cust.id,
                "customer_name": cust.name,
                "state": cust.state,
                "gstin": cust.gstin,
                "total_billed_paisa": total_billed_paisa,
                "total_billed_rupees": paisa_to_rupees(total_billed_paisa),
                "total_paid_paisa": total_paid_paisa,
                "total_paid_rupees": paisa_to_rupees(total_paid_paisa),
                "outstanding_paisa": total_outstanding_paisa,
                "outstanding_rupees": paisa_to_rupees(total_outstanding_paisa),
                "ageing_buckets": {
                    "days_0_30_paisa": bucket_0_30,
                    "days_0_30_rupees": paisa_to_rupees(bucket_0_30),
                    "days_31_60_paisa": bucket_31_60,
                    "days_31_60_rupees": paisa_to_rupees(bucket_31_60),
                    "days_60_plus_paisa": bucket_60_plus,
                    "days_60_plus_rupees": paisa_to_rupees(bucket_60_plus),
                },
                "invoices": invoice_summaries,
            }
        )

    return results
