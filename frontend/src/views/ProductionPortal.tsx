/**
 * Pocket Ledger ERP - Commercial Production Floor & Formula Master Portal
 * Features:
 * - 2-Step Batch Execution: ISSUED (Step A: lock inputs, 3% variance) -> COMPLETED (Step B: good output, packing scrap, unit costing)
 * - Formula Master Versioning: V1.0/V2.0 badges, clone recipe with ingredient tweaks, SKU pack-size configuration
 * - Interactive Live Scale Preview: 1x, 2x, 5x batch scaling with instant stock checks
 * - Inbound raw material purchases & post-run overhead adjustment
 * - Crisp commercial light-mode ERP styling with bilingual English | தமிழ்
 */

import React, { useState, useEffect } from 'react';
import {
  Layers,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Copy,
  Sliders,
  Clock,
  Package,
  Search,
  RotateCcw,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Party, Item, BOMHeader, ProductionRun, Purchase, StockLedgerEntry } from '../types';

interface ProductionPortalProps {
  activeTab?: 'batches' | 'bom' | 'purchases' | 'stock' | 'overheads';
  onTabChange?: (tab: 'batches' | 'bom' | 'purchases' | 'stock' | 'overheads') => void;
}

export const ProductionPortal: React.FC<ProductionPortalProps> = ({
  activeTab: activeTabProp,
  onTabChange,
}) => {
  const { language } = useAuth();
  const isTa = language?.toUpperCase() === 'TA' || language?.toLowerCase() === 'ta';

  // Navigation tab
  const [internalTab, setInternalTab] = useState<'batches' | 'bom' | 'purchases' | 'stock' | 'overheads'>('batches');
  const activeTab = activeTabProp || internalTab;

  const setActiveTab = (tab: 'batches' | 'bom' | 'purchases' | 'stock' | 'overheads') => {
    setInternalTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  useEffect(() => {
    if (activeTabProp) {
      setInternalTab(activeTabProp);
    }
  }, [activeTabProp]);

  // Master and transaction state
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [boms, setBoms] = useState<BOMHeader[]>([]);
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stockBalances, setStockBalances] = useState<{ [itemId: number]: number }>({});

  // Floor Stock Filter State
  const [stockSubTab, setStockSubTab] = useState<'balances' | 'movements'>('balances');
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [stockCategoryFilter, setStockCategoryFilter] = useState<'ALL' | 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_GOOD'>('ALL');

  // --- Step 1 / Single-Run Form State ---
  const [selectedFinishedId, setSelectedFinishedId] = useState<number | ''>('');
  const [batchesCount, setBatchesCount] = useState<number>(1);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

  // Dynamic ingredient inputs based on preview
  const [ingredientInputs, setIngredientInputs] = useState<{ [itemId: number]: number }>({});
  const [goodPackets, setGoodPackets] = useState<number | ''>('');
  const [damagedPouches, setDamagedPouches] = useState<number>(0);
  const [cartonsUsed, setCartonsUsed] = useState<number | ''>('');
  const [labourRupees, setLabourRupees] = useState<number | ''>(0);
  const [overheadRupees, setOverheadRupees] = useState<number | ''>(0);

  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<any>(null);

  // --- Step B Modal / Form State for an ISSUED Run ---
  const [completingRun, setCompletingRun] = useState<ProductionRun | null>(null);
  const [stepBGoodPackets, setStepBGoodPackets] = useState<number | ''>('');
  const [stepBDamaged, setStepBDamaged] = useState<number>(0);
  const [stepBCartons, setStepBCartons] = useState<number | ''>('');
  const [stepBLabourRupees, setStepBLabourRupees] = useState<number | ''>(0);
  const [stepBOverheadRupees, setStepBOverheadRupees] = useState<number | ''>(0);

  // --- Formula Scale Preview Multiplier ---
  const [scaleMultiplier, setScaleMultiplier] = useState<number>(1);

  // --- Clone BOM Modal State ---
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [bomToClone, setBomToClone] = useState<BOMHeader | null>(null);
  const [cloneNewCode, setCloneNewCode] = useState('');
  const [cloneNewName, setCloneNewName] = useState('');
  const [cloneAdjustments, setCloneAdjustments] = useState<{ [itemId: number]: number }>({});

  // --- Add SKU Pack Size Modal State ---
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [targetBomId, setTargetBomId] = useState<number | ''>('');
  const [skuCode, setSkuCode] = useState('FG-MUR-500G');
  const [skuName, setSkuName] = useState('Murukku 500g');
  const [skuYield, setSkuYield] = useState(80);
  const [skuPriceRupees, setSkuPriceRupees] = useState(120);

  // --- Purchases Form State ---
  const [purchaseBillNo, setPurchaseBillNo] = useState<string>('');
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | ''>('');
  const [purchaseItemId, setPurchaseItemId] = useState<number | ''>('');
  const [purchaseQty, setPurchaseQty] = useState<number | ''>('');
  const [purchaseRateRupees, setPurchaseRateRupees] = useState<number | ''>('');

  // --- Overhead Patch State ---
  const [patchRunId, setPatchRunId] = useState<number | ''>('');
  const [patchLabourRupees, setPatchLabourRupees] = useState<number | ''>(0);
  const [patchOverheadRupees, setPatchOverheadRupees] = useState<number | ''>(0);
  const [patchResult, setPatchResult] = useState<any>(null);
  const [recentLedger, setRecentLedger] = useState<StockLedgerEntry[]>([]);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [allIt, allP, allB, allR, allPur, balances] = await Promise.all([
        api.getItems(),
        api.getParties(),
        api.getBOMs(),
        api.getProductionRuns(),
        api.getPurchases(),
        api.getStockBalances(),
      ]);
      setItems(allIt);
      const supps = allP.filter((p) => p.party_type === 'SUPPLIER');
      setSuppliers(supps);
      setBoms(allB);
      setRuns(allR);
      setPurchases(allPur);

      const balMap: { [id: number]: number } = {};
      balances.forEach((b) => {
        balMap[b.id] = Number(b.current_stock);
      });
      setStockBalances(balMap);

      // Load recent stock ledger movements
      api.getStockLedger({ limit: 10 })
        .then((entries) => setRecentLedger(entries))
        .catch(() => {});

      const fg = allIt.find((it) => it.category === 'FINISHED_GOOD');
      if (fg) {
        setSelectedFinishedId(fg.id);
        handlePreviewBOM(fg.id, 1);
      }
      if (supps.length > 0) setPurchaseSupplierId(supps[0].id);
      const flourItem = allIt.find((it) => it.sku_code === 'RM-FLOUR-01');
      if (flourItem) setPurchaseItemId(flourItem.id);
      if (allB.length > 0) setTargetBomId(allB[0].id);
    } catch (err) {
      console.error('Failed to load production floor data:', err);
    }
  };

  // Helper to always retrieve the active BOM ingredients with standard requirements
  const getActiveBOMIngredients = () => {
    if (previewData && Array.isArray(previewData.ingredients) && previewData.ingredients.length > 0) {
      return previewData.ingredients;
    }
    const activeBom = boms.find((b) => b.is_active && b.sku_mappings?.some((m) => m.finished_item_id === Number(selectedFinishedId))) || boms[0];
    if (activeBom && Array.isArray(activeBom.ingredients) && activeBom.ingredients.length > 0) {
      return activeBom.ingredients.map((ing: any) => {
        const raw = items.find((i) => i.id === ing.raw_item_id);
        return {
          item_id: ing.raw_item_id,
          name: raw?.name || (ing as any).raw_item?.name || `Item #${ing.raw_item_id}`,
          name_ta: raw?.name_ta,
          unit: raw?.base_unit || (ing as any).raw_item?.base_unit || 'kg',
          planned_qty: Number(ing.standard_qty) * batchesCount,
        };
      });
    }
    // Default Section 5 opening formula fallback
    const flour = items.find((i) => i.sku_code === 'RM-FLOUR-01');
    const oil = items.find((i) => i.sku_code === 'RM-OIL-01');
    const spice = items.find((i) => i.sku_code === 'RM-SPICE-01');
    return [
      { item_id: flour?.id || 1, name: flour?.name || 'Flour', name_ta: flour?.name_ta || 'அரிசி மாவு', unit: 'kg', planned_qty: 40 * batchesCount },
      { item_id: oil?.id || 2, name: oil?.name || 'Cooking Oil', name_ta: oil?.name_ta || 'சமையல் எண்ணெய்', unit: 'litre', planned_qty: 10 * batchesCount },
      { item_id: spice?.id || 3, name: spice?.name || 'Salt and Spice Mix', name_ta: spice?.name_ta || 'உப்பு மற்றும் மசாலா கலவை', unit: 'kg', planned_qty: 1.2 * batchesCount },
    ];
  };

  useEffect(() => {
    if (selectedFinishedId) {
      handlePreviewBOM(Number(selectedFinishedId), batchesCount);
    }
  }, [selectedFinishedId, batchesCount]);

  // Preview BOM scaling and calculate required inputs
  const handlePreviewBOM = async (fId?: number, count?: number) => {
    const finishedId = fId || selectedFinishedId;
    const bCount = count !== undefined ? count : batchesCount;
    if (!finishedId) return;

    setIsPreviewing(true);
    try {
      const res = await api.previewProduction({
        finished_item_id: Number(finishedId),
        batches_count: bCount,
      });
      setPreviewData(res);

      // Pre-fill actual issued inputs with standard planned quantities
      const initialInputs: { [itemId: number]: number } = {};
      res.ingredients.forEach((ing) => {
        initialInputs[ing.item_id] = ing.planned_qty;
      });
      setIngredientInputs(initialInputs);
      // Keep Good Output, Damaged Pouches, Cartons Used, Labour Cost, and Overheads clean for entry
    } catch (err: any) {
      console.error(`Preview error: ${err.message}`);
    } finally {
      setIsPreviewing(false);
    }
  };

  // 1-Step Execution (combined start + complete)
  const handleExecuteCombinedRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFinishedId || !goodPackets) return;

    setIsExecuting(true);
    setExecutionResult(null);

    const activeIngs = getActiveBOMIngredients();
    const rawIssued = activeIngs.map((ing: any) => {
      const actualVal = ingredientInputs[ing.item_id];
      return {
        item_id: Number(ing.item_id),
        actual_qty: actualVal !== undefined && !isNaN(actualVal) ? Number(actualVal) : Number(ing.planned_qty),
      };
    });

    try {
      const res = await api.runProduction({
        finished_item_id: Number(selectedFinishedId),
        batches_count: batchesCount,
        raw_materials_issued: rawIssued,
        actual_good_packets: Number(goodPackets),
        damaged_pouches: Number(damagedPouches) || 0,
        cartons_used: Number(cartonsUsed) || 0,
        labour_cost_paisa: Math.round((Number(labourRupees) || 0) * 100),
        overhead_cost_paisa: Math.round((Number(overheadRupees) || 0) * 100),
        run_date: new Date().toISOString().split('T')[0],
      });
      setExecutionResult(res);
      await loadAllData();
    } catch (err: any) {
      alert(`Production run failed: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Step A: Start Batch (Status -> ISSUED)
  const handleStartBatch = async () => {
    if (!selectedFinishedId) return;
    setIsExecuting(true);

    const activeIngs = getActiveBOMIngredients();
    const rawIssued = activeIngs.map((ing: any) => {
      const actualVal = ingredientInputs[ing.item_id];
      return {
        item_id: Number(ing.item_id),
        actual_qty: actualVal !== undefined && !isNaN(actualVal) ? Number(actualVal) : Number(ing.planned_qty),
      };
    });

    try {
      await api.startProductionBatch({
        finished_item_id: Number(selectedFinishedId),
        batches_count: batchesCount,
        raw_materials_issued: rawIssued,
        run_date: new Date().toISOString().split('T')[0],
      });
      alert(isTa ? 'தொகுதி தொடங்கப்பட்டது! மூலப்பொருட்கள் கழிக்கப்பட்டு தொகுதி ISSUED என குறிக்கப்பட்டது.' : 'Batch Started successfully! Raw materials deducted and batch marked as ISSUED.');
      await loadAllData();
    } catch (err: any) {
      alert(`Failed to start batch: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Step B: Complete Batch (Status -> COMPLETED)
  const handleCompleteBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingRun?.id || !stepBGoodPackets) return;

    setIsExecuting(true);
    try {
      const res = await api.completeProductionBatch(completingRun.id, {
        actual_good_packets: Number(stepBGoodPackets),
        damaged_pouches: Number(stepBDamaged) || 0,
        cartons_used: Number(stepBCartons) || 0,
        labour_cost_paisa: Math.round((Number(stepBLabourRupees) || 0) * 100),
        overhead_cost_paisa: Math.round((Number(stepBOverheadRupees) || 0) * 100),
      });
      alert(`Batch #${res.run_number} Completed! Output packets added to stock ledger.`);
      setCompletingRun(null);
      setExecutionResult(res);
      await loadAllData();
    } catch (err: any) {
      alert(`Failed to complete batch: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Clone BOM version handler
  const handleCloneBOM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bomToClone) return;

    try {
      const adjustments = Object.entries(cloneAdjustments).map(([itemId, sqty]) => ({
        item_id: Number(itemId),
        standard_qty: Number(sqty),
      }));

      await api.cloneBOMVersion(bomToClone.id, {
        new_code: cloneNewCode || undefined,
        new_name: cloneNewName || undefined,
        ingredient_adjustments: adjustments.length > 0 ? adjustments : undefined,
        archive_previous: true,
      });

      alert(`BOM Cloned! New version created and previous version archived.`);
      setCloneModalOpen(false);
      setBomToClone(null);
      await loadAllData();
    } catch (err: any) {
      alert(`Clone BOM failed: ${err.message}`);
    }
  };

  // Add SKU Pack Size handler
  const handleAddSKUMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetBomId) return;

    try {
      // Find or create item
      let targetItem = items.find((i) => i.sku_code === skuCode);
      if (!targetItem) {
        alert(`SKU ${skuCode} not found in item master. Please add it to master items first or select an existing SKU.`);
        return;
      }

      await api.addBOMSKUMapping({
        bom_id: Number(targetBomId),
        finished_item_id: targetItem.id,
        expected_yield_packets: skuYield,
        pouches_per_packet: 1,
        packets_per_carton: 20,
      });

      alert(`SKU Pack Size mapping added successfully!`);
      setSkuModalOpen(false);
      await loadAllData();
    } catch (err: any) {
      alert(`Add pack size failed: ${err.message}`);
    }
  };

  // Purchase Handler
  const handleCreatePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseSupplierId || !purchaseItemId || Number(purchaseQty) <= 0) return;

    try {
      await api.recordPurchase({
        bill_no: purchaseBillNo || `PUR-2026-${String(purchases.length + 1).padStart(3, '0')}`,
        supplier_id: Number(purchaseSupplierId),
        item_id: Number(purchaseItemId),
        qty: Number(purchaseQty),
        unit_rate_paisa: Math.round((Number(purchaseRateRupees) || 0) * 100),
        purchase_date: new Date().toISOString().split('T')[0],
      });
      alert('Purchase recorded successfully and stock updated in ledger!');
      await loadAllData();
      setPurchaseBillNo('');
      setPurchaseQty('');
      setPurchaseRateRupees('');
    } catch (err: any) {
      alert(`Purchase failed: ${err.message}`);
    }
  };

  // Overhead Patch Handler
  const handlePatchOverheads = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patchRunId) return;

    try {
      const res = await api.updateOverheads(Number(patchRunId), {
        labour_cost_paisa: Math.round((Number(patchLabourRupees) || 0) * 100),
        overhead_cost_paisa: Math.round((Number(patchOverheadRupees) || 0) * 100),
      });
      setPatchResult(res);
      await loadAllData();
    } catch (err: any) {
      alert(`Failed to update overheads: ${err.message}`);
    }
  };

  const issuedRuns = runs.filter((r) => r.status === 'ISSUED');
  const completedRuns = runs.filter((r) => r.status === 'COMPLETED' || !r.status);

  return (
    <div className="space-y-6">
      {/* Sub-action bar */}
      {activeTab === 'batches' && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setActiveTab('overheads')}
            className="text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200/60 transition"
          >
            {isTa ? 'கூடுதல் செலவு ஒதுக்கீடு' : 'Batch Overheads'}
          </button>
        </div>
      )}
      {activeTab === 'overheads' && (
        <div className="flex items-center justify-start">
          <button
            type="button"
            onClick={() => setActiveTab('batches')}
            className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 px-3 py-1.5 rounded-lg transition"
          >
            &larr; {isTa ? 'உற்பத்தி தொகுதிகளுக்குத் திரும்பு' : 'Back to Batches'}
          </button>
        </div>
      )}

      {/* ================= TAB 1: BATCH PRODUCTION (2-STEP & 1-STEP) ================= */}
      {activeTab === 'batches' && (
        <div className="space-y-6">
          {/* Active Issued Batches Alert Banner */}
          {issuedRuns.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    {issuedRuns.length} Batches Currently In Production (Status: ISSUED)
                  </h4>
                  <p className="text-[11px] text-amber-700">
                    Raw materials are locked and deducted. Complete Step 2 to record finished output and calculate unit cost.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {issuedRuns.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setCompletingRun(r);
                      setStepBGoodPackets(r.expected_output_packets);
                      setStepBCartons(Math.ceil(r.expected_output_packets / 20));
                    }}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition shadow-xs"
                  >
                    Complete #{r.run_number}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form: Start or Execute Batch */}
            <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-xl p-6 shadow-[0_1px_3px_rgba(16,24,40,0.04),0_1px_2px_rgba(16,24,40,0.02)] space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-heading font-bold text-sm text-[#111827] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#059669]" />
                    {isTa ? 'புதிய உற்பத்தி தொகுதி' : 'New Production Batch'}
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Calculates formula requirements and verifies 3% recipe tolerance
                  </p>
                </div>
                <span className="text-[11px] font-mono font-semibold bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]/60 px-2 py-0.5 rounded">
                  3% Tolerance Rule
                </span>
              </div>

              <form onSubmit={handleExecuteCombinedRun} className="space-y-4 text-xs">
                {/* Product & Batch count */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#374151] font-medium mb-1">
                      {isTa ? 'தயாரிப்பு' : 'Product'}
                    </label>
                    <select
                      value={selectedFinishedId}
                      onChange={(e) => {
                        const newId = Number(e.target.value);
                        setSelectedFinishedId(newId);
                        handlePreviewBOM(newId, batchesCount);
                      }}
                      className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                    >
                      {items
                        .filter((it) => it.category === 'FINISHED_GOOD')
                        .map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name} {it.name_ta ? `(${it.name_ta})` : ''} - ₹{(it.selling_price_paisa / 100).toFixed(2)}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#374151] font-medium mb-1">
                      {isTa ? 'தொகுதிகள்' : 'Batches Count'}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={batchesCount}
                        onChange={(e) => {
                          const val = Math.max(1, parseInt(e.target.value) || 1);
                          setBatchesCount(val);
                          handlePreviewBOM(Number(selectedFinishedId), val);
                        }}
                        className="w-20 h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                      />
                      <button
                        type="button"
                        onClick={() => handlePreviewBOM()}
                        disabled={isPreviewing}
                        className="flex-1 h-9 bg-white hover:bg-slate-50 text-[#374151] border border-slate-300 px-2 rounded-lg font-medium transition text-xs shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                      >
                        {isPreviewing ? 'Loading Preview...' : 'Preview Formula & Stock'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* BOM Preview Display */}
                {previewData && (
                  <div className="p-3.5 rounded-xl bg-[#F8FAFB] border border-[#E5E7EB] space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-[#111827]">
                      <span>Formula: {previewData.bom_code} (1 Batch = {previewData.expected_output_packets} pkts)</span>
                      {previewData.can_produce ? (
                        <span className="flex items-center gap-1 text-[#059669] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isTa ? 'சரக்கு உள்ளது' : 'Stock Available'}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{isTa ? 'பற்றாக்குறை உள்ளது' : 'Shortage Flagged'}</span>
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      {previewData.ingredients.map((ing: any) => (
                        <div key={ing.item_id} className="p-2 rounded bg-white border border-[#E5E7EB] shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
                          <span className="text-[#6B7280] block truncate">{ing.name}</span>
                          <span className="font-mono text-[#111827] font-bold tabular-nums">
                            {ing.planned_qty} {ing.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actual Quantities Issued */}
                <div className="border-t border-[#E5E7EB] pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[#111827] font-bold text-xs uppercase tracking-wider font-heading">
                      {isTa ? 'வழங்கப்பட்ட மூலப்பொருள் அளவு (Actual Quantities Issued):' : 'Raw Materials Issued (Actual Consumption):'}
                    </span>
                    <span className="text-[10px] text-[#6B7280]">±3% tolerance against standard formula</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {getActiveBOMIngredients().map((ing: any) => (
                      <div key={ing.item_id}>
                        <label className="block text-[#4B5563] text-[11px] mb-1 font-medium truncate">
                          {isTa && ing.name_ta ? ing.name_ta : ing.name} ({ing.unit})
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={ingredientInputs[ing.item_id] !== undefined ? ingredientInputs[ing.item_id] : (ing.planned_qty ?? 0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setIngredientInputs((prev) => ({ ...prev, [ing.item_id]: val }));
                          }}
                          className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Packaging and Finished Output */}
                <div className="grid grid-cols-3 gap-3 border-t border-[#E5E7EB] pt-3">
                  <div>
                    <label className="block text-[#374151] font-semibold mb-1">
                      {isTa ? 'நல்ல பாக்கெட்டுகள்' : 'Good Output (pkts)'}
                    </label>
                    <input
                      type="number"
                      value={goodPackets}
                      onChange={(e) => setGoodPackets(parseInt(e.target.value) || '')}
                      placeholder="e.g. 200"
                      className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#374151] font-semibold mb-1">
                      {isTa ? 'சேதமடைந்த பைகள்' : 'Damaged Pouches (Scrap)'}
                    </label>
                    <input
                      type="number"
                      value={damagedPouches}
                      onChange={(e) => setDamagedPouches(parseInt(e.target.value) || 0)}
                      className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#374151] font-semibold mb-1">
                      {isTa ? 'பெட்டிகள்' : 'Cartons Used'}
                    </label>
                    <input
                      type="number"
                      value={cartonsUsed}
                      onChange={(e) => setCartonsUsed(parseInt(e.target.value) || '')}
                      placeholder="e.g. 10"
                      className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                    />
                  </div>
                </div>

                {/* Overheads */}
                <div className="grid grid-cols-2 gap-3 bg-[#F8FAFB] p-3 rounded-xl border border-[#E5E7EB]">
                  <div>
                    <label className="block text-[#4B5563] mb-1 font-semibold">{isTa ? 'கூலிச் செலவு (₹)' : 'Labour Cost (₹)'}</label>
                    <input
                      type="number"
                      value={labourRupees === 0 ? '' : labourRupees}
                      onChange={(e) => setLabourRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#4B5563] mb-1 font-semibold">{isTa ? 'மின்சாரம் / எரிவாயு மேற்செலவு (₹)' : 'Power / Gas Overheads (₹)'}</label>
                    <input
                      type="number"
                      value={overheadRupees === 0 ? '' : overheadRupees}
                      onChange={(e) => setOverheadRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-full h-9 bg-white border border-slate-300 rounded-lg px-2.5 text-xs text-[#111827] font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-[#059669] transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
                    />
                  </div>
                </div>

                {/* Dual Action Buttons: Issue or Combined Complete */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleStartBatch}
                    disabled={isExecuting}
                    className="flex-1 h-9 bg-[#111827] hover:bg-[#1F2937] text-white font-semibold text-xs rounded-lg transition shadow-[0_1px_2px_rgba(16,24,40,0.08)] disabled:opacity-50"
                  >
                    {isTa ? 'மூலப்பொருள் வழங்குதல்' : 'Issue Materials'}
                  </button>

                  <button
                    type="submit"
                    disabled={isExecuting}
                    className="flex-1 h-9 bg-[#059669] hover:bg-[#047857] text-white font-semibold text-xs rounded-lg transition shadow-[0_1px_2px_rgba(5,150,105,0.15)] disabled:opacity-50"
                  >
                    {isExecuting ? 'Processing...' : (isTa ? 'தொகுதியை முடி' : 'Complete Batch')}
                  </button>
                </div>
              </form>
            </div>

            {/* Right: Live Result Card or Empty State */}
            <div className="lg:col-span-5 space-y-4">
              {executionResult ? (
                <div className="bg-white border border-emerald-300 rounded-xl p-5 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono font-semibold">
                        Batch Run Completed
                      </span>
                      <h3 className="font-bold text-slate-900 text-base font-mono">
                        {executionResult.run_number}
                      </h3>
                    </div>
                    {executionResult.has_variance_alert ? (
                      <span className="flex items-center gap-1 text-[11px] bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-full font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> 3% ALERT
                      </span>
                    ) : (
                      <span className="text-[11px] bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full font-bold">
                        Within Tolerance
                      </span>
                    )}
                  </div>

                  {/* Variance Indicators */}
                  <div className="space-y-1.5 text-xs">
                    <div
                      className={`p-2 rounded-lg flex justify-between items-center ${
                        executionResult.yield_is_flagged
                          ? 'bg-amber-50 text-amber-900 border border-amber-200'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span>Output Yield Variance:</span>
                      <span className="font-mono font-bold tabular-nums">
                        {executionResult.yield_variance_pct}% {executionResult.yield_is_flagged && '(FLAGGED)'}
                      </span>
                    </div>

                    {executionResult.raw_materials_breakdown?.map((rm: any) => (
                      <div
                        key={rm.item_id}
                        className={`p-2 rounded-lg flex justify-between items-center ${
                          rm.is_flagged
                            ? 'bg-amber-50 text-amber-900 border border-amber-200'
                            : 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        <span>{rm.name} Consumption:</span>
                        <span className="font-mono font-bold tabular-nums">
                          {rm.variance_pct > 0 ? `+${rm.variance_pct}` : rm.variance_pct}% {rm.is_flagged && '(FLAGGED)'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Cost Absorption Stack */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Raw Materials:</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        ₹{(executionResult.costing?.raw_material_cost_paisa / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Packaging (Pouches + Cartons):</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        ₹{(executionResult.costing?.total_packaging_cost_paisa / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Direct Labour:</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        ₹{(executionResult.costing?.labour_cost_paisa / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Power / Gas Overheads:</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-900">
                        ₹{(executionResult.costing?.overhead_cost_paisa / 100).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-900 font-bold border-t border-slate-200 pt-2">
                      <span>Total Batch Cost:</span>
                      <span className="font-mono text-emerald-700 tabular-nums">
                        ₹{(executionResult.costing?.total_batch_cost_paisa / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Hero Metric: Cost Per Packet */}
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-800 font-bold block uppercase tracking-wider">
                        Unit Cost Per Packet
                      </span>
                      <span className="text-2xl font-black font-mono text-emerald-700 tabular-nums">
                        ₹{(executionResult.costing?.cost_per_packet_paisa / 100).toFixed(2)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-600 font-bold block uppercase tracking-wider">
                        Gross Margin vs MRP
                      </span>
                      <span className="text-xl font-bold font-mono text-emerald-800 flex items-center justify-end tabular-nums">
                        {Number(executionResult.costing?.gross_margin_pct || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-800">No batch currently selected for inspection</p>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    Execute a production run or complete an active batch to inspect real-time absorption costing, tolerance variance checks, and gross margins.
                  </p>
                </div>
              )}

              {/* Recent Runs Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Production History ({runs.length} Runs)
                </h4>
                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                        <th className="py-2">{isTa ? 'தொகுதி #' : 'Run #'}</th>
                        <th className="py-2">{isTa ? 'நிலை' : 'Status'}</th>
                        <th className="py-2 text-right">{isTa ? 'நல்ல பாக்கெட்டுகள்' : 'Good Pkts'}</th>
                        <th className="py-2 text-right">{isTa ? 'விலை/பாக்கெட்' : 'Cost/Pkt'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {runs.slice(0, 5).map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2 font-mono font-medium text-slate-900">{r.run_number}</td>
                          <td className="py-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                r.status === 'ISSUED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {r.status || 'COMPLETED'}
                            </span>
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums">{r.actual_good_packets}</td>
                          <td className="py-2 text-right font-mono font-bold text-emerald-700 tabular-nums">
                            ₹{((r.cost_per_packet_paisa || 0) / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: FORMULA MASTER & PACK SIZES ================= */}
      {activeTab === 'bom' && (
        <div className="space-y-6">
          {/* Top Actions: Interactive Scale Multiplier & Buttons */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                Interactive Live Scale Preview
              </h3>
              <p className="text-xs text-slate-500">
                Scale recipes dynamically to preview required ingredients against current warehouse stock
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600">Batch Scale:</span>
              {[1, 2, 5].map((multiplier) => (
                <button
                  key={multiplier}
                  onClick={() => setScaleMultiplier(multiplier)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition font-mono ${
                    scaleMultiplier === multiplier
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {multiplier}x
                </button>
              ))}

              <div className="border-l border-slate-200 pl-3 ml-2 flex gap-2">
                <button
                  onClick={() => setSkuModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-600" />
                  + Add SKU Pack Size
                </button>
              </div>
            </div>
          </div>

          {/* Recipes List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {boms.map((bom) => (
              <div key={bom.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{bom.name}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {bom.version_label || `V${bom.version}.0`}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          bom.status === 'ARCHIVED'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {bom.status || 'ACTIVE'}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{bom.code}</span>
                  </div>

                  <button
                    onClick={() => {
                      setBomToClone(bom);
                      setCloneNewCode(`${bom.code}-V${bom.version + 1}`);
                      setCloneNewName(`${bom.name} (V${bom.version + 1}.0)`);
                      const initAdj: { [itemId: number]: number } = {};
                      bom.ingredients.forEach((ing) => {
                        initAdj[ing.raw_item_id] = ing.standard_qty;
                      });
                      setCloneAdjustments(initAdj);
                      setCloneModalOpen(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    <Copy className="w-3.5 h-3.5 text-slate-500" />
                    Clone Version
                  </button>
                </div>

                {/* Scaled Ingredients Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
                    <span>Required Ingredients ({scaleMultiplier}x Batch):</span>
                    <span className="text-[10px] text-slate-400">Warehouse Stock Coverage</span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    {bom.ingredients.map((ing) => {
                      const scaledQty = ing.standard_qty * scaleMultiplier;
                      const inStock = stockBalances[ing.raw_item_id] || 0;
                      const isSufficient = inStock >= scaledQty;

                      return (
                        <div
                          key={ing.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <div>
                            <span className="font-semibold text-slate-800 block">{ing.raw_item_name}</span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              Stock: {inStock} {ing.unit}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="font-mono font-bold text-slate-900 block tabular-nums">
                              {scaledQty.toFixed(2)} {ing.unit}
                            </span>
                            <span
                              className={`text-[10px] font-bold ${
                                isSufficient ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {isSufficient ? 'Sufficient' : `Shortage: ${(scaledQty - inStock).toFixed(2)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* SKU Mappings */}
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    Decoupled Finished SKUs Mapped to this Recipe:
                  </span>
                  <div className="space-y-1.5">
                    {bom.sku_mappings.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 text-xs"
                      >
                        <span className="font-semibold text-slate-800">{m.finished_item_name}</span>
                        <span className="font-mono font-bold text-emerald-800 tabular-nums">
                          Yield: {(m.expected_yield_packets * scaleMultiplier).toFixed(0)} packets (
                          {Math.ceil((m.expected_yield_packets * scaleMultiplier) / m.packets_per_carton)} cartons)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= TAB 3: INBOUND PURCHASES ================= */}
      {activeTab === 'purchases' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" /> Log Inbound Supplier Purchase
            </h3>

            <form onSubmit={handleCreatePurchase} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Supplier Bill / Invoice No</label>
                <input
                  type="text"
                  value={purchaseBillNo}
                  onChange={(e) => setPurchaseBillNo(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Supplier</label>
                <select
                  value={purchaseSupplierId}
                  onChange={(e) => setPurchaseSupplierId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900"
                  required
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.state})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Raw Material Item</label>
                <select
                  value={purchaseItemId}
                  onChange={(e) => setPurchaseItemId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900"
                  required
                >
                  {items
                    .filter((it) => it.category === 'RAW_MATERIAL')
                    .map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.base_unit})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">{isTa ? 'அளவு' : 'Quantity'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseQty}
                    onChange={(e) => setPurchaseQty(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono tabular-nums"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">{isTa ? 'விலை (₹ / அலகு)' : 'Rate (₹ / unit)'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchaseRateRupees}
                    onChange={(e) => setPurchaseRateRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono tabular-nums"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl transition shadow-xs"
              >
                Record Inbound Purchase
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-900">Recent Supplier Purchases</h3>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px]">
                    <th className="py-2">{isTa ? 'பில் எண்' : 'Bill No'}</th>
                    <th className="py-2">{isTa ? 'வழங்குநர்' : 'Supplier'}</th>
                    <th className="py-2">{isTa ? 'பொருள்' : 'Item'}</th>
                    <th className="py-2 text-right">{isTa ? 'அளவு' : 'Qty'}</th>
                    <th className="py-2 text-right">{isTa ? 'விலை விகிதம்' : 'Unit Rate'}</th>
                    <th className="py-2 text-right">{isTa ? 'மொத்தம்' : 'Total'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2 font-mono font-medium text-slate-900">{p.bill_no}</td>
                      <td className="py-2 text-slate-600 font-medium">
                        {p.supplier_name || suppliers.find((s) => s.id === p.supplier_id)?.name || `Supplier #${p.supplier_id}`}
                      </td>
                      <td className="py-2 text-slate-800 font-medium">
                        {p.item_name || items.find((it) => it.id === p.item_id)?.name || `Item #${p.item_id}`}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">{p.qty}</td>
                      <td className="py-2 text-right font-mono tabular-nums">₹{(p.unit_rate_paisa / 100).toFixed(2)}</td>
                      <td className="py-2 text-right font-mono font-bold text-slate-900 tabular-nums">
                        ₹{(p.total_paisa / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: OVERHEAD ALLOCATION ================= */}
      {activeTab === 'overheads' && (
        <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl p-6 shadow-xs space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" /> Post-Run Overhead Allocation
            </h3>
            <p className="text-xs text-slate-500">
              Allocate labour and factory overheads post-run. Updates unit cost per packet in the stock ledger.
            </p>
          </div>

          <form onSubmit={handlePatchOverheads} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Select Completed Production Run</label>
              <select
                value={patchRunId}
                onChange={(e) => setPatchRunId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                required
              >
                <option value="">-- Choose Run --</option>
                {completedRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    Run #{r.run_number} &bull; {r.actual_good_packets} packets
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">{isTa ? 'கூலிச் செலவு (₹)' : 'Labour Cost (₹)'}</label>
                <input
                  type="number"
                  value={patchLabourRupees === 0 ? '' : patchLabourRupees}
                  onChange={(e) => setPatchLabourRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono tabular-nums"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">{isTa ? 'மின்சாரம் / எரிவாயு செலவு (₹)' : 'Power / Gas Overhead (₹)'}</label>
                <input
                  type="number"
                  value={patchOverheadRupees === 0 ? '' : patchOverheadRupees}
                  onChange={(e) => setPatchOverheadRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono tabular-nums"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl transition shadow-xs"
            >
              Update Overheads & Recalculate Unit Cost
            </button>
          </form>

          {patchResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
              <span className="text-emerald-800 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                {isTa ? 'கூடுதல் செலவுகள் புதுப்பிக்கப்பட்டன' : 'Overheads Updated in Stock Ledger'}
              </span>
              <div className="flex justify-between text-slate-700">
                <span>New Total Batch Cost:</span>
                <span className="font-mono text-slate-900 font-bold tabular-nums">
                  ₹{patchResult.total_batch_cost_rupees?.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span>New Unit Cost Per Packet:</span>
                <span className="font-mono text-emerald-700 font-bold tabular-nums">
                  ₹{patchResult.cost_per_packet_rupees?.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 5: FLOOR STOCK BALANCES & MOVEMENTS ================= */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          {/* Sub-tab Navigation: Floor Stock Balances | Stock Movement Ledger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setStockSubTab('balances')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                  stockSubTab === 'balances'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isTa ? 'தொழிற்சாலை இருப்பு' : 'Floor Stock Balances'}</span>
              </button>
              <button
                type="button"
                onClick={() => setStockSubTab('movements')}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition flex items-center gap-2 ${
                  stockSubTab === 'movements'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isTa ? 'இருப்பு இயக்க லெட்ஜர்' : 'Stock Movement Ledger'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono">
                  {recentLedger.length}
                </span>
              </button>
            </div>

            {stockSubTab === 'movements' && (
              <button
                onClick={loadAllData}
                className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold shadow-xs transition"
                title="Refresh Movements"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>{isTa ? 'புதுப்பி' : 'Refresh Ledger'}</span>
              </button>
            )}
          </div>

          {/* Subtab 1: Floor Stock Balances */}
          {stockSubTab === 'balances' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-emerald-600" />
                    {isTa ? 'தொழிற்சாலை சரக்கு இருப்பு & எச்சரிக்கை' : 'Live Floor Stock & Reorder Alerts'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isTa
                      ? 'லெட்ஜரில் இருந்து கணக்கிடப்பட்ட நேரடி சரக்கு இருப்பு & மறு-ஆர்டர் நிலை'
                      : 'Derived from immutable stock ledger movements with low-stock alerts'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder={isTa ? 'பொருளைத் தேடு...' : 'Search items or SKU...'}
                      value={stockSearchQuery}
                      onChange={(e) => setStockSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                    />
                  </div>
                  <button
                    onClick={loadAllData}
                    className="p-1.5 text-slate-500 hover:text-slate-900 bg-slate-100 rounded-lg"
                    title="Refresh Stock"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Category filter pills */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                {(['ALL', 'RAW_MATERIAL', 'PACKAGING', 'FINISHED_GOOD'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setStockCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg font-semibold transition ${
                      stockCategoryFilter === cat
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {cat === 'ALL'
                      ? isTa ? 'அனைத்தும்' : 'All Items'
                      : cat === 'RAW_MATERIAL'
                      ? isTa ? 'மூலப்பொருட்கள்' : 'Raw Materials'
                      : cat === 'PACKAGING'
                      ? isTa ? 'பேக்கேஜிங்' : 'Packaging'
                      : isTa ? 'முடிவுற்ற பொருட்கள்' : 'Finished Goods'}
                  </button>
                ))}
              </div>

              {/* Stock Balances Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[11px] bg-slate-50/50">
                      <th className="py-2.5 px-3">{isTa ? 'குறியீடு (SKU)' : 'SKU Code'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'பொருள் பெயர்' : 'Item Name'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'வகை' : 'Category'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'தற்போதைய இருப்பு' : 'Floor Balance'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'மறு-ஆர்டர் அளவு' : 'Reorder Level'}</th>
                      <th className="py-2.5 px-3 text-center">{isTa ? 'நிலை' : 'Stock Status'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items
                      .filter((it) => {
                        if (stockCategoryFilter !== 'ALL' && it.category !== stockCategoryFilter) return false;
                        if (!stockSearchQuery) return true;
                        const q = stockSearchQuery.toLowerCase();
                        return (
                          it.sku_code.toLowerCase().includes(q) ||
                          it.name.toLowerCase().includes(q) ||
                          (it.name_ta && it.name_ta.toLowerCase().includes(q))
                        );
                      })
                      .map((it) => {
                        const balance = Number(stockBalances[it.id] ?? 0);
                        const reorder = it.reorder_level != null ? Number(it.reorder_level) : null;
                        const isLow = reorder != null ? balance <= reorder : false;
                        const isZero = balance <= 0;
                        return (
                          <tr key={it.id} className="hover:bg-slate-50 transition">
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{it.sku_code}</td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800">{it.name}</div>
                              {it.name_ta && <div className="text-[11px] text-slate-400">{it.name_ta}</div>}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{it.category}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                              {(Number(balance) || 0).toFixed(balance % 1 === 0 ? 0 : 2)} {it.base_unit}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-500 tabular-nums">
                              {reorder != null ? `${reorder} ${it.base_unit}` : '—'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isZero ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  {isTa ? 'இருப்பு இல்லை' : 'Out of Stock'}
                                </span>
                              ) : isLow ? (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  {isTa ? 'குறைவான இருப்பு' : 'Reorder Alert'}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {isTa ? 'போதுமான இருப்பு' : 'In Stock'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Subtab 2: Stock Movement Ledger */}
          {stockSubTab === 'movements' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    {isTa ? 'சமீபத்திய இருப்பு பரிவர்த்தனைகள்' : 'Recent Stock Ledger Movements'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isTa ? 'பதிவு செய்யப்பட்ட நேரடி இருப்பு மாற்றங்கள்' : 'Recorded transactions from immutable stock ledger'}
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-[11px] bg-slate-50/50">
                      <th className="py-2.5 px-3">{isTa ? 'பரிவர்த்தனை ID' : 'Trx ID'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'பொருள்' : 'Item'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'வகை' : 'Transaction Type'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'அளவு மாற்றம்' : 'Qty Change'}</th>
                      <th className="py-2.5 px-3">{isTa ? 'குறிப்பு' : 'Reference / Notes'}</th>
                      <th className="py-2.5 px-3 text-right">{isTa ? 'தேதி' : 'Date'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentLedger.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          {isTa ? 'பரிவர்த்தனைகள் எதுவும் இல்லை' : 'No recent transactions recorded.'}
                        </td>
                      </tr>
                    ) : (
                      recentLedger.map((tx) => {
                        const matchedItem = items.find((i) => i.id === tx.item_id);
                        const isPositive = Number(tx.qty_change) > 0;
                        return (
                          <tr key={tx.id} className="hover:bg-slate-50 transition">
                            <td className="py-2 px-3 font-mono text-slate-500">#{tx.id}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">
                              {matchedItem ? matchedItem.name : `Item #${tx.item_id}`}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                {tx.transaction_type}
                              </span>
                            </td>
                            <td className={`py-2 px-3 text-right font-mono font-bold tabular-nums ${isPositive ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {isPositive ? `+${tx.qty_change}` : tx.qty_change} {matchedItem?.base_unit || ''}
                            </td>
                            <td className="py-2 px-3 text-slate-500 text-[11px]">
                              {tx.reference_type ? `${tx.reference_type} #${tx.reference_id || ''}` : tx.notes || '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-400 text-[11px]">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: COMPLETE BATCH (STEP B) ================= */}
      {completingRun && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-[10px] text-amber-700 font-mono font-bold uppercase tracking-wider">
                  Step B: Complete Batch
                </span>
                <h3 className="text-base font-bold text-slate-900 font-mono">
                  #{completingRun.run_number}
                </h3>
              </div>
              <button
                onClick={() => setCompletingRun(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCompleteBatch} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Actual Good Packets Output
                </label>
                <input
                  type="number"
                  value={stepBGoodPackets}
                  onChange={(e) => setStepBGoodPackets(parseInt(e.target.value) || '')}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold tabular-nums"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Damaged Pouches (Scrap)
                  </label>
                  <input
                    type="number"
                    value={stepBDamaged}
                    onChange={(e) => setStepBDamaged(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Cartons Used
                  </label>
                  <input
                    type="number"
                    value={stepBCartons}
                    onChange={(e) => setStepBCartons(parseInt(e.target.value) || '')}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    {isTa ? 'கூலிச் செலவு (₹)' : 'Labour Cost (₹)'}
                  </label>
                  <input
                    type="number"
                    value={stepBLabourRupees === 0 ? '' : stepBLabourRupees}
                    onChange={(e) => setStepBLabourRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    {isTa ? 'மின்சாரம் / எரிவாயு (₹)' : 'Power / Gas (₹)'}
                  </label>
                  <input
                    type="number"
                    value={stepBOverheadRupees === 0 ? '' : stepBOverheadRupees}
                    onChange={(e) => setStepBOverheadRupees(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-900 font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingRun(null)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isExecuting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition shadow-xs shadow-emerald-600/20 disabled:opacity-50"
                >
                  {isExecuting ? 'Completing...' : 'Finish Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: CLONE BOM VERSION ================= */}
      {cloneModalOpen && bomToClone && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Clone BOM Recipe to New Version
              </h3>
              <button onClick={() => setCloneModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCloneBOM} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">New Version Code</label>
                <input
                  type="text"
                  value={cloneNewCode}
                  onChange={(e) => setCloneNewCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">New Version Name</label>
                <input
                  type="text"
                  value={cloneNewName}
                  onChange={(e) => setCloneNewName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div>
                <span className="block text-slate-700 font-semibold mb-1">Adjust Standard Ingredients:</span>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {bomToClone.ingredients.map((ing) => (
                    <div key={ing.id} className="flex items-center justify-between gap-2 p-2 rounded bg-slate-50">
                      <span className="text-slate-800 truncate">{ing.raw_item_name}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={cloneAdjustments[ing.raw_item_id] || ing.standard_qty}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setCloneAdjustments((prev) => ({ ...prev, [ing.raw_item_id]: v }));
                          }}
                          className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-mono text-right tabular-nums"
                        />
                        <span className="text-slate-500 font-mono text-[11px]">{ing.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCloneModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition shadow-xs"
                >
                  Create Version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD SKU PACK SIZE ================= */}
      {skuModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Add New SKU Pack Size Mapping
              </h3>
              <button onClick={() => setSkuModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSKUMapping} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Target Base Recipe</label>
                <select
                  value={targetBomId}
                  onChange={(e) => setTargetBomId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  required
                >
                  {boms.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">SKU Code</label>
                <input
                  type="text"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Product Description</label>
                <input
                  type="text"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Expected Yield (pkts)</label>
                  <input
                    type="number"
                    value={skuYield}
                    onChange={(e) => setSkuYield(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono tabular-nums"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">MRP / Selling Price (₹)</label>
                  <input
                    type="number"
                    value={skuPriceRupees}
                    onChange={(e) => setSkuPriceRupees(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-mono tabular-nums"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSkuModalOpen(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl transition shadow-xs"
                >
                  Save Pack Size
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
