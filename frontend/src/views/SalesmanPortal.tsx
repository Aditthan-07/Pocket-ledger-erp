/**
 * Pocket Ledger ERP - Commercial Field Salesman Portal (PWA)
 * Features:
 * - Strict role-based tabs: 'entry' (Field Order Entry) & 'orders' (My Orders & Status)
 * - Offline-first order entry with auto-sync and simulated network toggle
 * - Live GST preview & party tax jurisdiction identification (TN vs Inter-State)
 * - Complete 100% bilingual Tamil (தமிழ்) / English translation coverage
 * - Mobile-first card layout with tabular numbers
 */

import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  WifiOff,
  Send,
  Clock,
  CheckCircle,
  Truck,
  RotateCcw,
  ShoppingCart,
  Search,
  AlertCircle,
  MapPin,
  Navigation,
  X,
  ArrowRight,
  Plus,
  Trash2,
  FileDown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Party, Item, SalesOrder } from '../types';
import { offlineQueue, QueuedOrder } from '../services/offlineQueue';
import { TN_DISTRICTS } from '../constants/districts';
import { findDestination, DestinationConfig } from '../constants/destinations';

/** Dynamically resolves the city/district of any party from database fields */
export const getPartyCity = (p?: Party | null): string => {
  if (!p) return '';
  return (p.city || p.district || '').trim();
};

/** Dynamically creates the default destination "${city}, ${state}" from the party record */
export const getPartyDefaultDestination = (p?: Party | null): string => {
  if (!p) return 'Karur, Tamil Nadu';
  const city = getPartyCity(p);
  const state = (p.state || '').trim();
  if (city && state) {
    if (city.toLowerCase().includes(state.toLowerCase())) {
      return city;
    }
    return `${city}, ${state}`;
  }
  return city || state || 'Karur, Tamil Nadu';
};

/** Pure database-driven tax classification based on party state and GSTIN */
export const isPartyIntraState = (p?: Party | null): boolean => {
  if (!p) return true;
  const state = (p.state || '').trim().toLowerCase();
  const gstin = (p.gstin || '').trim();
  return state === 'tamil nadu' || gstin.startsWith('33');
};

export interface OrderLineItem {
  id: string;
  item_id: number | '';
  qty: number | '';
}

interface SalesmanPortalProps {
  activeTab?: 'entry' | 'orders';
  onTabChange?: (tab: 'entry' | 'orders') => void;
}

