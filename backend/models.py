"""
Pocket Ledger ERP - SQLAlchemy 2.0 Relational Models
NIT Tiruchirappalli CDI Winter Internship Specification

Enforces Strict Engineering & Accounting Invariants:
1. No Floating-Point Money: All monetary values are Integer paisa (1 INR = 100 paisa).
2. No Floating-Point Drift on Quantities: All quantities are Numeric(12, 4) Decimals.
3. Immutable Ledger-Based Stock: No mutable current_stock column on items; stock is derived from stock_ledger.
4. Decoupled Recipe (BOM) & Pack Sizes: Base Dough/Mix recipes mapped to multiple finished SKUs.
5. Full Audit Trail: Audit logs table and created_by/created_at on transactional tables.
"""

from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from typing import Optional, List

from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Numeric,
    Boolean,
    Date,
    DateTime,
    Text,
    ForeignKey,
    Index,
    func,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column

from backend.database import Base


# --- Enumerations ---

class UserRole(str, Enum):
    SALESMAN = "SALESMAN"
    ADMIN = "ADMIN"
    PRODUCTION = "PRODUCTION"
    AUDITOR = "AUDITOR"
    OWNER = "OWNER"


class PartyType(str, Enum):
    RETAILER = "RETAILER"
    DISTRIBUTOR = "DISTRIBUTOR"
    SUPPLIER = "SUPPLIER"
    CUSTOMER = "CUSTOMER"


class ItemCategory(str, Enum):
    RAW_MATERIAL = "RAW_MATERIAL"
    PACKAGING = "PACKAGING"
    FINISHED_GOOD = "FINISHED_GOOD"


class SalesOrderStatus(str, Enum):
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    AWAITING_STOCK = "AWAITING_STOCK"
    PARTIALLY_FULFILLED = "PARTIALLY_FULFILLED"
    INVOICED = "INVOICED"
    DISPATCHED = "DISPATCHED"
    DELIVERED = "DELIVERED"


class InvoiceStatus(str, Enum):
    POSTED = "POSTED"
    CANCELLED = "CANCELLED"


class StockTransactionType(str, Enum):
    OPENING = "OPENING"
    PURCHASE = "PURCHASE"
    PROD_ISSUE = "PROD_ISSUE"
    PROD_OUTPUT = "PROD_OUTPUT"
    SALE_DISPATCH = "SALE_DISPATCH"
    CREDIT_RETURN = "CREDIT_RETURN"
    ADJUSTMENT = "ADJUSTMENT"


# --- 1. Users Table ---

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default=UserRole.SALESMAN.value)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    sales_orders: Mapped[List["SalesOrder"]] = relationship(
        "SalesOrder", back_populates="salesman", foreign_keys="SalesOrder.salesman_id"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username='{self.username}' role='{self.role}'>"


# --- 2. Parties Table (Customers & Suppliers) ---

class Party(Base):
    __tablename__ = "parties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    party_type: Mapped[str] = mapped_column(String(30), nullable=False)  # RETAILER, DISTRIBUTOR, SUPPLIER
    gstin: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    state: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., "Tamil Nadu", "Karnataka"
    district: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default=None)  # e.g., "Tiruchirappalli", "Karur", "Chennai"
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    purchases: Mapped[List["Purchase"]] = relationship("Purchase", back_populates="supplier")
    sales_orders: Mapped[List["SalesOrder"]] = relationship("SalesOrder", back_populates="customer")
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="customer")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="customer")

    def __repr__(self) -> str:
        return f"<Party id={self.id} name='{self.name}' type='{self.party_type}' state='{self.state}'>"

    @property
    def city(self) -> Optional[str]:
        return self.district


# --- 3. Items Table (No mutable current_stock column!) ---

class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sku_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_ta: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)  # Tamil translation
    category: Mapped[str] = mapped_column(String(30), nullable=False)  # RAW_MATERIAL, PACKAGING, FINISHED_GOOD
    base_unit: Mapped[str] = mapped_column(String(20), nullable=False)  # kg, litre, piece, packet, carton
    pack_weight_grams: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    carton_capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hsn_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    gst_rate_bps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 500 for 5.00%
    selling_price_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # In paisa (₹50 = 5000)
    reorder_level: Mapped[Optional[Decimal]] = mapped_column(Numeric(12, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    stock_entries: Mapped[List["StockLedger"]] = relationship("StockLedger", back_populates="item")

    def __repr__(self) -> str:
        return f"<Item id={self.id} sku='{self.sku_code}' name='{self.name}' category='{self.category}'>"


# --- 4. BOM Headers (Base Dough / Recipe Definition) ---

class BOMHeader(Base):
    __tablename__ = "bom_headers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_ta: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    version_label: Mapped[str] = mapped_column(String(20), default="V1.0", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    ingredients: Mapped[List["BOMIngredient"]] = relationship(
        "BOMIngredient", back_populates="bom", cascade="all, delete-orphan"
    )
    sku_mappings: Mapped[List["BOMSKUMapping"]] = relationship(
        "BOMSKUMapping", back_populates="bom", cascade="all, delete-orphan"
    )
    production_runs: Mapped[List["ProductionRun"]] = relationship("ProductionRun", back_populates="bom")

    def __repr__(self) -> str:
        return f"<BOMHeader id={self.id} code='{self.code}' name='{self.name}' v={self.version}>"


# --- 5. BOM Ingredients (Raw Material Consumption per Batch) ---

class BOMIngredient(Base):
    __tablename__ = "bom_ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bom_id: Mapped[int] = mapped_column(Integer, ForeignKey("bom_headers.id", ondelete="CASCADE"), nullable=False)
    raw_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    standard_qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)

    # Relationships
    bom: Mapped["BOMHeader"] = relationship("BOMHeader", back_populates="ingredients")
    raw_item: Mapped["Item"] = relationship("Item")

    def __repr__(self) -> str:
        return f"<BOMIngredient bom_id={self.bom_id} raw_item_id={self.raw_item_id} qty={self.standard_qty} {self.unit}>"


