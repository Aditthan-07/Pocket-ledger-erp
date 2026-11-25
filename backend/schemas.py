"""
Pocket Ledger ERP - Pydantic v2 Schemas
Data Transfer Objects (DTOs) with strict validation, Decimal quantities,
and integer paisa for all monetary values.
"""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict, Field

from backend.models import (
    UserRole,
    PartyType,
    ItemCategory,
    SalesOrderStatus,
    InvoiceStatus,
    StockTransactionType,
)


# --- Base Schema ---

class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- User Schemas ---

class UserBase(ORMModel):
    username: str = Field(..., max_length=50)
    full_name: str = Field(..., max_length=100)
    role: UserRole
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(..., min_length=4)


class UserResponse(UserBase):
    id: int
    created_at: datetime


# --- Party Schemas ---

class PartyBase(ORMModel):
    name: str = Field(..., max_length=150)
    party_type: PartyType
    gstin: Optional[str] = Field(None, max_length=15)
    state: str = Field(..., max_length=50)
    district: Optional[str] = Field(None, max_length=50)
    city: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None


class PartyCreate(PartyBase):
    pass


class PartyResponse(PartyBase):
    id: int
    created_at: datetime


# --- Item Schemas ---

class ItemBase(ORMModel):
    sku_code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    name_ta: Optional[str] = Field(None, max_length=150)
    category: ItemCategory
    base_unit: str = Field(..., max_length=20)
    pack_weight_grams: Optional[Decimal] = None
    carton_capacity: Optional[int] = None
    hsn_code: Optional[str] = Field(None, max_length=20)
    gst_rate_bps: int = Field(0, description="GST rate in basis points (500 = 5.00%)")
    selling_price_paisa: int = Field(0, description="Selling price in paisa (5000 = ₹50.00)")
    reorder_level: Optional[Decimal] = None


class ItemCreate(ItemBase):
    pass


class ItemResponse(ItemBase):
    id: int
    created_at: datetime


class ItemStockSummary(ORMModel):
    id: int
    sku_code: str
    name: str
    name_ta: Optional[str]
    category: str
    base_unit: str
    current_stock: Decimal
    reorder_level: Optional[Decimal]
    reorder_required: bool
    latest_valuation_rate_paisa: Optional[int]
    total_valuation_paisa: int
    total_valuation_rupees: Decimal


# --- BOM Schemas ---

class BOMIngredientBase(ORMModel):
    raw_item_id: int
    standard_qty: Decimal
    unit: str


class BOMIngredientResponse(BOMIngredientBase):
    id: int
    raw_item_name: Optional[str] = None
    raw_item_sku: Optional[str] = None


class BOMSKUMappingBase(ORMModel):
    finished_item_id: int
    expected_yield_packets: Decimal
    pouch_item_id: Optional[int] = None
    pouches_per_packet: Decimal = Decimal("1.0")
    carton_item_id: Optional[int] = None
    packets_per_carton: int = 20


class BOMSKUMappingResponse(BOMSKUMappingBase):
    id: int
    finished_item_name: Optional[str] = None
    finished_item_sku: Optional[str] = None


class BOMHeaderBase(ORMModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=150)
    name_ta: Optional[str] = None
    version: int = 1
    version_label: str = "V1.0"
    status: str = "ACTIVE"
    is_active: bool = True


class BOMHeaderResponse(BOMHeaderBase):
    id: int
    created_at: datetime
    ingredients: List[BOMIngredientResponse] = []
    sku_mappings: List[BOMSKUMappingResponse] = []


# --- Stock Ledger Schemas ---

class StockLedgerBase(ORMModel):
    item_id: int
    transaction_type: StockTransactionType
    qty_change: Decimal
    unit_rate_paisa: Optional[int] = None
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    notes: Optional[str] = None


class StockLedgerCreate(StockLedgerBase):
    created_by: Optional[int] = None


class StockLedgerResponse(StockLedgerBase):
    id: int
    created_by: Optional[int]
    created_at: datetime


# --- Purchase Schemas ---

class PurchaseBase(ORMModel):
    bill_no: str = Field(..., max_length=50)
    supplier_id: int
    item_id: int
    qty: Decimal
    unit_rate_paisa: int
    total_paisa: Optional[int] = None
    purchase_date: date