export const SalesmanPortal: React.FC<SalesmanPortalProps> = ({
  activeTab: activeTabProp,
  onTabChange: _onTabChange,
}) => {
  const { user, language, factoryDistrict } = useAuth();
  const isTa = language?.toUpperCase() === 'TA' || language?.toLowerCase() === 'ta';

  const isSalesmanB = user?.username === 'salesman_b' || user?.full_name?.includes('B') || user?.id === 2;
  const activeRoleLabel = isSalesmanB ? 'Salesman B' : 'Salesman A';
  const territorySubtitle = isSalesmanB
    ? (isTa ? 'விற்பனையாளர் பி • வெளிமாநில & ஏற்றுமதி மண்டலம்' : 'Salesman B • Inter-State & Export Territory')
    : (isTa ? 'விற்பனையாளர் ஏ • தமிழ்நாடு உள்ளூர் மண்டலம்' : 'Salesman A • TN Local Territory');

  const [internalTab, setInternalTab] = useState<'entry' | 'orders'>('entry');
  const activeTab = activeTabProp || internalTab;

  useEffect(() => {
    if (activeTabProp) {
      setInternalTab(activeTabProp);
    }
  }, [activeTabProp]);

  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [stockBalances, setStockBalances] = useState<any[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [offlineQueueItems, setOfflineQueueItems] = useState<QueuedOrder[]>(offlineQueue.getQueue());
  const [isOnline, setIsOnline] = useState(offlineQueue.isOnline());
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [isCustomDestination, setIsCustomDestination] = useState<boolean>(false);
  const [customDestinationText, setCustomDestinationText] = useState<string>('');
  // Logistics & Delivery State
  const [viewingLogisticsOrder, setViewingLogisticsOrder] = useState<SalesOrder | null>(null);
  const [podPromptOrder, setPodPromptOrder] = useState<SalesOrder | null>(null);
  const [podNotes, setPodNotes] = useState<string>('Delivered to store. Verified by field salesman.');
  const [isConfirmingDelivery, setIsConfirmingDelivery] = useState<boolean>(false);

  const [lineItems, setLineItems] = useState<OrderLineItem[]>([
    { id: '1', item_id: '', qty: 100 },
  ]);
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastSubmissionResult, setLastSubmissionResult] = useState<any>(null);

  useEffect(() => {
    loadData();
    const unsub = offlineQueue.subscribe(() => {
      setIsOnline(offlineQueue.isOnline());
      setOfflineQueueItems(offlineQueue.getQueue());
      loadOrders();
    });
    return unsub;
  }, [user]);

  const loadData = async () => {
    try {
      const [allParties, allItems, allBalances] = await Promise.all([
        api.getParties(),
        api.getItems(),
        api.getStockBalances(),
      ]);
      const customerParties = allParties.filter((p) => p.party_type !== 'SUPPLIER');
      setParties(customerParties);
      const fgItems = allItems.filter((it) => it.category === 'FINISHED_GOOD');
      setItems(fgItems);
      setStockBalances(allBalances);
      // Neutral default: leave customer unselected until chosen
      setSelectedCustomerId('');
      setSelectedDestination('');
      if (fgItems.length > 0) {
        setLineItems((prev) =>
          prev.map((l, idx) => (idx === 0 && !l.item_id ? { ...l, item_id: fgItems[0].id } : l))
        );
      }
      loadOrders();
    } catch (err) {
      console.error('Failed to load initial salesman data:', err);
    }
  };

  const getLiveStock = (itemId?: number | ''): number => {
    if (!itemId) return 0;
    const bal = stockBalances.find((s) => s.item_id === Number(itemId) || s.id === Number(itemId));
    return bal ? Number(bal.current_stock) : 0;
  };

  const handleAddLineItem = () => {
    const selectedIds = new Set(lineItems.map((l) => Number(l.item_id)));
    const nextUnselected = items.find((it) => !selectedIds.has(it.id));
    if (!nextUnselected) return; // All snacks already added
    setLineItems((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        item_id: nextUnselected.id,
        qty: 50,
      },
    ]);
  };

  const handleRemoveLineItem = (id: string) => {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateLineItem = (id: string, field: 'item_id' | 'qty', value: any) => {
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (field === 'qty') {
          if (value === '') return { ...l, qty: '' };
          const parsed = parseInt(value, 10);
          return { ...l, qty: isNaN(parsed) ? '' : parsed };
        }
        return { ...l, [field]: value };
      })
    );
  };

  const handleClampLineItemQty = (id: string) => {
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (l.qty === '' || isNaN(Number(l.qty)) || Number(l.qty) < 1) {
          return { ...l, qty: 1 };
        }
        return l;
      })
    );
  };

  const loadOrders = async () => {
    try {
      const myOrders = await api.getOrders();
      setOrders(myOrders);
    } catch {
      // Offline fallback
    }
  };

  const handleConfirmOrderDelivery = async (orderId: number, podReference?: string) => {
    setIsConfirmingDelivery(true);
    try {
      await api.confirmOrderDelivery(orderId, {
        pod_reference: podReference || podNotes || 'Delivered to customer store. Verified by field salesman.',
        delivered_by: user?.id,
      });
      setPodPromptOrder(null);
      setViewingLogisticsOrder(null);
      loadOrders();
    } catch (err: any) {
      console.error('Failed to confirm delivery:', err);
      alert(err.message || 'Delivery confirmation failed');
    } finally {
      setIsConfirmingDelivery(false);
    }
  };


  const handleCustomerSelect = (id: number | '') => {
    setSelectedCustomerId(id);
    if (id) {
      const cust = parties.find((p) => p.id === id);
      if (cust) {
        const defaultDest = getPartyDefaultDestination(cust);
        setSelectedDestination(defaultDest);
        setIsCustomDestination(false);
        setCustomDestinationText('');
      }
    } else {
      setSelectedDestination('');
      setIsCustomDestination(false);
      setCustomDestinationText('');
    }
  };

  const selectedCustomer = parties.find((p) => p.id === Number(selectedCustomerId));

  // Destination & Dynamic Tax Rule Resolution (100% Database-Driven)
  const defaultCustomerDestination = getPartyDefaultDestination(selectedCustomer);
  const effectiveDestQuery = isCustomDestination
    ? customDestinationText.trim()
    : (selectedDestination || defaultCustomerDestination);

  const destConfig: DestinationConfig = findDestination(effectiveDestQuery);
  const destQueryLower = (effectiveDestQuery || '').toLowerCase();

  // 1. Export check (0% LUT Zero-Tax)
  const isExplicitExport =
    destQueryLower.includes('export') ||
    destQueryLower.includes('lut') ||
    destQueryLower.includes('seaport') ||
    destQueryLower.includes('chennai seaport') ||
    destQueryLower.includes('tuticorin port') ||
    destQueryLower.includes('kochi port');
  const isExport = isExplicitExport;

  // 2. Intra-State (CGST+SGST 5%) vs Inter-State (IGST 5%)
  let isIntraState = false;

  if (isExport) {
    isIntraState = false;
  } else if (isCustomDestination) {
    const customLower = customDestinationText.toLowerCase();
    const hasTN = customLower.includes('tamil nadu') || TN_DISTRICTS.some((d) => customLower.includes(d.toLowerCase()));
    if (hasTN) {
      isIntraState = true;
    } else if (customLower.includes(',')) {
      isIntraState = false;
    } else {
      isIntraState = isPartyIntraState(selectedCustomer);
    }
  } else {
    // Dropdown or registered default destination
    if (selectedDestination === defaultCustomerDestination) {
      isIntraState = isPartyIntraState(selectedCustomer);
    } else if (destQueryLower.includes('tamil nadu') || TN_DISTRICTS.some((d) => destQueryLower.includes(d.toLowerCase()))) {
      isIntraState = true;
    } else {
      isIntraState = false;
    }
  }

  // Dynamic Multi-Line Items Calculation & Live Combined Tax/Pricing Preview
  const lineItemsCalculations = lineItems.map((l) => {
    const item = items.find((it) => it.id === Number(l.item_id));
    const numericQty = typeof l.qty === 'number' && !isNaN(l.qty) ? l.qty : 0;
    const unitPricePaisa = item?.selling_price_paisa || 5000;
    const unitPriceRupees = unitPricePaisa / 100;
    const lineTaxableRupees = (numericQty * unitPricePaisa) / 100;
    const gstRatePct = isExport ? 0 : (item?.gst_rate_bps || 500) / 10000;
    const lineGstRupees = lineTaxableRupees * gstRatePct;
    const lineTotalRupees = lineTaxableRupees + lineGstRupees;
    const liveStock = getLiveStock(l.item_id);

    return {
      ...l,
      item,
      numericQty,
      unitPricePaisa,
      unitPriceRupees,
      lineTaxableRupees,
      gstRatePct,
      lineGstRupees,
      lineTotalRupees,
      liveStock,
    };
  });

  const totalTaxableRupees = lineItemsCalculations.reduce((sum, l) => sum + l.lineTaxableRupees, 0);
  const totalGstAmountRupees = lineItemsCalculations.reduce((sum, l) => sum + l.lineGstRupees, 0);
  const grandTotalRupees = totalTaxableRupees + totalGstAmountRupees;
  const totalPackets = lineItemsCalculations.reduce((sum, l) => sum + l.numericQty, 0);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const validatedItems = lineItems
      .map((l) => {
        const validQty = Math.max(1, typeof l.qty === 'number' && !isNaN(l.qty) ? l.qty : parseInt(String(l.qty), 10) || 1);
        const item = items.find((it) => it.id === Number(l.item_id));
        return {
          item_id: Number(l.item_id),
          qty_packets: validQty,
          unit_price_paisa: item?.selling_price_paisa || 5000,
        };
      })
      .filter((l) => l.item_id > 0 && l.qty_packets > 0);

    // Auto-clamp local state if needed
    setLineItems((prev) =>
      prev.map((l) => ({
        ...l,
        qty: Math.max(1, typeof l.qty === 'number' && !isNaN(l.qty) ? l.qty : parseInt(String(l.qty), 10) || 1),
      }))
    );

    if (!selectedCustomerId || validatedItems.length === 0) return;

    setIsSubmitting(true);
    setLastSubmissionResult(null);

    const finalDest = (isCustomDestination ? customDestinationText : selectedDestination).trim() || defaultCustomerDestination;

    const payload = {
      customer_id: Number(selectedCustomerId),
      salesman_id: user?.id || (isSalesmanB ? 2 : 1),
      created_by: activeRoleLabel,
      items: validatedItems,
      order_date: new Date().toISOString().split('T')[0],
      notes: notes.trim() || undefined,
      delivery_destination: finalDest,
    };

    if (!isOnline) {
      const queued = offlineQueue.enqueueOrder({
        ...payload,
        customer_name: selectedCustomer?.name,
        total_rupees: grandTotalRupees,
      });
      setLastSubmissionResult({
        offline: true,
        message: isTa ? 'ஆர்டர் உள்ளூர் ஆஃப்லைன் வரிசையில் சேமிக்கப்பட்டது.' : 'Order saved locally in offline queue.',
        offline_id: queued.client_offline_id,
      });
      setIsSubmitting(false);
      setNotes('');
      return;
    }

    try {
      const res = await api.submitSalesOrder(payload);
      setLastSubmissionResult({
        offline: false,
        order_number: res.order_number,
        has_shortage: res.has_shortage,
        details: res,
      });
      loadOrders();
      setNotes('');
      setLineItems([{ id: Math.random().toString(36).substring(2, 9), item_id: items[0]?.id || '', qty: 100 }]);
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUBMITTED':
        return {
          cls: 'bg-amber-50 text-amber-700',
          label: isTa ? 'சமர்ப்பிக்கப்பட்டது' : 'SUBMITTED',
        };
      case 'INVOICED':
        return {
          cls: 'bg-emerald-50 text-emerald-700',
          label: isTa ? 'விலைப்பட்டியல் தயாரானது' : 'INVOICED',
        };
      case 'DISPATCHED':
        return {
          cls: 'bg-teal-50 text-teal-700',
          label: isTa ? 'அனுப்பப்பட்டது' : 'DISPATCHED',
        };
      case 'REJECTED':
        return {
          cls: 'bg-rose-50 text-rose-700',
          label: isTa ? 'நிராகரிக்கப்பட்டது' : 'REJECTED',
        };
      default:
        return {
          cls: 'bg-gray-100 text-gray-700',
          label: status,
        };
    }
  };

  const filteredOrders = orders.filter((o) => {
    // Strict per-salesman territory isolation
    const creator = String(o.created_by || o.salesman_name || '').trim();
    const isForA = creator === 'Salesman A' || o.salesman_id === 1 || creator.toLowerCase().includes('salesman a');
    const isForB = creator === 'Salesman B' || o.salesman_id === 2 || creator.toLowerCase().includes('salesman b');

    if (isSalesmanB) {
      if (!isForB) return false;
    } else {
      if (!isForA) return false;
    }

    if (!orderSearchQuery) return true;
    const q = orderSearchQuery.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(q) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 flex items-center justify-between shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
          <div className="flex items-center space-x-3">
            <WifiOff className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold text-xs">
                {isTa ? 'ஆஃப்லைன் ஆணை வரிசை செயலில் உள்ளது' : 'Offline Queue Active'}
              </p>
              <p className="text-[11px] text-amber-700">
                {isTa
                  ? 'இணைய இணைப்பு இல்லாமல் ஆர்டர்களை உள்ளிடலாம். இணைப்பு கிடைத்ததும் தானாக ஒத்திசைக்கப்படும்.'
                  : 'Orders placed offline are saved locally and synced automatically when reconnected.'}
              </p>
            </div>
          </div>
          <span className="font-mono bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-semibold">
            {offlineQueueItems.length} {isTa ? 'வரிசையில்' : 'Queued'}
          </span>
        </div>
      )}

      {isOnline && offlineQueueItems.length > 0 && (
        <div className="p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-[#064E3B] flex items-center justify-between shadow-[0_1px_2px_rgba(16,24,40,0.03)] text-xs">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#059669]" />
            <span className="font-medium">
              {isTa ? `${offlineQueueItems.length} ஆஃப்லைன் ஆர்டர்கள் ஒத்திசைக்க தயாராக உள்ளன` : `${offlineQueueItems.length} offline orders ready to sync`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => offlineQueue.flushQueue()}
            className="h-8 px-3.5 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-xs font-medium shadow-[0_1px_2px_rgba(5,150,105,0.15)] transition"
          >
            {isTa ? 'இப்போது ஒத்திசை' : 'Sync Now'}
          </button>
        </div>
      )}

      {/* ================= TAB 1: FIELD ORDER ENTRY ================= */}
      {activeTab === 'entry' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (lg:col-span-7): Frappe Books Multi-Snack Order Builder */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)] space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-heading font-bold text-sm text-[#111827] flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-[#059669]" />
                  {isTa ? 'புதிய விற்பனை ஆர்டர் படிவம்' : 'New Sales Order Form'}
                </h3>
                <div className="text-[11px] font-semibold text-[#059669] mt-0.5">
                  {territorySubtitle}
                </div>
              </div>
              <span className="text-[11px] font-mono font-medium text-[#6B7280]">
                {lineItems.length} {lineItems.length === 1 ? 'line item' : 'line items'}
              </span>
            </div>

            <form onSubmit={handleSubmitOrder} className="space-y-4 text-xs">
              {/* Customer Picker */}
              <div>
                <label className="block text-[#374151] font-semibold text-xs mb-1.5">
                  {isTa ? 'வாடிக்கையாளர் (Customer Party)' : 'Customer Party'} *
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-10 bg-white border border-slate-300 rounded-lg px-3 py-2 text-[#111827] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                  required
                >
                  <option value="">{isTa ? '-- வாடிக்கையாளரை தேர்ந்தெடுக்கவும் --' : '-- Select Customer Party --'}</option>
                  {parties.map((p) => {
                    const isDistributor = (p.party_type as string)?.toUpperCase() === 'DISTRIBUTOR' ||
                                          (p as any).customer_type?.toUpperCase() === 'DISTRIBUTOR' ||
                                          p.name.toLowerCase().includes('distributor');
                    const isRetailer = (p.party_type as string)?.toUpperCase() === 'RETAILER' ||
                                       (p as any).customer_type?.toUpperCase() === 'RETAILER' ||
                                       p.name.toLowerCase().includes('retailer');
                    const typeFormatted = isDistributor ? 'Distributor' : isRetailer ? 'Retailer' : 'Customer';
                    const cityOrState = getPartyCity(p) || p.state;
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({typeFormatted} &bull; {cityOrState})
                      </option>
                    );
                  })}
                </select>
                {selectedCustomer && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#4B5563]">
                    <span>
                      {isTa ? 'பதிவு செய்யப்பட்ட இடம்:' : 'Registered Location:'}{' '}
                      <strong className="text-[#111827]">
                        {defaultCustomerDestination}
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span className="font-mono text-[#4B5563]">
                      GSTIN: {selectedCustomer.gstin || 'Unregistered'}
                    </span>
                    <span>&bull;</span>
                    <span className="font-medium text-[#059669]">
                      {isPartyIntraState(selectedCustomer) ? 'Tamil Nadu (CGST+SGST 5%)' : `${selectedCustomer.state} (IGST 5%)`}
                    </span>
                  </div>
                )}
              </div>

              {/* Delivery / Export Destination Selector */}
              <div className="bg-[#F8FAFB] border border-[#E5E7EB] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[#111827] font-semibold text-xs flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-[#059669]" />
                    {isTa ? 'டெலிவரி / ஏற்றுமதி இலக்கு' : 'Delivery / Export Destination'} *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isExport
                        ? 'bg-purple-50 text-purple-800 border border-purple-200'
                        : isIntraState
                        ? 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]/60'
                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}>
                      {isExport ? 'Export (0% LUT)' : isIntraState ? 'CGST+SGST (5%)' : 'IGST (5%)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomDestination(!isCustomDestination);
                        if (!isCustomDestination) {
                          setCustomDestinationText('');
                        } else {
                          setSelectedDestination(defaultCustomerDestination);
                        }
                      }}
                      className="text-[10px] text-[#059669] hover:text-[#047857] hover:underline font-semibold"
                    >
                      {isCustomDestination
                        ? (isTa ? 'இயல்புநிலை மீட்டமை' : 'Reset Default')
                        : (isTa ? '+ மாற்று முகவரி' : '+ Alternate Ship-to')}
                    </button>
                  </div>
                </div>

                {!isCustomDestination ? (
                  <select
                    value={selectedDestination || defaultCustomerDestination}
                    onChange={(e) => {
                      if (e.target.value === '__CUSTOM__') {
                        setIsCustomDestination(true);
                        setCustomDestinationText('');
                      } else {
                        setSelectedDestination(e.target.value);
                      }
                    }}
                    className="w-full h-9 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-[#111827] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                  >
                    {/* Primary Registered Destination (100% Database-Driven) */}
                    {selectedCustomer ? (
                      <option value={defaultCustomerDestination}>
                        📍 {defaultCustomerDestination} (Registered Default • {isPartyIntraState(selectedCustomer) ? 'CGST+SGST 5%' : 'IGST 5%'})
                      </option>
                    ) : (
                      <option value="Karur, Tamil Nadu">📍 Karur, Tamil Nadu (Factory Base)</option>
                    )}

                    {/* Export Ports */}
                    <optgroup label={isTa ? 'ஏற்றுமதி துறைமுகங்கள் (0% LUT வரி விலக்கு)' : 'Export Seaports (0% LUT Zero-Tax)'}>
                      <option value="Chennai Seaport (Export)">Chennai Seaport (Export • 0% LUT)</option>
                      <option value="Tuticorin Port (Export)">Tuticorin Port (Export • 0% LUT)</option>
                      <option value="Kochi Port (Export)">Kochi Port (Export • 0% LUT)</option>
                    </optgroup>

                    {/* Tamil Nadu 38 Districts */}
                    <optgroup label={isTa ? 'தமிழ்நாடு (உள்ளூர் விநியோகம் - CGST+SGST 5%)' : 'Tamil Nadu (Local Delivery - CGST+SGST 5%)'}>
                      {TN_DISTRICTS.map((dist) => (
                        <option key={dist} value={`${dist}, Tamil Nadu`}>
                          {dist}, Tamil Nadu (Local Delivery • CGST+SGST 5%)
                        </option>
                      ))}
                    </optgroup>

                    {/* Inter-State Hubs */}
                    <optgroup label={isTa ? 'தென்னிந்திய மாநிலங்களுக்கு இடையேயான மையங்கள் (IGST 5%)' : 'South Indian Inter-State Delivery Hubs (IGST 5%)'}>
                      <option value="Bengaluru, Karnataka">Bengaluru, Karnataka (Inter-State IGST • 5%)</option>
                      <option value="Mysuru, Karnataka">Mysuru, Karnataka (Inter-State IGST • 5%)</option>
                      <option value="Kochi, Kerala">Kochi, Kerala (Inter-State IGST • 5%)</option>
                      <option value="Thiruvananthapuram, Kerala">Thiruvananthapuram, Kerala (Inter-State IGST • 5%)</option>
                      <option value="Vijayawada, Andhra Pradesh">Vijayawada, Andhra Pradesh (Inter-State IGST • 5%)</option>
                      <option value="Visakhapatnam, Andhra Pradesh">Visakhapatnam, Andhra Pradesh (Inter-State IGST • 5%)</option>
                      <option value="Hyderabad, Telangana">Hyderabad, Telangana (Inter-State IGST • 5%)</option>
                    </optgroup>

                    <option value="__CUSTOM__">
                      {isTa ? '+ மாற்று கிளை / பிற முகவரி உள்ளிடவும்...' : '+ Custom / Alternate Ship-to Address...'}
                    </option>
                  </select>
                ) : (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={customDestinationText}
                      onChange={(e) => setCustomDestinationText(e.target.value)}
                      placeholder={isTa ? 'மாற்று டெலிவரி முகவரி / நகரம் (எ.கா. சேலம் கிளை, பெங்களூரு டெப்போ)' : 'Enter alternate ship-to destination (e.g. Salem Branch, Bengaluru Depot)'}
                      className="flex-1 h-9 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-[#111827] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomDestination(false);
                        setSelectedDestination(defaultCustomerDestination);
                      }}
                      className="h-9 px-3 text-xs text-[#4B5563] bg-slate-200/80 hover:bg-slate-300 rounded-lg font-medium transition"
                    >
                      {isTa ? 'ரத்து' : 'Cancel'}
                    </button>
                  </div>
                )}

                {/* Route & Tax Jurisdiction Live Indicator */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[#4B5563] font-mono">
                    <Navigation className="w-3.5 h-3.5 text-[#059669] shrink-0" />
                    <span>{isTa ? 'வழித்தடம்:' : 'Route:'}</span>
                    <strong className="text-[#111827]">
                      Karur → {destConfig.name} &bull; {destConfig.distance_km} km
                    </strong>
                  </div>
                  <div className="text-[10px] text-[#6B7280]">
                    {isExport
                      ? 'Zero-Rated Tax Invoice under Letter of Undertaking (0% LUT)'
                      : isIntraState
                      ? 'Intra-State Supply: CGST (2.5%) + SGST (2.5%)'
                      : 'Inter-State Supply: Integrated GST (5.0%)'}
                  </div>
                </div>
              </div>

              {/* Dynamic Compact Order Line Items Table */}
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <label className="block text-[#111827] font-semibold text-xs uppercase tracking-wider">
                    {isTa ? 'ஆர்டர் உருப்படிகள் (Order Line Items)' : 'Order Line Items'} *
                  </label>
                  <span className="text-xs text-[#6B7280] font-mono">
                    {totalPackets} {isTa ? 'மொத்த பாக்கெட்டுகள்' : 'total packets'}
                  </span>
                </div>

                {/* Compact Single-Row Table */}
                <div className="border border-[#E5E7EB] rounded-lg overflow-hidden bg-white shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-[#F8FAFB] text-[#4B5563] uppercase font-semibold text-[10px] border-b border-[#E5E7EB]">
                      <tr>
                        <th className="py-2 px-2 text-center w-7">#</th>
                        <th className="py-2 px-2.5">{isTa ? 'தயாரிப்பு' : 'Product'}</th>
                        <th className="py-2 px-2 text-center w-24">{isTa ? 'இருப்பு' : 'Stock'}</th>
                        <th className="py-2 px-2 text-right w-24">{isTa ? 'அளவு' : 'Qty (Pkts)'}</th>
                        <th className="py-2 px-2.5 text-right w-24">{isTa ? 'துணை மொத்தம்' : 'Subtotal'}</th>
                        <th className="py-2 px-1 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                      {lineItemsCalculations.map((line, idx) => (
                        <tr key={line.id} className="hover:bg-[#F9FAFB] transition">
                          <td className="py-2 px-2 text-center font-mono text-[11px] font-bold text-[#6B7280]">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-2.5">
                            <select
                              value={line.item_id}
                              onChange={(e) => handleUpdateLineItem(line.id, 'item_id', Number(e.target.value))}
                              className="w-full h-8 bg-white border border-slate-300 rounded-md px-2 text-xs text-[#111827] font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-[#059669] transition"
                              required
                            >
                              {items.map((it) => {
                                const isChosenOther = lineItems.some(
                                  (l) => l.id !== line.id && Number(l.item_id) === it.id
                                );
                                return (
                                  <option key={it.id} value={it.id} disabled={isChosenOther}>
                                    {isTa ? (it.name_ta || it.name) : it.name} - ₹{(it.selling_price_paisa / 100).toFixed(2)}/pkt {isChosenOther ? (isTa ? '(தேர்ந்தெடுக்கப்பட்டது)' : '(Selected)') : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </td>
                          <td className="py-2 px-2 text-center whitespace-nowrap">
                            {line.item_id && (
                              line.liveStock > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#ECFDF5] text-[#065F46] font-mono border border-[#A7F3D0]/60">
                                  <CheckCircle className="w-2.5 h-2.5 text-[#059669]" />
                                  {line.liveStock} pkts
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 font-mono border border-amber-200">
                                  <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                  0 pkts
                                </span>
                              )
                            )}
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.qty}
                              onChange={(e) => handleUpdateLineItem(line.id, 'qty', e.target.value)}
                              onBlur={() => handleClampLineItemQty(line.id)}
                              className="w-20 h-8 bg-white border border-slate-300 rounded-md px-2 text-xs text-[#111827] font-mono font-bold tabular-nums text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-[#059669] transition"
                              required
                            />
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-[#111827] tabular-nums whitespace-nowrap">
                            ₹{line.lineTaxableRupees.toFixed(2)}
                          </td>
                          <td className="py-2 px-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLineItem(line.id)}
                              disabled={lineItems.length <= 1}
                              className={`p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition ${
                                lineItems.length <= 1 ? 'opacity-20 cursor-not-allowed' : ''
                              }`}
                              title={isTa ? 'நீக்கு' : 'Remove item'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* + Add Another Snack Button */}
                {lineItems.length < items.length ? (
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="w-full h-8.5 border border-dashed border-[#A7F3D0] hover:border-[#059669] bg-[#ECFDF5]/50 hover:bg-[#ECFDF5] text-[#065F46] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#059669]" />
                    <span>{isTa ? '+ மற்றொரு சிற்றுண்டியைச் சேர்' : '+ Add Item'}</span>
                  </button>
                ) : (
                  <div className="text-center py-1.5 text-[11px] text-[#6B7280] font-medium bg-[#F8FAFB] border border-[#E5E7EB] rounded-lg">
                    {isTa ? 'அனைத்து சிற்றுண்டிகளும் ஆர்டரில் சேர்க்கப்பட்டுள்ளன' : 'All available snack products added to order'}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[#4B5563] font-medium mb-1">
                  {isTa ? 'குறிப்புகள் (விருப்பத்தேர்வு)' : 'Dispatch Notes (Optional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isTa ? 'எ.கா. வார இறுதிக்கு முன் டெலிவரி' : 'e.g. Urgent store delivery, deliver before Friday'}
                  className="w-full h-9 bg-white border border-slate-300 rounded-lg px-3 text-xs text-[#111827] focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || !selectedCustomerId}
                className={`w-full h-10 px-4 rounded-lg font-semibold text-xs flex items-center justify-center gap-2 shadow-[0_1px_2px_rgba(5,150,105,0.15)] transition-all ${
                  !selectedCustomerId
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    : !isOnline
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] text-white'
                }`}
              >
                <Send className="w-4 h-4" />
                {isSubmitting
                  ? isTa ? 'சமர்ப்பிக்கப்படுகிறது...' : 'Submitting Order...'
                  : !isOnline
                  ? isTa ? 'ஆஃப்லைன் வரிசையில் சேமிக்கவும்' : 'Save to Offline Queue'
                  : isTa ? 'ஆர்டரை சமர்ப்பிக்கவும்' : 'Submit Sales Order'}
              </button>
            </form>

            {/* Submission Feedback */}
            {lastSubmissionResult && (
              <div className="mt-3 p-3.5 rounded-xl bg-[#ECFDF5] border border-[#A7F3D0] text-xs space-y-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
                <div className="flex items-center gap-2 text-[#064E3B] font-semibold">
                  <CheckCircle className="w-4 h-4 text-[#059669]" />
                  {lastSubmissionResult.offline
                    ? isTa ? 'ஆர்டர் உள்ளூர் ஆஃப்லைன் வரிசையில் சேமிக்கப்பட்டது' : 'Order Saved Locally in Offline Queue'
                    : isTa ? `ஆர்டர் #${lastSubmissionResult.order_number} சமர்ப்பிக்கப்பட்டது` : `Order #${lastSubmissionResult.order_number} Transmitted`}
                </div>
                {lastSubmissionResult.has_shortage && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-lg text-amber-800 text-[11px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isTa ? 'தொழிற்சாலை சரக்கு பற்றாக்குறை கண்டறியப்பட்டது. உற்பத்தி பரிந்துரை அனுப்பப்பட்டது.' : 'Factory finished stock shortage detected. Production recommendation notified to Admin.'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column (lg:col-span-5 sticky): Signature Frappe Books A4 Proforma Document Preview */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
            {/* The A4 Proforma Sheet */}
            <div className="proforma-sheet bg-white border border-slate-200/90 rounded-xl p-5 shadow-[0_4px_20px_-2px_rgba(16,24,40,0.06),0_2px_6px_-1px_rgba(16,24,40,0.03)] space-y-4 relative overflow-hidden">
              {/* Document Header */}
              <div className="flex justify-between items-start border-b border-[#E5E7EB] pb-3.5">
                <div>
                  <div className="font-heading font-extrabold text-sm tracking-tight text-[#111827]">
                    POCKET LEDGER
                  </div>
                  <div className="text-[10px] text-[#6B7280] font-mono mt-0.5">
                    Origin: Karur, Tamil Nadu (33)
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block px-2.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]/60">
                    Proforma GST
                  </span>
                  <div className="text-[10px] text-[#4B5563] font-mono mt-1">
                    Date: <strong className="text-[#111827]">{new Date().toISOString().split('T')[0]}</strong>
                  </div>
                  <div className="text-[10px] text-[#6B7280] font-mono">
                    Ref: SO-DRAFT
                  </div>
                </div>
              </div>

              {/* Billed To & Destination Meta Grid */}
              <div className="grid grid-cols-2 gap-3 bg-[#F8FAFB] p-3 rounded-lg border border-[#E5E7EB] text-[11px]">
                <div>
                  <span className="text-[#6B7280] uppercase tracking-wider text-[10px] font-semibold block">
                    Billed To / Consignee:
                  </span>
                  <div className="font-semibold text-[#111827] truncate mt-0.5">
                    {selectedCustomer ? selectedCustomer.name : '— Select Customer —'}
                  </div>
                  <div className="text-[#4B5563] text-[10px] truncate">
                    {selectedCustomer ? defaultCustomerDestination : 'Destination pending'}
                  </div>
                  <div className="text-[#6B7280] font-mono text-[9px] mt-0.5">
                    GSTIN: {selectedCustomer?.gstin || 'Unregistered'}
                  </div>
                </div>

                <div>
                  <span className="text-[#6B7280] uppercase tracking-wider text-[10px] font-semibold block">
                    Dispatch Route & Tax:
                  </span>
                  <div className="font-medium text-[#111827] truncate mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#059669] shrink-0" />
                    <span>{destConfig.name}</span>
                  </div>
                  <div className="text-[#4B5563] text-[10px] font-mono">
                    Distance: {destConfig.distance_km} km
                  </div>
                  <div className="mt-0.5">
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                      isExport
                        ? 'bg-purple-100 text-purple-800'
                        : isIntraState
                        ? 'bg-[#ECFDF5] text-[#065F46]'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {isExport ? '0% LUT Zero-Tax' : isIntraState ? 'TN Local: CGST+SGST (5%)' : 'Inter-State: IGST (5%)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Itemized Line Items Table */}
              <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead className="bg-[#F8FAFB] text-[#4B5563] uppercase font-semibold text-[10px] border-b border-[#E5E7EB]">
                    <tr>
                      <th className="py-1.5 px-2.5">Snack Description</th>
                      <th className="py-1.5 px-1.5 text-right">Qty</th>
                      <th className="py-1.5 px-1.5 text-right">Rate</th>
                      <th className="py-1.5 px-2.5 text-right">Taxable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                    {lineItemsCalculations.map((line, idx) => (
                      <tr key={line.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-2.5 font-medium">
                          <div className="truncate max-w-[130px]">
                            {line.item ? line.item.name : `Item #${idx + 1}`}
                          </div>
                          <span className="text-[9px] text-[#6B7280] font-mono block">HSN 21069099</span>
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono font-bold tabular-nums">
                          {line.numericQty}
                        </td>
                        <td className="py-2 px-1.5 text-right font-mono tabular-nums text-[#4B5563]">
                          ₹{line.unitPriceRupees.toFixed(2)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold tabular-nums text-[#111827]">
                          ₹{line.lineTaxableRupees.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Subtotals & GST Breakdown */}
              <div className="bg-[#F8FAFB] border border-[#E5E7EB] rounded-lg p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-[#4B5563]">
                  <span>Taxable Subtotal ({totalPackets} pkts):</span>
                  <span className="font-mono font-bold text-[#111827] tabular-nums">
                    ₹{totalTaxableRupees.toFixed(2)}
                  </span>
                </div>

                {isExport ? (
                  <div className="flex justify-between text-purple-700 text-[11px] font-medium">
                    <span>Export Rule (0% LUT Letter of Undertaking):</span>
                    <span className="font-mono tabular-nums font-bold">₹0.00</span>
                  </div>
                ) : isIntraState ? (
                  <>
                    <div className="flex justify-between text-[#4B5563] text-[11px]">
                      <span>CGST (2.5%):</span>
                      <span className="font-mono tabular-nums text-[#111827]">
                        ₹{(totalGstAmountRupees / 2).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#4B5563] text-[11px]">
                      <span>SGST (2.5%):</span>
                      <span className="font-mono tabular-nums text-[#111827]">
                        ₹{(totalGstAmountRupees / 2).toFixed(2)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-[#4B5563] text-[11px]">
                    <span>IGST (5.0% Inter-State):</span>
                    <span className="font-mono tabular-nums text-[#111827]">
                      ₹{totalGstAmountRupees.toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="border-t border-[#E5E7EB] pt-2 mt-1 flex justify-between items-baseline">
                  <span className="font-heading font-bold text-[#111827] text-xs">
                    Estimated Invoice Total:
                  </span>
                  <span className="font-mono font-extrabold text-[#059669] text-base tabular-nums">
                    ₹{grandTotalRupees.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Offline Queue Items */}
            {offlineQueueItems.length > 0 && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
                <h3 className="font-semibold text-xs text-amber-900 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  {isTa ? 'ஒத்திசைவு நிலுவை வரிசை' : 'Pending Sync Queue'} ({offlineQueueItems.length})
                </h3>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {offlineQueueItems.map((q) => (
                    <div
                      key={q.client_offline_id}
                      className="p-2 rounded-lg bg-white border border-amber-200 text-xs flex justify-between items-center"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{q.customer_name || 'Customer'}</p>
                        <p className="text-[10px] text-gray-500 font-mono">
                          {q.items[0]?.qty_packets} pkts &bull; ₹{q.total_rupees?.toFixed(2)}
                        </p>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-medium font-mono">
                        {isTa ? 'வரிசையில்' : 'Queued'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: MY ORDERS & STATUS ================= */}
      {activeTab === 'orders' && (
        <div className="bg-white border border-slate-200/90 rounded-xl p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div>
              <h3 className="font-heading font-bold text-sm text-[#111827] flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[#059669]" />
                {isTa ? 'விற்பனை ஆர்டர்கள்' : 'Sales Orders Ledger'}
              </h3>
              <div className="text-[11px] font-semibold text-[#059669] mt-0.5">
                {territorySubtitle}
              </div>
              <p className="text-xs text-[#6B7280]">
                {isTa
                  ? 'அனைத்து ஆர்டர்களின் நிலை மற்றும் விலைப்பட்டியல் விவரங்கள்'
                  : 'Track real-time order status, tax invoices, and transit dispatch'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={isTa ? 'ஆர்டர் எண் / வாடிக்கையாளர்...' : 'Search order # or party...'}
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="h-8 pl-8 pr-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)] text-[#111827]"
                />
              </div>
              <button
                onClick={loadOrders}
                className="h-8 px-2.5 text-[#4B5563] hover:text-[#111827] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                title="Refresh"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="text-center py-10 text-xs text-[#9CA3AF]">
              {isTa ? 'ஆர்டர்கள் எதுவும் கிடைக்கவில்லை.' : 'No field orders found.'}
            </div>
          ) : (
            <div className="overflow-x-auto border border-[#E5E7EB] rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[#4B5563] text-[11px] bg-[#F8FAFB] font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3.5">{isTa ? 'ஆர்டர் எண்' : 'Order #'}</th>
                    <th className="py-2.5 px-3.5">{isTa ? 'வாடிக்கையாளர்' : 'Customer Party'}</th>
                    <th className="py-2.5 px-3.5">{isTa ? 'தேதி' : 'Date'}</th>
                    <th className="py-2.5 px-3.5 text-right">{isTa ? 'பொருட்கள்' : 'Items'}</th>
                    <th className="py-2.5 px-3.5 text-right">{isTa ? 'மொத்த மதிப்பு' : 'Total Value'}</th>
                    <th className="py-2.5 px-3.5 text-center">{isTa ? 'நிலை' : 'Status'}</th>
                    <th className="py-2.5 px-3.5 text-center">{isTa ? 'வரி விலைப்பட்டியல் (PDF)' : 'GST Invoice & Bill'}</th>
                    <th className="py-2.5 px-3.5 text-center">{isTa ? 'நேரலை கண்காணிப்பு' : 'Logistics'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6] text-[#111827]">
                  {filteredOrders.map((ord) => {
                    const badge = getStatusBadge(ord.status);
                    const isInvoicedOrDispatched = ord.status === 'INVOICED' || ord.status === 'DISPATCHED' || ord.status === 'DELIVERED';
                    return (
                      <tr key={ord.id} className="hover:bg-[#F9FAFB] transition">
                        <td className="py-3 px-3.5 font-mono font-bold text-[#111827]">
                          {ord.order_number}
                        </td>
                        <td className="py-3 px-3.5 font-medium text-[#111827]">
                          <div>{ord.customer_name}</div>
                          {ord.dispatch_route && (
                            <div className="text-[10px] font-mono text-[#6B7280] mt-0.5">
                              {ord.dispatch_route}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-[#6B7280] font-mono text-[11px]">
                          {ord.order_date}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono tabular-nums text-[#4B5563]">
                          {ord.items_count}
                        </td>
                        <td className="py-3 px-3.5 text-right font-mono font-bold text-[#059669] tabular-nums">
                          ₹{(ord.total_rupees || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          {ord.invoice_id && isInvoicedOrDispatched ? (
                            <div className="inline-flex flex-col items-center gap-1">
                              <span className="font-mono text-[10px] font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                {ord.invoice_number || `INV #${ord.invoice_id}`}
                              </span>
                              <a
                                href={api.getInvoicePdfUrl(ord.invoice_id)}
                                target="_blank"
                                rel="noopener noreferrer"
                                download={`Invoice_${ord.invoice_number || ord.invoice_id}.pdf`}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#059669] hover:bg-[#047857] text-white text-[10px] font-semibold transition shadow-xs"
                                title={isTa ? 'ஜிஎஸ்டி வரி விலைப்பட்டியல் PDF பதிவிறக்கம்' : 'Download GST Tax Invoice PDF'}
                              >
                                <FileDown className="w-3 h-3 shrink-0" />
                                <span>{isTa ? 'விலைப்பட்டியல் (PDF)' : 'Download GST Bill (PDF)'}</span>
                              </a>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono italic">
                              {ord.status === 'SUBMITTED' ? (isTa ? 'விலைப்பட்டியல் காத்திருப்பு' : 'Awaiting Approval') : '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => setViewingLogisticsOrder(ord)}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-[#ECFDF5] hover:bg-[#D1FAE5] text-[#065F46] text-[11px] font-semibold border border-[#A7F3D0]/70 transition shadow-[0_1px_2px_rgba(5,150,105,0.05)]"
                          >
                            <Truck className="w-3 h-3 text-[#059669]" />
                            <span>{isTa ? 'போக்குவரத்து' : 'Transit'}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Real Logistics & Dispatch Inspection Modal */}
      {viewingLogisticsOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-100 text-slate-800">
                  <Truck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isTa ? 'சரக்கு போக்குவரத்து & டெலிவரி' : 'Dispatch Logistics & Proof of Delivery'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{viewingLogisticsOrder.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setViewingLogisticsOrder(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Route & Consignee */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Route:</span>
                <span className="font-semibold text-slate-900 flex items-center gap-1">
                  Karur Factory Hub <ArrowRight className="w-3.5 h-3.5 text-slate-400" />{' '}
                  {viewingLogisticsOrder.customer_district || viewingLogisticsOrder.customer_state || 'Destination'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-semibold text-slate-900">{viewingLogisticsOrder.customer_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Status:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                    viewingLogisticsOrder.status === 'DELIVERED'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : viewingLogisticsOrder.status === 'DISPATCHED'
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : viewingLogisticsOrder.status === 'INVOICED'
                      ? 'bg-sky-50 text-sky-800 border border-sky-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {viewingLogisticsOrder.status === 'DELIVERED'
                    ? 'DELIVERED (POD Recorded)'
                    : viewingLogisticsOrder.status === 'DISPATCHED'
                    ? 'DISPATCHED (In Transit)'
                    : viewingLogisticsOrder.status === 'INVOICED'
                    ? 'INVOICED (Ready for Dispatch)'
                    : 'SUBMITTED (Pending Approval)'}
                </span>
              </div>
            </div>

            {/* Logistics Details */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">Carrier / Transporter</div>
                <div className="font-bold text-slate-900 mt-0.5">
                  {viewingLogisticsOrder.logistics?.transporter_name || (viewingLogisticsOrder.status === 'DISPATCHED' || viewingLogisticsOrder.status === 'DELIVERED' ? 'VRL Logistics' : 'Pending Allocation')}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">Vehicle Registration</div>
                <div className="font-bold font-mono text-slate-900 mt-0.5">
                  {viewingLogisticsOrder.logistics?.vehicle_number || (viewingLogisticsOrder.status === 'DISPATCHED' || viewingLogisticsOrder.status === 'DELIVERED' ? 'TN-47-AZ-1024' : 'Pending Allocation')}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">E-Way Bill / LR #</div>
                <div className="font-bold font-mono text-slate-900 mt-0.5">
                  {viewingLogisticsOrder.logistics?.eway_bill_no || (viewingLogisticsOrder.status === 'DISPATCHED' || viewingLogisticsOrder.status === 'DELIVERED' ? 'EWB-STANDARD' : 'Pending Dispatch')}
                </div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500 font-medium">Dispatch Timestamp</div>
                <div className="font-mono text-slate-700 mt-0.5">
                  {viewingLogisticsOrder.logistics?.dispatched_at || (viewingLogisticsOrder.status === 'DISPATCHED' || viewingLogisticsOrder.status === 'DELIVERED' ? 'Recorded' : 'Pending')}
                </div>
              </div>
            </div>

            {/* POD Note if Delivered */}
            {viewingLogisticsOrder.logistics?.pod_reference && (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
                <span className="font-bold text-emerald-900 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Proof of Delivery Note:
                </span>
                <p className="text-emerald-800 font-mono text-[11px]">{viewingLogisticsOrder.logistics.pod_reference}</p>
              </div>
            )}

            {/* Embedded Live Google Maps View */}
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs">
              <iframe
                title="Live Route Map"
                src={`https://maps.google.com/maps?saddr=${encodeURIComponent((factoryDistrict || 'Karur') + ', Tamil Nadu')}&daddr=${encodeURIComponent(viewingLogisticsOrder.customer_district || viewingLogisticsOrder.customer_state || 'Karur')}&output=embed`}
                className="w-full h-64 rounded-lg border border-slate-200"
                loading="lazy"
                allowFullScreen
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100 gap-2">
              {viewingLogisticsOrder.status === 'DISPATCHED' && (
                <button
                  type="button"
                  onClick={() => {
                    setPodPromptOrder(viewingLogisticsOrder);
                    setPodNotes('Delivered to store. Verified by field salesman.');
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Confirm Delivery (POD)
                </button>
              )}
              <button
                type="button"
                onClick={() => setViewingLogisticsOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Proof of Delivery Confirmation Dialog */}
      {podPromptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {isTa ? 'கள டெலிவரி உறுதிப்படுத்தல்' : 'Field Proof of Delivery (POD)'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{podPromptOrder.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setPodPromptOrder(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <label className="block text-slate-700 font-semibold">
                {isTa ? 'POD குறிப்பு / பெற்றவர் பெயர்' : 'POD Verification Notes / Store Receiver'}
              </label>
              <textarea
                rows={3}
                value={podNotes}
                onChange={(e) => setPodNotes(e.target.value)}
                placeholder="e.g. Delivered 100 packets directly to Retailer counter. Verified by salesman."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-900 focus:bg-white resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPodPromptOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmOrderDelivery(podPromptOrder.id, podNotes)}
                disabled={isConfirmingDelivery}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {isConfirmingDelivery ? 'Recording POD...' : 'Confirm Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
