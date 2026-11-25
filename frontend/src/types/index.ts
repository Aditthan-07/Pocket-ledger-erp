/**
 * Pocket Ledger ERP - Shared TypeScript Type Definitions
 */

export type UserRole = 'SALESMAN' | 'ADMIN' | 'PRODUCTION' | 'AUDITOR' | 'OWNER';

export interface User {
  id: int_id;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

type int_id = number;

export type PartyType = 'RETAILER' | 'DISTRIBUTOR' | 'SUPPLIER' | 'CUSTOMER';

export interface Party {
  id: number;
  name: string;
  party_type: PartyType;
  gstin?: string | null;
  state: string;
  district?: string | null;
  city?: string | null;
  address?: string | null;
}

export type ItemCategory = 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_GOOD';

export interface Item {
  id: number;
  sku_code: string;
  name: string;
  name_ta?: string | null;
  category: ItemCategory;
  base_unit: string;
  pack_weight_grams?: number | null;
  carton_capacity?: number | null;
  hsn_code?: string | null;
  gst_rate_bps: number; // e.g. 500 for 5%
  selling_price_paisa: number; // stored in paisa
  reorder_level?: number | null;
}

export interface StockBalanceItem {
  id: number;
  sku_code: string;
  name: string;
  name_ta?: string | null;
  category: ItemCategory;
  base_unit: string;
  current_stock: number;
  reorder_level?: number | null;
  low_stock_alert: boolean;
  weighted_rate_paisa: number;
  weighted_rate_rupees: number;
  total_valuation_paisa: number;
  total_valuation_rupees: number;
  selling_price_paisa: number;
  selling_price_rupees: number;
}

export interface BOMIngredient {
  id: number;
  raw_item_id: number;
  standard_qty: number;
  unit: string;
  raw_item_name?: string;
  raw_item_sku?: string;
}

export interface BOMSKUMapping {
  id: number;
  finished_item_id: number;
  expected_yield_packets: number;
  pouch_item_id?: number | null;
  pouches_per_packet: number;
  carton_item_id?: number | null;
  packets_per_carton: number;
  finished_item_name?: string;
  finished_item_sku?: string;
}

export interface BOMHeader {
  id: number;
  code: string;
  name: string;
  name_ta?: string | null;
  version: number;
  version_label?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'DRAFT' | string;
  is_active: boolean;
  ingredients: BOMIngredient[];
  sku_mappings: BOMSKUMapping[];
}

export interface Purchase {
  id: number;
  bill_no: string;
  supplier_id: number;
  supplier_name?: string;
  item_id: number;
  item_name?: string;
  item_sku?: string;
  qty: number;
  unit_rate_paisa: number;
  total_paisa: number;
  purchase_date: string;
  created_at: string;
}

export interface ProductionCostingBreakdown {
  raw_material_cost_paisa: number;
  raw_material_cost_rupees: number;
  pouch_cost_paisa: number;
  pouch_cost_rupees: number;
  carton_cost_paisa: number;
  carton_cost_rupees: number;
  total_packaging_cost_paisa: number;
  total_packaging_cost_rupees: number;
  labour_cost_paisa: number;
  labour_cost_rupees: number;
  overhead_cost_paisa: number;
  overhead_cost_rupees: number;
  total_batch_cost_paisa: number;
  total_batch_cost_rupees: number;
  cost_per_packet_paisa: number;
  cost_per_packet_rupees: number;
  selling_price_paisa: number;
  selling_price_rupees: number;
  gross_margin_pct: number;
}

export interface ProductionRun {
  id?: number;
  run_id?: number;
  run_number: string;
  status?: 'ISSUED' | 'COMPLETED' | string;
  finished_item_id: number;
  finished_item_name?: string;
  finished_item_sku?: string;
  batches_count: number;
  expected_output_packets: number;
  actual_good_packets: number;
  damaged_pouches: number;
  cartons_used: number;
  yield_variance_pct: number;
  yield_is_flagged: boolean;
  has_variance_alert: boolean;
  cost_per_packet_paisa?: number;
  cost_per_packet_rupees?: number;
  costing?: ProductionCostingBreakdown;
  labour_cost_paisa?: number;
  overhead_cost_paisa?: number;
  run_date?: string;
  created_at?: string;
}

export interface ProductionBatchStartPayload {
  finished_item_id: number;
  batches_count: number;
  raw_materials_issued: Array<{ item_id: number; actual_qty: number }>;
  run_date?: string;
  run_number?: string;
}

export interface ProductionBatchCompletePayload {
  actual_good_packets: number;
  damaged_pouches: number;
  cartons_used: number;
  labour_cost_paisa: number;
  overhead_cost_paisa: number;
}

export interface BOMClonePayload {
  new_code?: string;
  new_name?: string;
  ingredient_adjustments?: Array<{ item_id: number; standard_qty: number }>;
  archive_previous?: boolean;
}

export interface BOMCreatePayload {
  code: string;
  name: string;
  name_ta?: string;
  ingredients: Array<{ raw_item_id: number; standard_qty: number; unit: string }>;
  sku_mappings: Array<{
    finished_item_id: number;
    expected_yield_packets: number;
    pouch_item_id?: number | null;
    pouches_per_packet: number;
    carton_item_id?: number | null;
    packets_per_carton: number;
  }>;
}

export type SalesOrderStatus =
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'AWAITING_STOCK'
  | 'PARTIALLY_FULFILLED'
  | 'INVOICED'
  | 'DISPATCHED'
  | 'DELIVERED';

export interface LogisticsInfo {
  transporter_name?: string;
  vehicle_number?: string;
  eway_bill_no?: string;
  dispatched_at?: string;
  origin?: string;
  destination?: string;
  pod_reference?: string;
  delivered_at?: string;
}

export interface SalesOrderItem {
  id?: number;
  item_id: number;
  sku_code?: string;
  name?: string;
  name_ta?: string;
  qty_packets: number;
  unit_price_paisa: number;
  unit_price_rupees?: number;
  line_total_paisa?: number;
  line_total_rupees?: number;
  item?: Item;
}

export interface SalesOrder {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name?: string;
  customer_district?: string;
  customer_state?: string;
  customer_gstin?: string;
  dispatch_route?: string;
  customer?: Party;
  salesman_id: number;
  salesman_name?: string;
  created_by?: string | number | null;
  invoice_id?: number | null;
  invoice_number?: string | null;
  status: SalesOrderStatus;
  order_status?: SalesOrderStatus;
  order_date: string;
  notes?: string | null;
  client_offline_id?: string | null;
  items_count?: number;
  total_paisa?: number;
  total_rupees?: number;
  items?: SalesOrderItem[];
  logistics?: LogisticsInfo;
}

export type InvoiceStatus = 'POSTED' | 'DISPATCHED' | 'CANCELLED' | 'DELIVERED';

export interface InvoiceItem {
  id?: number;
  item_id: number;
  sku_code?: string;
  name?: string;
  qty_packets: number;
  unit_price_paisa: number;
  unit_price_rupees?: number;
  taxable_paisa: number;
  taxable_rupees?: number;
  gst_rate_bps?: number;
  cgst_paisa: number;
  sgst_paisa: number;
  igst_paisa: number;
  line_total_paisa?: number;
  line_total_rupees?: number;
  item?: Item;
}

export interface Invoice {
  id: number;
  invoice_number: string;
  financial_year: string;
  order_id?: number | null;
  order_number?: string | null;
  sales_order_id?: number | null;
  customer_id?: number;
  customer_name?: string;
  customer_district?: string;
  customer_state?: string;
  customer_type?: string;
  dispatch_route?: string;
  customer?: Party;
  taxable_paisa: number;
  taxable_amount_paisa?: number;
  taxable_rupees: number;
  subtotal_paisa?: number;
  subtotal_rupees?: number;
  cgst_paisa: number;
  cgst_rupees?: number;
  sgst_paisa: number;
  sgst_rupees?: number;
  igst_paisa: number;
  igst_rupees?: number;
  tax_type?: string;
  grand_total_paisa: number;
  grand_total_rupees: number;
  status: InvoiceStatus;
  inv_status?: InvoiceStatus;
  invoice_date: string;
  dispatched_at?: string | null;
  transporter_name?: string | null;
  vehicle_number?: string | null;
  eway_bill_no?: string | null;
  order_status?: SalesOrderStatus;
  logistics?: LogisticsInfo;
  items?: InvoiceItem[];
}

export interface FactoryConfig {
  factory_name: string;
  factory_district: string;
  factory_state: string;
  factory_state_code: string;
  factory_gstin: string;
  factory_address: string;
  tn_districts: string[];
}

export interface CreditNote {
  id: number;
  credit_note_number: string;
  invoice_id: number;
  reason: string;
  amount_paisa: number;
  created_at: string;
}

export interface Payment {
  id: number;
  receipt_number: string;
  invoice_id?: number | null;
  customer_id: number;
  customer_name?: string;
  amount_paisa: number;
  amount_rupees?: number;
  payment_mode: string;
  payment_date: string;
  created_at: string;
}

export interface CustomerReceivable {
  customer_id: number;
  customer_name: string;
  state: string;
  gstin?: string | null;
  total_billed_paisa: number;
  total_billed_rupees: number;
  total_paid_paisa: number;
  total_paid_rupees: number;
  outstanding_paisa: number;
  outstanding_rupees: number;
  ageing_buckets: {
    days_0_30_paisa: number;
    days_0_30_rupees: number;
    days_31_60_paisa: number;
    days_31_60_rupees: number;
    days_60_plus_paisa: number;
    days_60_plus_rupees: number;
  };
}

export interface StockLedgerEntry {
  id: number;
  item_id: number;
  transaction_type: string;
  qty_change: number;
  unit_rate_paisa?: number | null;
  reference_type?: string | null;
  reference_id?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface OwnerDashboardMetrics {
  factory_state: string;
  inventory: {
    total_items: number;
    total_valuation_paisa: number;
    total_valuation_rupees: number;
    low_stock_count: number;
    low_stock_items: Array<{ sku: string; name: string; stock: number; reorder: number }>;
  };
  sales: {
    invoices_count: number;
    taxable_paisa: number;
    taxable_rupees: number;
    grand_total_paisa: number;
    grand_total_rupees: number;
  };
  receivables: {
    total_collected_paisa: number;
    total_collected_rupees: number;
    total_outstanding_paisa: number;
    total_outstanding_rupees: number;
    customers_count: number;
  };
  production: {
    total_runs: number;
    variance_alert_runs: number;
  };
}