class PurchaseCreate(PurchaseBase):
    created_by: Optional[int] = None


class PurchaseResponse(PurchaseBase):
    id: int
    supplier_name: Optional[str] = None
    item_name: Optional[str] = None
    item_sku: Optional[str] = None
    created_by: Optional[int]
    created_at: datetime


# --- Production Run Schemas ---

class ProductionRunBase(ORMModel):
    run_number: str = Field(..., max_length=50)
    bom_id: int
    finished_item_id: int
    batches_count: Decimal = Decimal("1.0")
    expected_output_packets: Decimal
    actual_good_packets: Decimal
    damaged_pouches: Decimal = Decimal("0.0")
    cartons_used: int = 0
    labour_cost_paisa: int = 0
    overhead_cost_paisa: int = 0
    yield_variance_pct: Decimal = Decimal("0.0")
    has_variance_alert: bool = False
    status: str = "COMPLETED"
    run_date: date


class ProductionRunCreate(ProductionRunBase):
    created_by: Optional[int] = None


class ProductionRunResponse(ProductionRunBase):
    id: int
    created_by: Optional[int]
    created_at: datetime


# --- Sales Order Schemas ---

class SalesOrderItemBase(ORMModel):
    item_id: int
    qty_packets: Decimal
    unit_price_paisa: int


class SalesOrderItemResponse(SalesOrderItemBase):
    id: int


class SalesOrderBase(ORMModel):
    order_number: str = Field(..., max_length=50)
    customer_id: int
    salesman_id: int
    status: SalesOrderStatus = SalesOrderStatus.SUBMITTED
    order_date: date
    notes: Optional[str] = None


class SalesOrderCreate(SalesOrderBase):
    items: List[SalesOrderItemBase]
    created_by: Optional[int] = None


class SalesOrderResponse(SalesOrderBase):
    id: int
    created_by: Optional[int]
    created_at: datetime
    customer_name: Optional[str] = None
    customer_district: Optional[str] = None
    customer_state: Optional[str] = None
    dispatch_route: Optional[str] = None
    items: List[SalesOrderItemResponse] = []


# --- Invoice Schemas ---

class InvoiceItemBase(ORMModel):
    item_id: int
    qty_packets: Decimal
    unit_price_paisa: int
    taxable_paisa: int
    gst_rate_bps: int
    cgst_paisa: int = 0
    sgst_paisa: int = 0
    igst_paisa: int = 0


class InvoiceItemResponse(InvoiceItemBase):
    id: int


class InvoiceBase(ORMModel):
    invoice_number: str = Field(..., max_length=50)
    financial_year: str = Field(..., max_length=10)
    order_id: Optional[int] = None
    customer_id: int
    place_of_supply_state: str
    taxable_paisa: int
    cgst_paisa: int
    sgst_paisa: int
    igst_paisa: int
    grand_total_paisa: int
    status: InvoiceStatus = InvoiceStatus.POSTED
    invoice_date: date


class InvoiceCreate(InvoiceBase):
    items: List[InvoiceItemBase]
    created_by: Optional[int] = None


class InvoiceResponse(InvoiceBase):
    id: int
    created_by: Optional[int]
    created_at: datetime
    customer_name: Optional[str] = None
    customer_district: Optional[str] = None
    customer_state: Optional[str] = None
    dispatch_route: Optional[str] = None
    items: List[InvoiceItemResponse] = []


# --- Factory Configuration Schemas ---

class FactoryConfigResponse(ORMModel):
    factory_name: str
    factory_district: str
    factory_state: str
    factory_state_code: str
    factory_gstin: str
    factory_address: str
    tn_districts: List[str]


class FactoryConfigUpdate(ORMModel):
    factory_district: str


# --- Credit Note & Payment Schemas ---

class CreditNoteBase(ORMModel):
    credit_note_number: str = Field(..., max_length=50)
    invoice_id: int
    reason: str
    amount_paisa: int


class CreditNoteCreate(CreditNoteBase):
    created_by: Optional[int] = None


class CreditNoteResponse(CreditNoteBase):
    id: int
    created_by: Optional[int]
    created_at: datetime