# --- 6. BOM SKU Mappings (Decoupled Pack Sizes & Packaging) ---

class BOMSKUMapping(Base):
    __tablename__ = "bom_sku_mappings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bom_id: Mapped[int] = mapped_column(Integer, ForeignKey("bom_headers.id", ondelete="CASCADE"), nullable=False)
    finished_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    expected_yield_packets: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    pouch_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("items.id"), nullable=True)
    pouches_per_packet: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1.0"), nullable=False)
    carton_item_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("items.id"), nullable=True)
    packets_per_carton: Mapped[int] = mapped_column(Integer, default=20, nullable=False)

    # Relationships
    bom: Mapped["BOMHeader"] = relationship("BOMHeader", back_populates="sku_mappings")
    finished_item: Mapped["Item"] = relationship("Item", foreign_keys=[finished_item_id])
    pouch_item: Mapped[Optional["Item"]] = relationship("Item", foreign_keys=[pouch_item_id])
    carton_item: Mapped[Optional["Item"]] = relationship("Item", foreign_keys=[carton_item_id])

    def __repr__(self) -> str:
        return f"<BOMSKUMapping bom_id={self.bom_id} finished_sku={self.finished_item_id} yield={self.expected_yield_packets}>"


# --- 7. Purchases Table ---

class Purchase(Base):
    __tablename__ = "purchases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bill_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    supplier_id: Mapped[int] = mapped_column(Integer, ForeignKey("parties.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_rate_paisa: Mapped[int] = mapped_column(Integer, nullable=False)  # in paisa
    total_paisa: Mapped[int] = mapped_column(Integer, nullable=False)  # in paisa
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    supplier: Mapped["Party"] = relationship("Party", back_populates="purchases")
    item: Mapped["Item"] = relationship("Item")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<Purchase id={self.id} bill='{self.bill_no}' item_id={self.item_id} total_paisa={self.total_paisa}>"


# --- 8. Production Runs ---

class ProductionRun(Base):
    __tablename__ = "production_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    bom_id: Mapped[int] = mapped_column(Integer, ForeignKey("bom_headers.id"), nullable=False)
    finished_item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    batches_count: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1.0"), nullable=False)
    expected_output_packets: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    actual_good_packets: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    damaged_pouches: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0"), nullable=False)
    cartons_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    labour_cost_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    overhead_cost_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    yield_variance_pct: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0"), nullable=False)
    has_variance_alert: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="COMPLETED", nullable=False)
    run_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    bom: Mapped["BOMHeader"] = relationship("BOMHeader", back_populates="production_runs")
    finished_item: Mapped["Item"] = relationship("Item", foreign_keys=[finished_item_id])
    consumptions: Mapped[List["ProductionConsumption"]] = relationship(
        "ProductionConsumption", back_populates="run", cascade="all, delete-orphan"
    )
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<ProductionRun id={self.id} run_number='{self.run_number}' actual={self.actual_good_packets}>"


# --- 9. Production Consumptions ---

class ProductionConsumption(Base):
    __tablename__ = "production_consumptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[int] = mapped_column(Integer, ForeignKey("production_runs.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    planned_qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    actual_qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    variance_pct: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("0.0"), nullable=False)
    is_flagged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    run: Mapped["ProductionRun"] = relationship("ProductionRun", back_populates="consumptions")
    item: Mapped["Item"] = relationship("Item")

    def __repr__(self) -> str:
        return f"<ProductionConsumption run_id={self.run_id} item_id={self.item_id} act={self.actual_qty}>"


# --- 10. Sales Orders ---

class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("parties.id"), nullable=False)
    salesman_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=SalesOrderStatus.SUBMITTED.value, nullable=False
    )  # SUBMITTED, APPROVED, REJECTED, INVOICED, DISPATCHED
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    customer: Mapped["Party"] = relationship("Party", back_populates="sales_orders")
    salesman: Mapped["User"] = relationship("User", foreign_keys=[salesman_id], back_populates="sales_orders")
    items: Mapped[List["SalesOrderItem"]] = relationship(
        "SalesOrderItem", back_populates="order", cascade="all, delete-orphan"
    )
    invoices: Mapped[List["Invoice"]] = relationship("Invoice", back_populates="order")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<SalesOrder id={self.id} number='{self.order_number}' status='{self.status}'>"


