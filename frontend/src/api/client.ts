/**
 * Pocket Ledger ERP - Centralized Frontend API Client
 */

import {
  User,
  Party,
  Item,
  StockBalanceItem,
  BOMHeader,
  BOMSKUMapping,
  Purchase,
  ProductionRun,
  ProductionBatchStartPayload,
  ProductionBatchCompletePayload,
  BOMClonePayload,
  BOMCreatePayload,
  SalesOrder,
  Invoice,
  CreditNote,
  Payment,
  CustomerReceivable,
  StockLedgerEntry,
  OwnerDashboardMetrics,
  FactoryConfig,
} from '../types';

const API_BASE = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let errorDetail = res.statusText;
    try {
      const errorJson = await res.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      // Ignore json parse error
    }
    throw new Error(errorDetail);
  }

  // If response is a blob/file, handle separately
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return res as unknown as T;
}

export const api = {
  // --- Auth ---
  login: (username: string, password: string) =>
    request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  // --- Master Data ---
  getUsers: () => request<User[]>('/master/users'),
  getParties: () => request<Party[]>('/master/parties'),
  createParty: (payload: {
    name: string;
    party_type: string;
    gstin?: string | null;
    state: string;
    district?: string | null;
    city?: string | null;
    address?: string | null;
  }) =>
    request<Party>('/master/parties', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getItems: () => request<Item[]>('/master/items'),

  // --- Factory Hub Configuration ---
  getFactoryConfig: () => request<FactoryConfig>('/factory/config'),
  updateFactoryDistrict: (district: string) =>
    request<FactoryConfig>('/factory/config', {
      method: 'POST',
      body: JSON.stringify({ factory_district: district }),
    }),
  getBOMs: () => request<BOMHeader[]>('/boms'),
  createBOM: (payload: BOMCreatePayload) =>
    request<BOMHeader>('/boms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  cloneBOMVersion: (bomId: number, payload: BOMClonePayload) =>
    request<BOMHeader>(`/boms/${bomId}/clone`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateBOMStatus: (bomId: number, status: string) =>
    request<BOMHeader>(`/boms/${bomId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  addBOMSKUMapping: (payload: {
    bom_id: number;
    finished_item_id: number;
    expected_yield_packets: number;
    pouch_item_id?: number | null;
    pouches_per_packet: number;
    carton_item_id?: number | null;
    packets_per_carton: number;
  }) =>
    request<BOMSKUMapping>('/boms/sku-mapping', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- Inventory & Ledger ---
  getStockBalances: () => request<StockBalanceItem[]>('/inventory/balances'),
  getStockLedger: (params?: { item_id?: number; transaction_type?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.item_id) q.set('item_id', String(params.item_id));
    if (params?.transaction_type) q.set('transaction_type', params.transaction_type);
    if (params?.limit) q.set('limit', String(params.limit));
    return request<StockLedgerEntry[]>(`/inventory/ledger?${q.toString()}`);
  },

  // --- Purchases ---
  recordPurchase: (payload: {
    bill_no: string;
    supplier_id: number;
    item_id: number;
    qty: number;
    unit_rate_paisa: number;
    purchase_date: string;
    created_by?: number;
  }) =>
    request<Purchase>('/purchases', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getPurchases: () => request<Purchase[]>('/purchases'),

  // --- Production ---
  previewProduction: (payload: { finished_item_id: number; batches_count: number }) =>
    request<{
      bom_id: number;
      bom_code: string;
      bom_name: string;
      finished_item_id: number;
      finished_item_name: string;
      batches_count: number;
      expected_output_packets: number;
      can_produce: boolean;
      ingredients: Array<{
        item_id: number;
        sku_code: string;
        name: string;
        unit: string;
        planned_qty: number;
        current_stock: number;
        is_sufficient: boolean;
        shortage: number;
        weighted_rate_paisa: number;
        estimated_cost_rupees: number;
      }>;
      pouch_packaging?: {
        item_id: number;
        name: string;
        planned_qty: number;
        current_stock: number;
        is_sufficient: boolean;
        shortage: number;
        estimated_cost_rupees: number;
      };
      carton_packaging?: {
        item_id: number;
        name: string;
        planned_qty: number;
        current_stock: number;
        is_sufficient: boolean;
        shortage: number;
        estimated_cost_rupees: number;
      };
    }>('/production/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  runProduction: (payload: {
    finished_item_id: number;
    batches_count: number;
    raw_materials_issued: Array<{ item_id: number; actual_qty: number }>;
    actual_good_packets: number;
    damaged_pouches: number;
    cartons_used: number;
    labour_cost_paisa: number;
    overhead_cost_paisa: number;
    run_date?: string;
    created_by?: number;
  }) =>
    request<ProductionRun>('/production/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startProductionBatch: (payload: ProductionBatchStartPayload) =>
    request<{
      run_id: number;
      run_number: string;
      finished_item_id: number;
      finished_item_name: string;
      finished_item_sku: string;
      batches_count: number;
      expected_output_packets: number;
      status: string;
      has_variance_alert: boolean;
      raw_materials_breakdown: any[];
    }>('/production/runs/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  completeProductionBatch: (runId: number, payload: ProductionBatchCompletePayload) =>
    request<ProductionRun>(`/production/runs/${runId}/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProductionRuns: () => request<ProductionRun[]>('/production/runs'),

  updateOverheads: (
    runId: number,
    payload: { labour_cost_paisa: number; overhead_cost_paisa: number; updated_by?: number }
  ) =>
    request<{
      run_id: number;
      total_batch_cost_paisa: number;
      cost_per_packet_paisa: number;
      cost_per_packet_rupees: number;
      gross_margin_pct: number;
    }>(`/production/runs/${runId}/overheads`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // --- Sales Orders ---
  submitSalesOrder: (payload: {
    customer_id: number;
    salesman_id: number;
    items: Array<{ item_id: number; qty_packets: number; unit_price_paisa?: number }>;
    order_date?: string;
    notes?: string;
    delivery_destination?: string;
    client_offline_id?: string;
    created_by?: number | string;
  }) =>
    request<{
      order_id: number;
      order_number: string;
      customer_name: string;
      applicable_tax_type: string;
      status: string;
      has_shortage: boolean;
      items: Array<{
        name: string;
        requested_qty: number;
        available_qty: number;
        shortage_qty: number;
        is_shortage: boolean;
        production_recommendation?: {
          batches_needed: number;
          expected_output_packets: number;
          raw_materials_sufficient: boolean;
        } | null;
      }>;
    }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getOrders: (params?: { customer_id?: number; salesman_id?: number; order_status?: string }) => {
    const q = new URLSearchParams();
    if (params?.customer_id) q.set('customer_id', String(params.customer_id));
    if (params?.salesman_id) q.set('salesman_id', String(params.salesman_id));
    if (params?.order_status) q.set('order_status', params.order_status);
    return request<SalesOrder[]>(`/orders?${q.toString()}`);
  },

  getOrderDetail: (orderId: number) => request<SalesOrder>(`/orders/${orderId}`),

  approveOrder: (
    orderId: number,
    payload: {
      item_adjustments?: Array<{ item_id: number; qty_packets?: number; unit_price_paisa?: number }>;
      invoice_date?: string;
      approved_by?: number;
      allow_partial?: boolean;
      is_partial?: boolean;
    }
  ) =>
    request<Invoice>(`/orders/${orderId}/approve-invoice`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  holdOrderForStock: (orderId: number) =>
    request<{ message: string; order_id: number; status: string }>(`/orders/${orderId}/hold-stock`, {
      method: 'POST',
    }),

  rejectOrder: (orderId: number) =>
    request<{ message: string }>(`/orders/${orderId}/reject`, {
      method: 'POST',
    }),

  // --- Invoices ---
  getInvoices: async (params?: { customer_id?: number; inv_status?: string }): Promise<Invoice[]> => {
    const q = new URLSearchParams();
    if (params?.customer_id) q.set('customer_id', String(params.customer_id));
    if (params?.inv_status) q.set('inv_status', params.inv_status);
    try {
      const res = await request<any>(`/invoices?${q.toString()}`);
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.invoices)) return res.invoices;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    } catch {
      try {
        const res2 = await request<any>(`/sales/invoices?${q.toString()}`);
        if (Array.isArray(res2)) return res2;
        if (Array.isArray(res2?.invoices)) return res2.invoices;
        if (Array.isArray(res2?.data)) return res2.data;
        return [];
      } catch {
        return [];
      }
    }
  },

  getInvoiceDetail: (invoiceId: number) => request<Invoice>(`/invoices/${invoiceId}`),

  dispatchInvoice: (
    invoiceId: number,
    payload?: {
      dispatched_by?: number;
      transporter_name?: string;
      vehicle_number?: string;
      eway_bill_no?: string;
    } | number
  ) => {
    let bodyObj: any = undefined;
    let queryParam = '';
    if (typeof payload === 'number') {
      queryParam = `?dispatched_by=${payload}`;
    } else if (payload && typeof payload === 'object') {
      bodyObj = payload;
      if (payload.dispatched_by) {
        queryParam = `?dispatched_by=${payload.dispatched_by}`;
      }
    }
    return request<Invoice>(`/invoices/${invoiceId}/dispatch${queryParam}`, {
      method: 'POST',
      body: bodyObj ? JSON.stringify(bodyObj) : undefined,
    });
  },

  confirmInvoiceDelivery: (invoiceId: number, payload?: { pod_reference?: string; delivered_by?: number }) =>
    request<{ message: string; invoice_id: number; status: string }>(`/invoices/${invoiceId}/confirm-delivery`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  confirmOrderDelivery: (orderId: number, payload?: { pod_reference?: string; delivered_by?: number }) =>
    request<{ message: string; order_id: number; status: string }>(`/orders/${orderId}/confirm-delivery`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  issueCreditNote: (invoiceId: number, reason: string, cancelledBy?: number) =>
    request<CreditNote>(`/invoices/${invoiceId}/credit-note`, {
      method: 'POST',
      body: JSON.stringify({ reason, cancelled_by: cancelledBy }),
    }),

  getInvoicePdfUrl: (invoiceId: number) => `/api/invoices/${invoiceId}/pdf`,

  // --- Payments & Receivables ---
  recordPayment: (payload: {
    customer_id: number;
    amount_paisa: number;
    payment_mode: string;
    payment_date?: string;
    invoice_id?: number;
    receipt_number?: string;
    created_by?: number;
  }) =>
    request<Payment>('/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPayments: (customerId?: number) => {
    const q = customerId ? `?customer_id=${customerId}` : '';
    return request<Payment[]>(`/payments${q}`);
  },

  getReceivables: (customerId?: number) => {
    const q = customerId ? `?customer_id=${customerId}` : '';
    return request<CustomerReceivable[]>(`/payments/receivables${q}`);
  },

  // --- Dashboard & Reports ---
  getOwnerDashboard: () => request<OwnerDashboardMetrics>('/dashboard/owner'),

  getReport: (reportType: string, format: 'json' | 'csv' | 'xlsx' = 'json') => {
    if (format === 'json') {
      return request<{ report_title: string; data: any }>(`/reports/${reportType}?format=json`);
    }
    // Return direct download URL for csv/xlsx
    return `/api/reports/${reportType}?format=${format}`;
  },

  getLedgerIntegrityAudit: () =>
    request<{
      status: string;
      integrity_score: string;
      paisa_drift: number;
      total_items_checked: number;
      total_invoices_checked: number;
      checks: Array<{ check: string; passed: boolean; details: string }>;
      issues: string[];
      timestamp: string;
    }>('/reports/audit/integrity-check'),
};