class PaymentBase(ORMModel):
    receipt_number: str = Field(..., max_length=50)
    invoice_id: Optional[int] = None
    customer_id: int
    amount_paisa: int
    payment_mode: str
    payment_date: date


class PaymentCreate(PaymentBase):
    created_by: Optional[int] = None


class PaymentResponse(PaymentBase):
    id: int
    created_by: Optional[int]
    created_at: datetime


# --- Audit Log Schemas ---

class AuditLogResponse(ORMModel):
    id: int
    entity_type: str
    entity_id: int
    action: str
    details_json: Optional[str]
    performed_by: Optional[int]
    created_at: datetime


# --- Opening Ledger Verification Summary Schemas ---

class OpeningItemSummary(ORMModel):
    sku_code: str
    name: str
    name_ta: Optional[str]
    category: str
    base_unit: str
    opening_qty: Decimal
    current_stock: Decimal
    opening_unit_rate_paisa: int
    opening_unit_rate_rupees: Decimal
    opening_valuation_paisa: int
    opening_valuation_rupees: Decimal
    reorder_level: Optional[Decimal]


class OpeningSummaryResponse(ORMModel):
    factory_state: str
    users_count: int
    parties_count: int
    items_count: int
    bom_recipes_count: int
    stock_ledger_entries_count: int
    total_opening_valuation_paisa: int
    total_opening_valuation_rupees: Decimal
    items: List[OpeningItemSummary]


# --- Phase 2: Live Stock & Production Schemas ---

class StockBalanceItem(ORMModel):
    id: int
    sku_code: str
    name: str
    name_ta: Optional[str]
    category: str
    base_unit: str
    current_stock: Decimal
    reorder_level: Optional[Decimal]
    low_stock_alert: bool
    weighted_rate_paisa: int
    weighted_rate_rupees: Decimal
    total_valuation_paisa: int
    total_valuation_rupees: Decimal
    selling_price_paisa: int
    selling_price_rupees: Decimal


class ProductionPreviewRequest(BaseModel):
    finished_item_id: int
    batches_count: Decimal = Decimal("1.0")


class ProductionPreviewIngredient(BaseModel):
    item_id: int
    sku_code: str
    name: str
    name_ta: Optional[str]
    unit: str
    standard_qty_per_batch: Decimal
    planned_qty: Decimal
    current_stock: Decimal
    is_sufficient: bool
    shortage: Decimal
    weighted_rate_paisa: int
    weighted_rate_rupees: Decimal
    estimated_cost_paisa: int
    estimated_cost_rupees: Decimal


class ProductionPreviewPackaging(BaseModel):
    item_id: int
    sku_code: str
    name: str
    name_ta: Optional[str]
    unit: str
    planned_qty: Decimal
    current_stock: Decimal
    is_sufficient: bool
    shortage: Decimal
    weighted_rate_paisa: int
    weighted_rate_rupees: Decimal
    estimated_cost_paisa: int
    estimated_cost_rupees: Decimal


class ProductionPreviewResponse(BaseModel):
    bom_id: int
    bom_code: str
    bom_name: str
    finished_item_id: int
    finished_item_name: str
    finished_item_sku: str
    batches_count: Decimal
    expected_output_packets: Decimal
    can_produce: bool
    ingredients: List[ProductionPreviewIngredient]
    pouch_packaging: Optional[ProductionPreviewPackaging] = None
    carton_packaging: Optional[ProductionPreviewPackaging] = None


class RawMaterialIssueInput(BaseModel):
    item_id: int
    actual_qty: Decimal


class ProductionRunExecuteRequest(BaseModel):
    finished_item_id: int
    batches_count: Decimal = Decimal("1.0")
    raw_materials_issued: List[RawMaterialIssueInput]
    actual_good_packets: Decimal
    damaged_pouches: Decimal = Decimal("0.0")
    cartons_used: int = 0
    labour_cost_paisa: int = 0
    overhead_cost_paisa: int = 0
    run_date: Optional[date] = None
    run_number: Optional[str] = None
    created_by: Optional[int] = None