# --- 11. Sales Order Items ---

class SalesOrderItem(Base):
    __tablename__ = "sales_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    qty_packets: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_price_paisa: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    order: Mapped["SalesOrder"] = relationship("SalesOrder", back_populates="items")
    item: Mapped["Item"] = relationship("Item")

    def __repr__(self) -> str:
        return f"<SalesOrderItem order_id={self.order_id} item_id={self.item_id} qty={self.qty_packets}>"


# --- 12. Invoices ---

class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    financial_year: Mapped[str] = mapped_column(String(10), nullable=False)  # e.g., "2026-27"
    order_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sales_orders.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("parties.id"), nullable=False)
    place_of_supply_state: Mapped[str] = mapped_column(String(50), nullable=False)
    taxable_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cgst_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sgst_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    igst_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    grand_total_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), default=InvoiceStatus.POSTED.value, nullable=False
    )  # POSTED, CANCELLED
    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    order: Mapped[Optional["SalesOrder"]] = relationship("SalesOrder", back_populates="invoices")
    customer: Mapped["Party"] = relationship("Party", back_populates="invoices")
    items: Mapped[List["InvoiceItem"]] = relationship(
        "InvoiceItem", back_populates="invoice", cascade="all, delete-orphan"
    )
    credit_notes: Mapped[List["CreditNote"]] = relationship("CreditNote", back_populates="invoice")
    payments: Mapped[List["Payment"]] = relationship("Payment", back_populates="invoice")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<Invoice id={self.id} number='{self.invoice_number}' total_paisa={self.grand_total_paisa}>"


# --- 13. Invoice Items ---

class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    qty_packets: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_price_paisa: Mapped[int] = mapped_column(Integer, nullable=False)
    taxable_paisa: Mapped[int] = mapped_column(Integer, nullable=False)
    gst_rate_bps: Mapped[int] = mapped_column(Integer, nullable=False)  # 500 = 5%
    cgst_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sgst_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    igst_paisa: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Relationships
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="items")
    item: Mapped["Item"] = relationship("Item")

    def __repr__(self) -> str:
        return f"<InvoiceItem invoice_id={self.invoice_id} item_id={self.item_id} taxable={self.taxable_paisa}>"


# --- 14. Credit Notes ---

class CreditNote(Base):
    __tablename__ = "credit_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    credit_note_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    invoice_id: Mapped[int] = mapped_column(Integer, ForeignKey("invoices.id"), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    amount_paisa: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="credit_notes")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<CreditNote id={self.id} number='{self.credit_note_number}' amount={self.amount_paisa}>"


# --- 15. Payments Table ---

class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    receipt_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    invoice_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("invoices.id"), nullable=True)
    customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("parties.id"), nullable=False)
    amount_paisa: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_mode: Mapped[str] = mapped_column(String(30), nullable=False)  # CASH, UPI, NEFT, CHEQUE
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    customer: Mapped["Party"] = relationship("Party", back_populates="payments")
    invoice: Mapped[Optional["Invoice"]] = relationship("Invoice", back_populates="payments")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return f"<Payment id={self.id} receipt='{self.receipt_number}' amount={self.amount_paisa}>"


# --- 16. Stock Ledger (Append-Only Immutable Stock Truth) ---

class StockLedger(Base):
    __tablename__ = "stock_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # OPENING, PURCHASE, PROD_ISSUE, PROD_OUTPUT, SALE_DISPATCH, CREDIT_RETURN, ADJUSTMENT
    qty_change: Mapped[Decimal] = mapped_column(
        Numeric(12, 4), nullable=False
    )  # Positive for additions, negative for reductions
    unit_rate_paisa: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # Valuation rate in paisa per base unit
    reference_type: Mapped[Optional[str]] = mapped_column(
        String(50), nullable=True
    )  # OPENING_BALANCE, PURCHASE, PRODUCTION_RUN, INVOICE, CREDIT_NOTE, ADJUSTMENT
    reference_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    item: Mapped["Item"] = relationship("Item", back_populates="stock_entries")
    creator: Mapped[Optional["User"]] = relationship("User", foreign_keys=[created_by])

    def __repr__(self) -> str:
        return (
            f"<StockLedger id={self.id} item_id={self.item_id} type='{self.transaction_type}' "
            f"change={self.qty_change} ref='{self.reference_type}'>"
        )


# --- 17. Audit Logs Table ---

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # e.g., 'sales_orders', 'invoices'
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # CREATE, UPDATE, DELETE, STATUS_CHANGE
    details_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON diff or snapshot
    performed_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[performed_by])

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} entity='{self.entity_type}#{self.entity_id}' action='{self.action}'>"
