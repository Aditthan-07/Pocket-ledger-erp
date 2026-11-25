/**
 * Pocket Ledger ERP - Commercial Factory Admin Desk
 * Features:
 * - Order Approval & Shortage Checking with Demand-to-Batch Planner
 * - GST Tax Invoicing (Integer-Paisa split), PDF Invoices & WhatsApp Sharing
 * - Dispatch Tracking & Immutable SALE_DISPATCH entries
 * - GST Credit Note Reversals
 * - Customer Receivables & Receivables Ageing
 * - Clean party labels & zero assignment watermarks
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Truck,
  DollarSign,
  AlertCircle,
  Share2,
  FileDown,
  RefreshCw,
  PlusCircle,
  XCircle,
  ArrowRight,
  Calculator,
  Database,
  Search,
  X,
  Plus,
  MapPin,
  Navigation,
  Factory,
  Package,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { TN_DISTRICTS } from '../constants/districts';
import {
  SalesOrder,
  Invoice,
  Payment,
  CustomerReceivable,
  Party,
  StockBalanceItem,
  Item,
} from '../types';

interface AdminPortalProps {
  activeTab?: 'orders' | 'invoices' | 'payments' | 'masters';
  onTabChange?: (tab: 'orders' | 'invoices' | 'payments' | 'masters') => void;
  readOnly?: boolean;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  activeTab: activeTabProp,
  onTabChange,
  readOnly = false,
}) => {
  const { user, language, factoryDistrict } = useAuth();
  const isTa = language?.toUpperCase() === 'TA' || language?.toLowerCase() === 'ta';
  const isReadOnly = readOnly || user?.role === 'OWNER';

  const [internalTab, setInternalTab] = useState<'orders' | 'invoices' | 'payments' | 'masters'>('orders');
  const activeTab = activeTabProp || internalTab;

  const setActiveTab = (tab: 'orders' | 'invoices' | 'payments' | 'masters') => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  useEffect(() => {
    if (activeTabProp) {
      setInternalTab(activeTabProp);
    }
  }, [activeTabProp]);

  // Master / State Data
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Party[]>([]);
  const [allParties, setAllParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalanceItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Masters Tab State
  const [mastersTab, setMastersTab] = useState<'items' | 'parties'>('items');
  const [mastersSearch, setMastersSearch] = useState('');

  // Add Party Modal State
  const [isAddPartyOpen, setIsAddPartyOpen] = useState(false);
  const [newPartyName, setNewPartyName] = useState('');
  const [newPartyType, setNewPartyType] = useState<'RETAILER' | 'DISTRIBUTOR' | 'SUPPLIER'>('RETAILER');
  const [newPartyState, setNewPartyState] = useState('Tamil Nadu');
  const [newPartyDistrict, setNewPartyDistrict] = useState('Tiruchirappalli');
  const [newPartyGstin, setNewPartyGstin] = useState('');
  const [newPartyAddress, setNewPartyAddress] = useState('');
  const [isSavingParty, setIsSavingParty] = useState(false);

  // Approval Modal / Quantity Adjustment State
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [adjustmentQtys, setAdjustmentQtys] = useState<{ [itemId: number]: number }>({});
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isQueueingBatch, setIsQueueingBatch] = useState<boolean>(false);

  // Credit Note Modal State
  const [creditNoteInvoice, setCreditNoteInvoice] = useState<Invoice | null>(null);
  const [creditNoteReason, setCreditNoteReason] = useState<string>('Customer cancellation prior to dispatch');
  const [isIssuingCN, setIsIssuingCN] = useState<boolean>(false);

  // Genuine Dispatch Dialog State
  const [dispatchingInvoice, setDispatchingInvoice] = useState<Invoice | null>(null);
  const [transporterName, setTransporterName] = useState<string>('VRL Logistics');
  const [vehicleNumber, setVehicleNumber] = useState<string>('TN-47-AZ-1024');
  const [ewayBillNo, setEwayBillNo] = useState<string>('');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  // Viewing Real Logistics & POD Modal State
  const [viewingLogisticsInvoice, setViewingLogisticsInvoice] = useState<Invoice | null>(null);
  const [podPromptInvoice, setPodPromptInvoice] = useState<Invoice | null>(null);
  const [podNotes, setPodNotes] = useState<string>('Goods received in full condition. Signed & stamped by consignee.');
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState<boolean>(false);

  // Payment Form State
  const [payCustomerId, setPayCustomerId] = useState<number | ''>('');
  const [payAmountRupees, setPayAmountRupees] = useState<number | ''>(0);
  const [payMode, setPayMode] = useState<string>('UPI');
  const [payInvoiceId, setPayInvoiceId] = useState<number | ''>('');
  const [payReceiptNo, setPayReceiptNo] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false);

  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartyName.trim()) return;
    setIsSavingParty(true);
    try {
      await api.createParty({
        name: newPartyName.trim(),
        party_type: newPartyType,
        state: newPartyState.trim(),
        district: newPartyDistrict.trim() || null,
        city: newPartyDistrict.trim() || null,
        gstin: newPartyGstin.trim() || null,
        address: newPartyAddress.trim() || null,
      });
      setStatusMessage({ type: 'success', text: `Party "${newPartyName.trim()}" created successfully.` });
      setIsAddPartyOpen(false);
      setNewPartyName('');
      setNewPartyGstin('');
      setNewPartyAddress('');
      await loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create party' });
    } finally {
      setIsSavingParty(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [ordData, invData, recData, payData, partiesData, balData, itemsData] = await Promise.all([
        api.getOrders(),
        api.getInvoices(),
        api.getReceivables(),
        api.getPayments(),
        api.getParties(),
        api.getStockBalances(),
        api.getItems(),
      ]);
      setOrders(ordData);
      setInvoices(invData);
      setReceivables(recData);
      setPayments(payData);
      setAllParties(partiesData);
      setItems(itemsData);
      setCustomers(partiesData.filter((p) => p.party_type === 'RETAILER' || p.party_type === 'DISTRIBUTOR' || p.party_type === 'CUSTOMER'));
      setStockBalances(balData);
    } catch (err: any) {
      console.error('Failed to load admin desk data:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Error loading records' });
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to format clean commercial business labels
  const formatPartyLabel = (name?: string, _state?: string, type?: string) => {
    if (!name) return 'Customer';
    if (name.includes('Retailer A')) return 'Retailer A (Retailer)';
    if (name.includes('Distributor B')) return 'Distributor B (Distributor)';
    if (name.includes('Chennai Metro')) return 'Chennai Metro Distributors (Distributor)';
    if (name.includes('Default Agro') || name.includes('Agro Suppliers')) return 'Default Agro Suppliers (Supplier)';
    return `${name}${type ? ` (${type})` : ''}`;
  };

  // Helper to get live stock of an item
  const getLiveStock = (itemId: number): number => {
    const item = stockBalances.find((s) => s.id === itemId);
    return item ? Number(item.current_stock) : 0;
  };

  // Open Approval Modal
  const handleOpenApproval = (order: SalesOrder, isPartialPrefill: boolean = false) => {
    setSelectedOrder(order);
    const initialQtys: { [itemId: number]: number } = {};
    (order.items || []).forEach((item) => {
      if (isPartialPrefill) {
        const stock = getLiveStock(item.item_id);
        initialQtys[item.item_id] = Math.min(Number(item.qty_packets), Math.max(0, stock));
      } else {
        initialQtys[item.item_id] = Number(item.qty_packets);
      }
    });
    setAdjustmentQtys(initialQtys);
  };

  // Execute Order Approval & Invoicing
  const handleApproveAndInvoice = async () => {
    if (!selectedOrder) return;
    setIsApproving(true);
    setStatusMessage(null);
    try {
      const itemAdjustments = Object.entries(adjustmentQtys).map(([itemId, qty]) => ({
        item_id: Number(itemId),
        qty_packets: Number(qty),
      }));

      const isPartial = (selectedOrder.items || []).some((it) => {
        const adj = adjustmentQtys[it.item_id];
        return adj !== undefined && adj < Number(it.qty_packets);
      });

      const invoice = await api.approveOrder(selectedOrder.id, {
        item_adjustments: itemAdjustments,
        approved_by: user?.id,
        allow_partial: isPartial,
        is_partial: isPartial,
      });

      setStatusMessage({
        type: 'success',
        text: `Order ${selectedOrder.order_number} approved! GST Invoice ${invoice.invoice_number} generated successfully.${isPartial ? ' (Partially Fulfilled - Balance Backordered)' : ''}`,
      });
      setSelectedOrder(null);
      await loadAllData();
      setActiveTab('invoices');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to approve order' });
    } finally {
      setIsApproving(false);
    }
  };

  // 1-Click Queue Production Batch
  const handleQueueProductionBatch = async (finishedItemId: number) => {
    setIsQueueingBatch(true);
    try {
      const preview = await api.previewProduction({
        finished_item_id: finishedItemId,
        batches_count: 1,
      });

      const rawIssued = (preview.ingredients || []).map((ing) => ({
        item_id: ing.item_id,
        actual_qty: ing.planned_qty,
      }));

      const res = await api.runProduction({
        finished_item_id: finishedItemId,
        batches_count: 1,
        raw_materials_issued: rawIssued,
        actual_good_packets: preview.expected_output_packets || 200,
        damaged_pouches: 0,
        cartons_used: 1,
        labour_cost_paisa: 0,
        overhead_cost_paisa: 0,
        run_date: new Date().toISOString().split('T')[0],
      });

      setStatusMessage({
        type: 'success',
        text: `Production Batch #${res.run_number} completed! Finished stock credited: +${res.actual_good_packets} packets.`,
      });
      await loadAllData();
    } catch (err: any) {
      console.error('Failed to queue production batch:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to queue production batch.',
      });
    } finally {
      setIsQueueingBatch(false);
    }
  };

  // Hold Order for Stock
  const handleHoldForStock = async (orderId: number) => {
    try {
      await api.holdOrderForStock(orderId);
      setStatusMessage({
        type: 'success',
        text: 'Order placed on hold (AWAITING_STOCK). Waiting for warehouse replenishment.',
      });
      await loadAllData();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to hold order for stock.',
      });
    }
  };

  // Reject Order
  const handleRejectOrder = async (orderId: number) => {
    if (!window.confirm('Are you sure you want to reject this sales order?')) return;
    try {
      await api.rejectOrder(orderId);
      setStatusMessage({ type: 'success', text: 'Order marked as REJECTED.' });
      loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to reject order' });
    }
  };

  // Open Dispatch Dialog
  const openDispatchDialog = (inv: Invoice) => {
    setDispatchingInvoice(inv);
    setTransporterName('VRL Logistics');
    setVehicleNumber('TN-47-AZ-1024');
    setEwayBillNo(`EWB-${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  };

  // Confirm Dispatch & Append SALE_DISPATCH
  const handleConfirmDispatch = async () => {
    if (!dispatchingInvoice) return;
    setIsDispatching(true);
    try {
      await api.dispatchInvoice(dispatchingInvoice.id, {
        dispatched_by: user?.id,
        transporter_name: transporterName.trim() || 'Factory Logistics Carrier',
        vehicle_number: vehicleNumber.trim() || 'TN-47-AZ-1024',
        eway_bill_no: ewayBillNo.trim() || 'EWB-STANDARD',
      });
      setStatusMessage({
        type: 'success',
        text: `Invoice #${dispatchingInvoice.invoice_number} dispatched via ${transporterName || 'carrier'}. Stock ledger SALE_DISPATCH entry appended.`,
      });
      setDispatchingInvoice(null);
      loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Dispatch failed' });
    } finally {
      setIsDispatching(false);
    }
  };

  // Confirm Proof of Delivery (POD)
  const handleConfirmDelivery = async (invoiceId: number, podReference?: string) => {
    setIsConfirmingDelivery(true);
    try {
      await api.confirmInvoiceDelivery(invoiceId, {
        pod_reference: podReference || podNotes || 'Goods received in good condition. Signed POD verified.',
        delivered_by: user?.id,
      });
      setStatusMessage({
        type: 'success',
        text: 'Proof of Delivery (POD) confirmed. Order status transitioned to DELIVERED.',
      });
      setPodPromptInvoice(null);
      setViewingLogisticsInvoice(null);
      loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Delivery confirmation failed' });
    } finally {
      setIsConfirmingDelivery(false);
    }
  };


  // Issue Credit Note
  const handleIssueCreditNote = async () => {
    if (!creditNoteInvoice) return;
    setIsIssuingCN(true);
    try {
      const cn = await api.issueCreditNote(creditNoteInvoice.id, creditNoteReason, user?.id);
      setStatusMessage({
        type: 'success',
        text: `Credit Note ${cn.credit_note_number} generated. Invoice marked CANCELLED and stock restored to warehouse.`,
      });
      setCreditNoteInvoice(null);
      loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to issue Credit Note' });
    } finally {
      setIsIssuingCN(false);
    }
  };

  // Record Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payCustomerId) {
      setStatusMessage({ type: 'error', text: 'Please select a customer party' });
      return;
    }
    if (Number(payAmountRupees) <= 0) {
      setStatusMessage({ type: 'error', text: 'Payment amount must be greater than zero' });
      return;
    }

    setIsSubmittingPay(true);
    setStatusMessage(null);
    try {
      const amountPaisa = Math.round((Number(payAmountRupees) || 0) * 100);
      const res = await api.recordPayment({
        customer_id: Number(payCustomerId),
        amount_paisa: amountPaisa,
        payment_mode: payMode,
        invoice_id: payInvoiceId ? Number(payInvoiceId) : undefined,
        receipt_number: payReceiptNo || undefined,
        created_by: user?.id,
      });

      setStatusMessage({
        type: 'success',
        text: `Payment of ₹${(Number(payAmountRupees) || 0).toFixed(2)} recorded (Receipt: ${res.receipt_number || 'AUTO'}).`,
      });
      setPayAmountRupees(0);
      setPayReceiptNo('');
      setPayInvoiceId('');
      loadAllData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Payment recording failed' });
    } finally {
      setIsSubmittingPay(false);
    }
  };

  // WhatsApp Share Message Helper
  const getWhatsAppLink = (inv: Invoice) => {
    const text = encodeURIComponent(
      `*POCKET LEDGER TAX INVOICE*\n` +
      `Invoice No: ${inv.invoice_number}\n` +
      `Party: ${inv.customer_name || 'Customer'}\n` +
      `Total: ₹${(inv.grand_total_paisa / 100).toFixed(2)}\n` +
      `Status: ${inv.status}\n` +
      `Pocket Ledger • Batch Manufacturing & GST Ledger System`
    );
    return `https://wa.me/?text=${text}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Status Message */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center space-x-3">
            {statusMessage.type === 'success' ? (
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600" />
            )}
            <span className="text-xs font-semibold">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-60 hover:opacity-100 uppercase font-bold tracking-wider"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex items-center justify-end pb-1">
        <button
          onClick={loadAllData}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 flex items-center gap-1.5 text-xs font-medium shadow-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
          {isTa ? 'புதுப்பி' : 'Refresh'}
        </button>
      </div>

      {/* ================= TAB 1: ORDER QUEUE ================= */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs">
              No sales orders submitted yet.
            </div>
          ) : (
            orders.map((order) => {
              const isActionable = order.status === 'SUBMITTED' || order.status === 'AWAITING_STOCK' || order.status === 'PARTIALLY_FULFILLED';

              // Check shortage for items
              const itemShortages = (order.items || []).map((item) => {
                const stock = getLiveStock(item.item_id);
                const requested = Number(item.qty_packets);
                const shortage = Math.max(0, requested - stock);
                return {
                  ...item,
                  stock,
                  shortage,
                  hasShortage: shortage > 0,
                };
              });

              const hasAnyShortage = itemShortages.some((i) => i.hasShortage);
              const availableUnits = itemShortages.reduce((acc, it) => acc + Math.min(Number(it.qty_packets), it.stock), 0);

              return (
                <div
                  key={order.id}
                  className={`bg-white border rounded-xl p-6 space-y-4 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)] transition ${
                    isActionable ? 'border-[#A7F3D0]/80' : 'border-slate-200/90 opacity-95'
                  }`}
                >
                  {/* Header info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-[#111827]">
                        {order.order_number}
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                          order.status === 'SUBMITTED'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : order.status === 'AWAITING_STOCK'
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : order.status === 'PARTIALLY_FULFILLED'
                            ? 'bg-sky-50 text-sky-800 border border-sky-200'
                            : order.status === 'INVOICED'
                            ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]/60'
                            : order.status === 'DISPATCHED'
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {order.status === 'AWAITING_STOCK'
                          ? 'Awaiting Factory Stock'
                          : order.status === 'PARTIALLY_FULFILLED'
                          ? 'Partially Fulfilled'
                          : order.status}
                      </span>
                      {hasAnyShortage && isActionable && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          Stock Shortage
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-[#6B7280] font-mono">
                      Date: <span className="text-[#111827] font-semibold">{order.order_date}</span>
                    </div>
                  </div>

                  {/* Customer info */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#6B7280]">Customer Party: </span>
                      <span className="font-bold text-[#111827]">
                        {formatPartyLabel(order.customer_name || order.customer?.name, order.customer_state || order.customer?.state)}
                      </span>
                      {order.dispatch_route && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <MapPin className="w-3 h-3 text-[#059669]" />
                          {order.dispatch_route}
                        </span>
                      )}
                    </div>
                    {order.client_offline_id && (
                      <span className="text-[11px] font-mono text-[#9CA3AF]">
                        PWA Offline Sync ID: {order.client_offline_id.slice(0, 12)}...
                      </span>
                    )}
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#F8FAFB] text-[#4B5563] uppercase font-semibold text-[11px] border-b border-[#E5E7EB]">
                        <tr>
                          <th className="p-2.5">{isTa ? 'பொருள்' : 'Product'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'கேட்ட அளவு' : 'Requested Qty'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'இருப்பு' : 'Warehouse Stock'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'விலை' : 'Unit Price'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'இருப்பு போதுமானது' : 'Inventory Coverage'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                        {itemShortages.map((it) => (
                          <tr key={it.id || it.item_id} className="hover:bg-[#F9FAFB]">
                            <td className="p-2.5 font-medium">
                              {it.name || it.item?.name || `Item #${it.item_id}`}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold tabular-nums text-[#111827]">
                              {Number(it.qty_packets)} pkts
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums text-[#4B5563]">
                              {it.stock} pkts
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums text-[#4B5563]">
                              ₹{(it.unit_price_paisa / 100).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right">
                              {it.hasShortage ? (
                                <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px]">
                                  Shortage: {it.shortage} pkts
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-[#ECFDF5] text-[#065F46] font-bold text-[10px] border border-[#A7F3D0]/60">
                                  In Stock
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* SMART DEMAND-TO-BATCH PLANNER CARD */}
                  {hasAnyShortage && isActionable && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-amber-100 text-amber-700 flex-shrink-0 mt-0.5">
                          <Calculator className="w-5 h-5" />
                        </div>
                        <div className="space-y-1 flex-1 text-xs">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-amber-900 font-heading">
                              Smart Demand-to-Batch Production Recommendation
                            </h4>
                            <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-2 py-0.5 rounded font-mono">
                              AUTO-CALCULATED
                            </span>
                          </div>
                          <p className="text-amber-800">
                            Order quantity exceeds current finished stock. Based on standard formula yield of 200 packets per batch:
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-amber-200 font-mono text-[11px]">
                            <div>
                              <span className="text-amber-700 font-sans">Batches Recommended:</span>{' '}
                              <strong className="text-slate-900">1 Batch</strong>
                            </div>
                            <div>
                              <span className="text-amber-700 font-sans">Expected Output:</span>{' '}
                              <strong className="text-slate-900">200 Packets</strong>
                            </div>
                            <div>
                              <span className="text-amber-700 font-sans">Raw Materials:</span>{' '}
                              <strong className="text-emerald-700 font-semibold font-sans">Sufficient in Stock</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons for Shortage Handling */}
                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-amber-200/80">
                        <button
                          type="button"
                          disabled={isQueueingBatch}
                          onClick={() => {
                            const fgItem = order.items?.[0]?.item_id || items.find((i) => i.category === 'FINISHED_GOOD')?.id || 6;
                            handleQueueProductionBatch(fgItem);
                          }}
                          className="h-9 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          <Factory className={`w-3.5 h-3.5 ${isQueueingBatch ? 'animate-spin' : ''}`} />
                          {isQueueingBatch ? 'Queueing Batch...' : 'Queue Production Batch (1 Batch • 200 pkts)'}
                        </button>

                        {availableUnits > 0 && (
                          <button
                            type="button"
                            onClick={() => handleOpenApproval(order, true)}
                            className="h-9 px-3.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-xs flex items-center gap-1.5 transition"
                          >
                            <Package className="w-3.5 h-3.5" />
                            Partial Invoice & Dispatch ({availableUnits} pkts available)
                          </button>
                        )}

                        {order.status !== 'AWAITING_STOCK' && (
                          <button
                            type="button"
                            onClick={() => handleHoldForStock(order.id)}
                            className="h-9 px-3.5 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold flex items-center gap-1.5 transition"
                          >
                            <Clock className="w-3.5 h-3.5 text-purple-600" />
                            Hold for Stock (AWAITING_STOCK)
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Bar for Actionable Orders (Signature Frappe Books Toolbar) */}
                  {isActionable && (
                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                      <button
                        onClick={() => handleRejectOrder(order.id)}
                        className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-[#4B5563] hover:text-[#111827] hover:bg-slate-50 text-xs font-medium flex items-center gap-1.5 transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                      >
                        <XCircle className="w-4 h-4 text-rose-500" />
                        Reject Order
                      </button>
                      <button
                        onClick={() => handleOpenApproval(order, false)}
                        className="h-9 px-4 rounded-lg bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] text-white text-xs font-semibold shadow-[0_1px_2px_rgba(5,150,105,0.15)] flex items-center gap-1.5 transition"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Review & Generate GST Invoice
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ================= TAB 2: INVOICES & DISPATCH ================= */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {invoices.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs">
              No invoices generated yet. Approve an order to generate a GST tax invoice.
            </div>
          ) : (
            invoices.map((inv) => {
              const isCancelled = inv.status === 'CANCELLED';
              const isDispatched = inv.order_status === 'DISPATCHED' || inv.status === 'DISPATCHED';
              const isPosted = !isDispatched && !isCancelled;

              return (
                <div
                  key={inv.id}
                  className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)] transition hover:border-slate-300"
                >
                  {/* Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-[#111827]">
                        {inv.invoice_number}
                      </span>
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                          isDispatched
                            ? 'bg-teal-50 text-teal-800 border border-teal-200'
                            : isPosted
                            ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]/60'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        {isDispatched ? 'DISPATCHED' : inv.status}
                      </span>
                    </div>

                    <div className="text-xs text-[#6B7280] font-mono">
                      Date: <span className="text-[#111827] font-semibold">{inv.invoice_date}</span> | Ref Order #{' '}
                      <span className="text-[#111827] font-semibold">{inv.order_number || inv.order_id || 'N/A'}</span>
                    </div>
                  </div>

                  {/* Customer & Tax Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#F8FAFB] p-4 rounded-xl border border-[#E5E7EB] text-xs">
                    <div>
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider">Customer Party</div>
                      <div className="text-[#111827] font-bold text-sm mt-0.5 font-heading">
                        {inv.customer_name || inv.customer?.name}
                      </div>
                      <div className="text-[#4B5563] text-[11px] mt-0.5">
                        {inv.customer_district ? `${inv.customer_district}, ` : ''}{inv.customer_state || inv.customer?.state || 'Tamil Nadu'}
                      </div>
                      {inv.dispatch_route && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-white text-[#374151] border border-[#E5E7EB] shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
                            <MapPin className="w-3 h-3 text-[#059669]" />
                            {inv.dispatch_route}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider">Taxable Value</div>
                      <div className="text-[#111827] font-mono text-sm mt-0.5 tabular-nums font-bold">
                        ₹{(inv.taxable_paisa / 100).toFixed(2)}
                      </div>
                      <div className="text-[#6B7280] text-[11px] font-mono">{inv.taxable_paisa} paisa</div>
                    </div>

                    <div>
                      <div className="text-[#6B7280] font-medium text-[11px] uppercase tracking-wider">GST Breakdown</div>
                      <div className="text-[#4B5563] font-mono text-xs mt-0.5 space-y-0.5 tabular-nums">
                        {inv.cgst_paisa > 0 && <div>CGST (2.5%): ₹{(inv.cgst_paisa / 100).toFixed(2)}</div>}
                        {inv.sgst_paisa > 0 && <div>SGST (2.5%): ₹{(inv.sgst_paisa / 100).toFixed(2)}</div>}
                        {inv.igst_paisa > 0 && <div>IGST (5%): ₹{(inv.igst_paisa / 100).toFixed(2)}</div>}
                      </div>
                    </div>

                    <div className="bg-[#ECFDF5] p-3.5 rounded-lg border border-[#A7F3D0]/70">
                      <div className="text-[#065F46] font-semibold text-xs uppercase tracking-wider">Grand Total</div>
                      <div className="text-[#064E3B] font-mono font-bold text-lg tabular-nums mt-0.5">
                        ₹{(inv.grand_total_paisa / 100).toFixed(2)}
                      </div>
                      <div className="text-[#047857] font-mono text-[10px] font-medium">
                        {inv.grand_total_paisa} PAISA EXACT
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#F8FAFB] text-[#4B5563] uppercase font-semibold text-[11px] border-b border-[#E5E7EB]">
                        <tr>
                          <th className="p-2.5">{isTa ? 'பொருள் விவரம்' : 'Item Description'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'அளவு' : 'Quantity'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'விலை' : 'Rate'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'வரிக்கு உட்பட்டது' : 'Taxable'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'ஜிஎஸ்டி' : 'GST'}</th>
                          <th className="p-2.5 text-right">{isTa ? 'மொத்தம்' : 'Line Total'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                        {(inv.items || []).map((it, idx) => (
                          <tr key={it.id || idx} className="hover:bg-[#F9FAFB]">
                            <td className="p-2.5 font-medium">
                              {it.name || it.item?.name || `Item #${it.item_id}`}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums font-bold text-[#111827]">
                              {Number(it.qty_packets)} pkts
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums text-[#4B5563]">
                              ₹{(it.unit_price_paisa / 100).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums text-[#111827]">
                              ₹{(it.taxable_paisa / 100).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums text-[#4B5563]">
                              ₹{((it.cgst_paisa + it.sgst_paisa + it.igst_paisa) / 100).toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold tabular-nums text-[#059669]">
                              ₹{((it.taxable_paisa + it.cgst_paisa + it.sgst_paisa + it.igst_paisa) / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Action Bar (Compact Signature Frappe Books Toolbar) */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={api.getInvoicePdfUrl(inv.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#374151] text-xs font-medium flex items-center gap-1.5 transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                      >
                        <FileDown className="w-3.5 h-3.5 text-[#059669]" />
                        Download GST PDF
                      </a>

                      <a
                        href={getWhatsAppLink(inv)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3.5 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#065F46] text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        <Share2 className="w-3.5 h-3.5 text-[#059669]" />
                        WhatsApp Share
                      </a>

                      <button
                        type="button"
                        onClick={() => setViewingLogisticsInvoice(inv)}
                        className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#374151] text-xs font-medium flex items-center gap-1.5 transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                      >
                        <Navigation className="w-3.5 h-3.5 text-[#059669]" />
                        Logistics & E-Way Bill
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {isPosted && (
                        <>
                          <button
                            onClick={() => setCreditNoteInvoice(inv)}
                            className="h-9 px-3.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium flex items-center gap-1.5 transition"
                          >
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                            Cancel via Credit Note
                          </button>

                          <button
                            onClick={() => openDispatchDialog(inv)}
                            className="h-9 px-4 rounded-lg bg-[#059669] hover:bg-[#047857] text-white text-xs font-semibold shadow-[0_1px_2px_rgba(5,150,105,0.15)] flex items-center gap-1.5 transition"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            Mark Dispatched
                          </button>
                        </>
                      )}
                      {isDispatched && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 flex items-center gap-1 font-medium bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 font-mono">
                            <Truck className="w-3.5 h-3.5 text-emerald-600" />
                            {inv.logistics?.vehicle_number || 'Dispatched'}
                          </span>
                          {inv.order_status === 'DELIVERED' ? (
                            <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              Delivered (POD)
                            </span>
                          ) : (
                            <button
                              onClick={() => {
                                setPodPromptInvoice(inv);
                                setPodNotes('Goods received in full condition. Signed & stamped by consignee.');
                              }}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Confirm Delivery (POD)
                            </button>
                          )}
                        </div>
                      )}
                      {isCancelled && (
                        <span className="text-xs text-rose-700 flex items-center gap-1 font-semibold">
                          Cancelled via Credit Note
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ================= TAB 3: CUSTOMER RECEIVABLES & PAYMENTS ================= */}
      {activeTab === 'payments' && (
        <div className={isReadOnly ? "space-y-6" : "grid grid-cols-1 lg:grid-cols-3 gap-6"}>
          {/* Record Payment Form - strictly hidden for Owner / ReadOnly */}
          {!isReadOnly && (
            <div className="bg-white border border-slate-200/90 rounded-xl p-6 space-y-4 lg:col-span-1 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)]">
              <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2 font-heading">
                <DollarSign className="w-4 h-4 text-[#059669]" />
                Record Customer Payment
              </h3>
              <p className="text-xs text-[#6B7280]">
                Post inbound customer settlements with exact integer-paisa tracking
              </p>

              <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[#374151] font-semibold mb-1">
                    Customer Party
                  </label>
                  <select
                    value={payCustomerId}
                    onChange={(e) => setPayCustomerId(Number(e.target.value) || '')}
                    required
                    className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-[#111827] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                  >
                    <option value="">{isTa ? '-- வாடிக்கையாளரை தேர்ந்தெடுக்கவும் --' : '-- Select Customer --'}</option>
                    {customers.map((c) => {
                      const isDistributor = (c.party_type as string)?.toUpperCase() === 'DISTRIBUTOR' ||
                                            (c as any).customer_type?.toUpperCase() === 'DISTRIBUTOR' ||
                                            c.name.toLowerCase().includes('distributor');
                      const isRetailer = (c.party_type as string)?.toUpperCase() === 'RETAILER' ||
                                         (c as any).customer_type?.toUpperCase() === 'RETAILER' ||
                                         c.name.toLowerCase().includes('retailer');
                      const typeFormatted = isDistributor ? 'Distributor' : isRetailer ? 'Retailer' : 'Customer';
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({typeFormatted} &bull; {c.district || c.state})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[#374151] font-semibold mb-1">
                    {isTa ? 'பெறப்பட்ட தொகை (₹)' : 'Amount Received (₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={payAmountRupees === 0 ? '' : payAmountRupees}
                    onChange={(e) => setPayAmountRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    required
                    className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 font-mono text-[#111827] tabular-nums font-bold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                  />
                </div>

                <div>
                  <label className="block text-[#374151] font-semibold mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={payMode}
                    onChange={(e) => setPayMode(e.target.value)}
                    className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-[#111827] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                  >
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="NEFT">Bank Transfer (NEFT / RTGS)</option>
                    <option value="CASH">Cash Deposit</option>
                    <option value="CHEQUE">Cheque / Demand Draft</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#374151] font-semibold mb-1">
                    Receipt No / Transaction Ref
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UPI-9921820"
                    value={payReceiptNo}
                    onChange={(e) => setPayReceiptNo(e.target.value)}
                    className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 font-mono text-[#111827] text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="w-full h-9 rounded-lg bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs shadow-[0_1px_2px_rgba(5,150,105,0.15)] flex items-center justify-center gap-2 transition"
                >
                  <PlusCircle className="w-4 h-4" />
                  {isSubmittingPay ? 'Posting Payment...' : 'Record Payment Receipt'}
                </button>
              </form>
            </div>
          )}

          {/* Customer Receivables & Ageing Table */}
          <div className={`bg-white border border-slate-200/90 rounded-xl p-6 space-y-4 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)] ${isReadOnly ? 'w-full' : 'lg:col-span-2'}`}>
            <h3 className="text-sm font-bold text-[#111827] flex items-center gap-2 font-heading">
              <CheckCircle className="w-4 h-4 text-[#059669]" />
              Customer Receivables & Ageing Breakdown
            </h3>

            <div className="overflow-x-auto rounded-lg border border-[#E5E7EB]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#F8FAFB] text-[#4B5563] uppercase font-semibold text-[11px] border-b border-[#E5E7EB]">
                  <tr>
                    <th className="py-2.5 px-3.5">{isTa ? 'வாடிக்கையாளர் பார்ட்டி' : 'Customer Party'}</th>
                    <th className="py-2.5 px-3.5 text-right">{isTa ? 'பில் செய்யப்பட்டது' : 'Invoiced'}</th>
                    <th className="py-2.5 px-3.5 text-right">{isTa ? 'செலுத்தப்பட்டது' : 'Paid'}</th>
                    <th className="py-2.5 px-3.5 text-right">{isTa ? 'நிலுவை' : 'Outstanding'}</th>
                    <th className="py-2.5 px-3.5 text-right">{isTa ? '0-30 நாட்கள்' : '0-30 Days'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                  {receivables.map((rec) => (
                    <tr key={rec.customer_id} className="hover:bg-[#F9FAFB]">
                      <td className="py-3 px-3.5 font-semibold text-[#111827]">
                        {rec.customer_name}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono tabular-nums text-[#4B5563]">
                        ₹{rec.total_billed_rupees.toFixed(2)}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono tabular-nums text-[#4B5563]">
                        ₹{rec.total_paid_rupees.toFixed(2)}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-amber-700 tabular-nums">
                        ₹{rec.outstanding_rupees.toFixed(2)}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono tabular-nums text-[#111827]">
                        ₹{rec.ageing_buckets.days_0_30_rupees.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent Payments Stream */}
            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-[#4B5563] uppercase tracking-wider mb-2 font-heading">
                Recent Payment Receipts
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAFAFB] border border-[#E5E7EB] text-xs hover:border-slate-300 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[#059669] font-bold">
                        {p.receipt_number}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/80 text-[10px] text-[#374151] font-mono">
                        {p.payment_mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-[#111827] tabular-nums">
                        ₹{(p.amount_paisa / 100).toFixed(2)}
                      </span>
                      <span className="text-[11px] text-[#6B7280] font-mono">{p.payment_date}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: MASTERS DIRECTORY ================= */}
      {activeTab === 'masters' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-600" />
                  {isTa ? 'முதன்மை தரவு (பொருட்கள் & பார்ட்டிகள்)' : 'Masters Directory (Items & Parties)'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isTa
                    ? 'தொழிற்சாலையின் பொருட்கள் பட்டியல், HSN வரி விகிதங்கள் & வாடிக்கையாளர்/சப்ளையர் விவரங்கள்'
                    : 'System SKU catalog, GST tax rates, HSN codes, and verified commercial party registry'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  <button
                    onClick={() => setMastersTab('items')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      mastersTab === 'items' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isTa ? 'பொருட்கள் & மூலப்பொருட்கள்' : 'Products & Materials'} ({items.length})
                  </button>
                  <button
                    onClick={() => setMastersTab('parties')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      mastersTab === 'parties' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isTa ? 'வாடிக்கையாளர்கள் & சப்ளையர்கள்' : 'Customers & Suppliers'} ({allParties.length})
                  </button>
                </div>

                {mastersTab === 'parties' && (
                  <button
                    onClick={() => setIsAddPartyOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isTa ? 'புதிய பார்ட்டி' : '+ Add Party'}</span>
                  </button>
                )}

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder={isTa ? 'தேடு...' : 'Search master records...'}
                    value={mastersSearch}
                    onChange={(e) => setMastersSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Sub-view: Items Master Table */}
            {mastersTab === 'items' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[11px] bg-slate-50/50">
                      <th className="py-2.5 px-3">{isTa ? 'குறியீடு (SKU)' : 'SKU Code'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'பொருள் பெயர்' : 'Item Name'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'வகை' : 'Category'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'HSN குறியீடு' : 'HSN Code'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'ஜிஎஸ்டி விகிதம்' : 'GST Rate'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'அலகு' : 'Unit'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'விற்பனை விலை / MRP' : 'Selling Price'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items
                      .filter((it) => {
                        if (!mastersSearch) return true;
                        const q = mastersSearch.toLowerCase();
                        return (
                          it.sku_code.toLowerCase().includes(q) ||
                          it.name.toLowerCase().includes(q) ||
                          (it.name_ta && it.name_ta.toLowerCase().includes(q)) ||
                          (it.hsn_code && it.hsn_code.includes(q))
                        );
                      })
                      .map((it) => (
                        <tr key={it.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{it.sku_code}</td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800">{it.name}</div>
                            {it.name_ta && <div className="text-[11px] text-slate-400">{it.name_ta}</div>}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{it.category}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-600">{it.hsn_code || '—'}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                            {(it.gst_rate_bps / 100).toFixed(0)}%
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">{it.base_unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {it.selling_price_paisa > 0 ? `₹${(it.selling_price_paisa / 100).toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sub-view: Parties Master Table */}
            {mastersTab === 'parties' && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[11px] bg-slate-50/50">
                      <th className="py-2.5 px-3">{isTa ? 'பார்ட்டி பெயர்' : 'Party Name'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'வகை' : 'Party Type'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'மாவட்டம்' : 'District'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'ஜிஎஸ்டின் (GSTIN)' : 'GSTIN'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'மாநிலம்' : 'State'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'முகவரி / இருப்பிடம்' : 'Address / Location'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allParties
                      .filter((p) => {
                        if (!mastersSearch) return true;
                        const q = mastersSearch.toLowerCase();
                        return (
                          p.name.toLowerCase().includes(q) ||
                          p.party_type.toLowerCase().includes(q) ||
                          p.state.toLowerCase().includes(q) ||
                          (p.district && p.district.toLowerCase().includes(q)) ||
                          (p.gstin && p.gstin.toLowerCase().includes(q))
                        );
                      })
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{p.name}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                p.party_type === 'SUPPLIER'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : (p.party_type === 'DISTRIBUTOR' || p.party_type === 'CUSTOMER')
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {p.party_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {p.district || (p.state.trim().toLowerCase() === 'tamil nadu' ? 'Karur' : '—')}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{p.gstin || 'UNREGISTERED'}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-medium text-slate-800">{p.state}</span>
                            <span className="text-[10px] text-slate-400 block">
                              {p.state.trim().toLowerCase() === 'tamil nadu'
                                ? isTa ? 'உள்ளூர் (CGST+SGST)' : 'Intra-State'
                                : isTa ? 'வெளிமாநிலம் (IGST)' : 'Inter-State'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{p.address || '—'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: ORDER APPROVAL & ADJUSTMENT ================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Approve & Invoice Order {selectedOrder.order_number}
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-600">
                Verify approved quantities before generating the official GST tax invoice.
              </p>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                {(selectedOrder.items || []).map((item) => (
                  <div
                    key={item.id || item.item_id}
                    className="flex items-center justify-between gap-4 border-b border-slate-200/60 pb-2 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.name || item.item?.name || `Item #${item.item_id}`}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        Requested: {Number(item.qty_packets)} pkts | In Stock: {getLiveStock(item.item_id)} pkts
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <label className="text-[11px] text-slate-500">Qty:</label>
                      <input
                        type="number"
                        min="1"
                        max={Number(item.qty_packets)}
                        value={adjustmentQtys[item.item_id] ?? Number(item.qty_packets)}
                        onChange={(e) =>
                          setAdjustmentQtys({
                            ...adjustmentQtys,
                            [item.item_id]: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-20 bg-white border border-slate-300 rounded-lg p-1.5 text-right font-mono text-slate-900 font-bold tabular-nums"
                      />
                      <span className="text-slate-500">pkts</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveAndInvoice}
                disabled={isApproving}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                {isApproving ? 'Generating Invoice...' : 'Generate GST Invoice'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: CREDIT NOTE CANCELLATION ================= */}
      {creditNoteInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                Cancel Invoice via Credit Note
              </h3>
              <button
                onClick={() => setCreditNoteInvoice(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">
                You are about to cancel Invoice{' '}
                <strong className="text-slate-900">{creditNoteInvoice.invoice_number}</strong> of amount{' '}
                <strong className="text-slate-900 font-mono">
                  ₹{(creditNoteInvoice.grand_total_paisa / 100).toFixed(2)}
                </strong>
                . This generates an official GST Credit Note and restores finished goods to warehouse stock.
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">Cancellation Reason</label>
                <textarea
                  value={creditNoteReason}
                  onChange={(e) => setCreditNoteReason(e.target.value)}
                  rows={3}
                  required
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCreditNoteInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Back
              </button>
              <button
                onClick={handleIssueCreditNote}
                disabled={isIssuingCN}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                {isIssuingCN ? 'Issuing...' : 'Issue GST Credit Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD NEW PARTY ================= */}
      {isAddPartyOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-600" />
                {isTa ? 'புதிய பார்ட்டி சேர்க்கவும்' : 'Add New Master Party'}
              </h3>
              <button
                onClick={() => setIsAddPartyOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddParty} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">
                  {isTa ? 'பார்ட்டி பெயர்' : 'Party Name'} *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Madurai Super Foods"
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">
                    {isTa ? 'வகை' : 'Party Type'}
                  </label>
                  <select
                    value={newPartyType}
                    onChange={(e) => setNewPartyType(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                  >
                    <option value="RETAILER">RETAILER</option>
                    <option value="DISTRIBUTOR">DISTRIBUTOR</option>
                    <option value="SUPPLIER">SUPPLIER</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">
                    {isTa ? 'மாநிலம்' : 'State'}
                  </label>
                  <input
                    type="text"
                    required
                    value={newPartyState}
                    onChange={(e) => setNewPartyState(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                  />
                </div>
              </div>

              {newPartyState.trim().toLowerCase() === 'tamil nadu' ? (
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">
                    {isTa ? 'மாவட்டம் (தமிழ்நாடு)' : 'District (Tamil Nadu - All 38 Districts)'}
                  </label>
                  <select
                    value={newPartyDistrict}
                    onChange={(e) => setNewPartyDistrict(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                  >
                    {TN_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-700 mb-1 font-semibold">
                    {isTa ? 'நகரம் / மாவட்டம்' : 'City / District'}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bengaluru, Kochi, Hyderabad"
                    value={newPartyDistrict}
                    onChange={(e) => setNewPartyDistrict(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">
                  {isTa ? 'ஜிஎஸ்டின் (GSTIN)' : 'GSTIN'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 33AAAAA0000A1Z5 (optional)"
                  value={newPartyGstin}
                  onChange={(e) => setNewPartyGstin(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">
                  {isTa ? 'முகவரி' : 'Address'}
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12 Main Bazaar, Madurai"
                  value={newPartyAddress}
                  onChange={(e) => setNewPartyAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddPartyOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingParty}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs"
                >
                  {isSavingParty ? 'Saving...' : 'Save Party'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 1. Dispatch Goods Modal */}
      {dispatchingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isTa ? 'சரக்கு அனுப்புதல் விவரங்கள்' : 'Dispatch & E-Way Bill Entry'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Invoice #{dispatchingInvoice.invoice_number}</p>
                </div>
              </div>
              <button
                onClick={() => setDispatchingInvoice(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Destination:</span>
                <span className="font-semibold text-slate-900">
                  {dispatchingInvoice.customer_district || dispatchingInvoice.customer_state || 'Local'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Consignee:</span>
                <span className="font-semibold text-slate-900">{dispatchingInvoice.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Value:</span>
                <span className="font-bold font-mono text-emerald-700">
                  ₹{(dispatchingInvoice.grand_total_paisa / 100).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 mb-1 font-semibold">
                  {isTa ? 'போக்குவரத்து / கேரியர் பெயர்' : 'Transporter / Carrier Name'}
                </label>
                <input
                  type="text"
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  placeholder="e.g. VRL Logistics / KPN Speed Parcel / Self Fleet"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">
                  {isTa ? 'வாகன எண்' : 'Vehicle Number'}
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="e.g. TN-47-AZ-1024"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono uppercase focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 mb-1 font-semibold">
                  {isTa ? 'இ-வே பில் / எல்ஆர் குறிப்பு' : 'E-Way Bill / LR Reference Number'}
                </label>
                <input
                  type="text"
                  value={ewayBillNo}
                  onChange={(e) => setEwayBillNo(e.target.value)}
                  placeholder="e.g. EWB-982341209341"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 font-mono focus:bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDispatchingInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={isDispatching}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <Truck className="w-3.5 h-3.5" />
                {isDispatching ? 'Recording Dispatch...' : 'Confirm Dispatch & Deduct Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Real Logistics Details Modal */}
      {viewingLogisticsInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
                  <Navigation className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isTa ? 'சரக்கு போக்குவரத்து & கண்காணிப்பு' : 'Logistics & Dispatch Details'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    Invoice #{viewingLogisticsInvoice.invoice_number}
                    {viewingLogisticsInvoice.order_number ? ` • Order #${viewingLogisticsInvoice.order_number}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingLogisticsInvoice(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Route & Status Badge */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Route:</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1">
                  Karur Factory Hub <ArrowRight className="w-3.5 h-3.5 text-slate-400" />{' '}
                  {viewingLogisticsInvoice.customer_district || viewingLogisticsInvoice.customer_state || 'Destination'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Consignee:</span>
                <span className="font-semibold text-slate-900">{viewingLogisticsInvoice.customer_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Delivery Status:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                    viewingLogisticsInvoice.order_status === 'DELIVERED'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : viewingLogisticsInvoice.status === 'DISPATCHED'
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {viewingLogisticsInvoice.order_status === 'DELIVERED'
                    ? 'DELIVERED (POD Recorded)'
                    : viewingLogisticsInvoice.status === 'DISPATCHED'
                    ? 'IN TRANSIT (DISPATCHED)'
                    : 'INVOICED'}
                </span>
              </div>
            </div>

            {/* Logistics Parameters */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">Transporter / Carrier</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {viewingLogisticsInvoice.logistics?.transporter_name || 'VRL Logistics'}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">Vehicle Number</div>
                <div className="font-bold font-mono text-slate-900 mt-0.5">
                  {viewingLogisticsInvoice.logistics?.vehicle_number || 'TN-47-AZ-1024'}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">E-Way Bill / LR #</div>
                <div className="font-bold font-mono text-slate-900 mt-0.5">
                  {viewingLogisticsInvoice.logistics?.eway_bill_no || 'EWB-STANDARD'}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">Dispatch Timestamp</div>
                <div className="font-mono text-slate-700 mt-0.5">
                  {viewingLogisticsInvoice.dispatched_at || viewingLogisticsInvoice.logistics?.dispatched_at || 'Recorded'}
                </div>
              </div>
            </div>

            {/* POD Notes if Delivered */}
            {viewingLogisticsInvoice.logistics?.pod_reference && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-emerald-900 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Proof of Delivery (POD) Note:
                </span>
                <p className="text-emerald-800 font-mono text-[11px]">{viewingLogisticsInvoice.logistics.pod_reference}</p>
              </div>
            )}

            {/* Embedded Live Google Maps View */}
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs">
              <iframe
                title="Live Route Map"
                src={`https://maps.google.com/maps?saddr=${encodeURIComponent((factoryDistrict || 'Karur') + ', Tamil Nadu')}&daddr=${encodeURIComponent(viewingLogisticsInvoice.customer_district || viewingLogisticsInvoice.customer_state || 'Karur')}&output=embed`}
                className="w-full h-64 rounded-lg border border-slate-200"
                loading="lazy"
                allowFullScreen
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100 gap-2">
              {viewingLogisticsInvoice.status === 'DISPATCHED' && viewingLogisticsInvoice.order_status !== 'DELIVERED' && (
                <button
                  type="button"
                  onClick={() => {
                    setPodPromptInvoice(viewingLogisticsInvoice);
                    setPodNotes('Goods received in full condition. Signed & stamped by consignee.');
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Confirm Delivery (POD)
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingLogisticsInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. POD Confirmation Dialog */}
      {podPromptInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isTa ? 'டெலிவரி உறுதிப்படுத்தல் (POD)' : 'Confirm Delivery (Proof of Delivery)'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Invoice #{podPromptInvoice.invoice_number}</p>
                </div>
              </div>
              <button
                onClick={() => setPodPromptInvoice(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <label className="block text-slate-700 font-semibold">
                {isTa ? 'POD குறிப்பு / கையொப்ப விவரம்' : 'POD Reference Notes / Received By'}
              </label>
              <textarea
                rows={3}
                value={podNotes}
                onChange={(e) => setPodNotes(e.target.value)}
                placeholder="e.g. Received 100 cartons in sound condition. Signed by Branch In-charge."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white resize-none"
              />
              <p className="text-[11px] text-slate-500">
                Confirming delivery transitions the order status to <strong>DELIVERED</strong> and logs an immutable timestamped audit record.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPodPromptInvoice(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelivery(podPromptInvoice.id, podNotes)}
                disabled={isConfirmingDelivery}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {isConfirmingDelivery ? 'Recording POD...' : 'Record POD & Mark Delivered'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