class ProductionCostingBreakdown(BaseModel):
    raw_material_cost_paisa: int
    raw_material_cost_rupees: Decimal
    pouch_cost_paisa: int
    pouch_cost_rupees: Decimal
    carton_cost_paisa: int
    carton_cost_rupees: Decimal
    total_packaging_cost_paisa: int
    total_packaging_cost_rupees: Decimal
    labour_cost_paisa: int
    labour_cost_rupees: Decimal
    overhead_cost_paisa: int
    overhead_cost_rupees: Decimal
    total_batch_cost_paisa: int
    total_batch_cost_rupees: Decimal
    cost_per_packet_paisa: int
    cost_per_packet_rupees: Decimal
    selling_price_paisa: int
    selling_price_rupees: Decimal
    gross_margin_pct: Decimal


class ProductionRunExecuteResponse(BaseModel):
    run_id: int
    run_number: str
    finished_item_id: int
    finished_item_name: str
    finished_item_sku: str
    batches_count: Decimal
    expected_output_packets: Decimal
    actual_good_packets: Decimal
    damaged_pouches: Decimal
    cartons_used: int
    yield_variance_pct: Decimal
    yield_is_flagged: bool
    has_variance_alert: bool
    status: str = "COMPLETED"
    costing: ProductionCostingBreakdown
    raw_materials_breakdown: List[Dict[str, Any]]


class ProductionBatchStartRequest(BaseModel):
    finished_item_id: int
    batches_count: Decimal = Decimal("1.0")
    raw_materials_issued: List[RawMaterialIssueInput]
    run_date: Optional[date] = None
    run_number: Optional[str] = None
    created_by: Optional[int] = None


class ProductionBatchStartResponse(BaseModel):
    run_id: int
    run_number: str
    finished_item_id: int
    finished_item_name: str
    finished_item_sku: str
    batches_count: Decimal
    expected_output_packets: Decimal
    status: str = "ISSUED"
    has_variance_alert: bool
    raw_materials_breakdown: List[Dict[str, Any]]


class ProductionBatchCompleteRequest(BaseModel):
    actual_good_packets: Decimal
    damaged_pouches: Decimal = Decimal("0.0")
    cartons_used: int = 0
    labour_cost_paisa: int = 0
    overhead_cost_paisa: int = 0
    updated_by: Optional[int] = None


class BOMCloneRequest(BaseModel):
    new_code: Optional[str] = None
    new_name: Optional[str] = None
    ingredient_adjustments: Optional[List[Dict[str, Any]]] = None
    archive_previous: bool = True


class BOMStatusUpdateRequest(BaseModel):
    status: str  # ACTIVE, ARCHIVED, DRAFT


class BOMCreateIngredientInput(BaseModel):
    raw_item_id: int
    standard_qty: Decimal
    unit: str


class BOMCreateSKUMappingInput(BaseModel):
    finished_item_id: int
    expected_yield_packets: Decimal
    pouch_item_id: Optional[int] = None
    pouches_per_packet: Decimal = Decimal("1.0")
    carton_item_id: Optional[int] = None
    packets_per_carton: int = 20


class BOMCreateRequest(BaseModel):
    code: str
    name: str
    name_ta: Optional[str] = None
    ingredients: List[BOMCreateIngredientInput]
    sku_mappings: List[BOMCreateSKUMappingInput]


class OverheadsPatchRequest(BaseModel):
    labour_cost_paisa: int = Field(..., ge=0)
    overhead_cost_paisa: int = Field(..., ge=0)
    updated_by: Optional[int] = None


class OverheadsPatchResponse(BaseModel):
    run_id: int
    run_number: str
    labour_cost_paisa: int
    overhead_cost_paisa: int
    total_batch_cost_paisa: int
    total_batch_cost_rupees: Decimal
    cost_per_packet_paisa: int
    cost_per_packet_rupees: Decimal
    gross_margin_pct: Decimal


class BOMSKUMappingCreate(BaseModel):
    bom_id: int
    finished_item_id: int
    expected_yield_packets: Decimal
    pouch_item_id: Optional[int] = None
    pouches_per_packet: Decimal = Decimal("1.0")
    carton_item_id: Optional[int] = None
    packets_per_carton: int = 20

