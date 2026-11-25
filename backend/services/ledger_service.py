"""
Pocket Ledger ERP - Inventory Ledger Service
Immutable stock ledger operations, dynamic derived stock balances,
strict non-negative stock validation, and weighted-average costing.
"""

from decimal import Decimal
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models import Item, StockLedger, StockTransactionType
from backend.units import quantize_qty, paisa_to_rupees, format_rupees


def get_item_balance(db: Session, item_id: int) -> Decimal:
    """
    Derive the current stock balance of an item strictly from the immutable stock_ledger.
    Invariant: Stock is never read from a mutable item column; it is always SUM(qty_change).
    """
    balance = (
        db.query(func.coalesce(func.sum(StockLedger.qty_change), Decimal("0.0000")))
        .filter(StockLedger.item_id == item_id)
        .scalar()
    )
    return quantize_qty(Decimal(str(balance)))


def get_weighted_average_rate_paisa(
    db: Session,
    item_id: int,
    as_decimal: bool = True,
) -> Decimal:
    """
    Calculate the exact weighted-average cost per unit up to the current point in time.
    Calculates from all positive inbound receipts (OPENING, PURCHASE, PROD_OUTPUT).
    
    Formula:
        Weighted Average Rate = SUM(qty_in * unit_rate_paisa) / SUM(qty_in)
    
    Returns:
        Decimal precision paisa (e.g. Decimal("4312.5") paisa = ₹43.125 / kg)
        or nearest integer paisa if as_decimal=False.
    """
    inbound_types = [
        StockTransactionType.OPENING.value,
        StockTransactionType.PURCHASE.value,
        StockTransactionType.PROD_OUTPUT.value,
    ]

    entries = (
        db.query(StockLedger)
        .filter(
            StockLedger.item_id == item_id,
            StockLedger.transaction_type.in_(inbound_types),
            StockLedger.qty_change > 0,
            StockLedger.unit_rate_paisa.isnot(None),
        )
        .all()
    )

    if not entries:
        # Fallback to 0 if no inbound entries
        return Decimal("0.0000") if as_decimal else 0

    total_value_paisa = Decimal("0.0000")
    total_qty = Decimal("0.0000")

    for entry in entries:
        qty = Decimal(str(entry.qty_change))
        rate = Decimal(str(entry.unit_rate_paisa))
        total_value_paisa += qty * rate
        total_qty += qty

    if total_qty == Decimal("0.0000"):
        return Decimal("0.0000") if as_decimal else 0

    avg_rate = total_value_paisa / total_qty

    if as_decimal:
        return avg_rate  # Full Decimal precision e.g. 4312.5
    return int(round(avg_rate))


def record_stock_movement(
    db: Session,
    item_id: int,
    transaction_type: str,
    qty_change: Decimal,
    unit_rate_paisa: Optional[int] = None,
    reference_type: Optional[str] = None,
    reference_id: Optional[int] = None,
    notes: Optional[str] = None,
    created_by: Optional[int] = None,
    allow_negative: bool = False,
) -> StockLedger:
    """
    Validate non-negative inventory and append an immutable row to stock_ledger.
    Raises ValueError if inventory would drop below zero and allow_negative is False.
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise ValueError(f"Item with ID {item_id} not found.")

    dec_qty = quantize_qty(qty_change)

    # Invariant: Prevent negative inventory on outflows
    if dec_qty < Decimal("0.0000") and not allow_negative:
        current_bal = get_item_balance(db, item_id)
        if current_bal + dec_qty < Decimal("0.0000"):
            shortage = abs(current_bal + dec_qty)
            raise ValueError(
                f"Insufficient inventory for '{item.name}' ({item.sku_code}). "
                f"Current balance: {current_bal} {item.base_unit}, "
                f"Attempted issue: {abs(dec_qty)} {item.base_unit}. "
                f"Shortage: {shortage} {item.base_unit}."
            )

    # Append immutable ledger entry
    entry = StockLedger(
        item_id=item_id,
        transaction_type=transaction_type,
        qty_change=dec_qty,
        unit_rate_paisa=unit_rate_paisa,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        created_by=created_by,
    )
    db.add(entry)
    db.flush()
    return entry


def get_all_stock_balances(db: Session) -> List[Dict[str, Any]]:
    """
    Retrieve live stock balances for all items in the inventory.
    Returns item metadata, current derived stock, reorder level,
    low-stock alert, and latest weighted-average valuation.
    """
    items = db.query(Item).order_by(Item.category, Item.id).all()
    results = []

    for item in items:
        current_bal = get_item_balance(db, item.id)
        reorder_lvl = item.reorder_level
        is_low_stock = bool(reorder_lvl is not None and current_bal <= reorder_lvl)
        weighted_rate = get_weighted_average_rate_paisa(db, item.id, as_decimal=True)

        valuation_paisa = int(round(current_bal * weighted_rate))

        results.append(
            {
                "id": item.id,
                "sku_code": item.sku_code,
                "name": item.name,
                "name_ta": item.name_ta,
                "category": item.category,
                "base_unit": item.base_unit,
                "current_stock": current_bal,
                "reorder_level": reorder_lvl,
                "low_stock_alert": is_low_stock,
                "weighted_rate_paisa": int(round(weighted_rate)),
                "weighted_rate_rupees": paisa_to_rupees(int(round(weighted_rate))),
                "total_valuation_paisa": valuation_paisa,
                "total_valuation_rupees": paisa_to_rupees(valuation_paisa),
                "selling_price_paisa": item.selling_price_paisa,
                "selling_price_rupees": paisa_to_rupees(item.selling_price_paisa),
            }
        )

    return results
