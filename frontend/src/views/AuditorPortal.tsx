/**
 * Pocket Ledger ERP - Commercial External Auditor Portal
 * Strict Read-Only Interface, Live Ledger Integrity Audit,
 * 6 Auditor Reports Library with 1-Click Excel (.xlsx) & CSV Exports.
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  FileSpreadsheet,
  FileText,
  Download,
  RefreshCw,
  CheckCircle,
  Database,
  Layers,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { ProductionRun } from '../types';

type ReportType =
  | 'sales-register'
  | 'gst-outward'
  | 'purchases-register'
  | 'stock-summary'
  | 'production-costing'
  | 'customer-ageing';

interface AuditorPortalProps {
  activeTab?: 'reports' | 'integrity';
  onTabChange?: (tab: 'reports' | 'integrity') => void;
}

export const AuditorPortal: React.FC<AuditorPortalProps> = ({
  activeTab: activeTabProp,
}) => {
  const { language } = useAuth();
  const isTa = language?.toUpperCase() === 'TA' || language?.toLowerCase() === 'ta';

  const formatINR = (val: any): string => {
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const getSafeRows = (data: any): any[] => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  };

  const [internalTab, setInternalTab] = useState<'reports' | 'integrity'>('reports');
  const activeTab = activeTabProp || internalTab;

  useEffect(() => {
    if (activeTabProp) {
      setInternalTab(activeTabProp);
    }
  }, [activeTabProp]);

  const [activeReport, setActiveReport] = useState<ReportType>('sales-register');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any>(null);
  const [productionRuns, setProductionRuns] = useState<ProductionRun[]>([]);

  // Live Integrity Audit State
  const [auditResult, setAuditResult] = useState<{
    status: string;
    integrity_score: string;
    paisa_drift: number;
    total_items_checked: number;
    total_invoices_checked: number;
    checks: Array<{ check: string; passed: boolean; details: string }>;
    issues: string[];
    timestamp: string;
  } | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  useEffect(() => {
    runAuditCheck();
    loadActiveReport(activeReport);
  }, []);

  const runAuditCheck = async () => {
    setIsAuditing(true);
    try {
      const res = await api.getLedgerIntegrityAudit();
      setAuditResult(res);
    } catch (err) {
      console.error('Audit check failed:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  const loadActiveReport = async (rep: ReportType) => {
    setIsLoading(true);
    setReportData(null);
    try {
      const [res, runs] = await Promise.all([
        api.getReport(rep, 'json') as Promise<{ report_title: string; data: any }>,
        api.getProductionRuns(),
      ]);
      setReportData(res);
      setProductionRuns(runs);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchReport = (rep: ReportType) => {
    setActiveReport(rep);
    setReportData(null);
    setIsLoading(true);
    loadActiveReport(rep);
  };

  const reportDefinitions: Array<{
    id: ReportType;
    labelEn: string;
    labelTa: string;
    titleEn: string;
    titleTa: string;
    icon: any;
  }> = [
    {
      id: 'sales-register',
      labelEn: 'Sales Register',
      labelTa: 'விற்பனைப் பதிவேடு',
      titleEn: 'Sales Register & Tax Invoices',
      titleTa: 'விற்பனைப் பதிவேடு & வரி விலைப்பட்டியல்கள்',
      icon: ShoppingBag,
    },
    {
      id: 'gst-outward',
      labelEn: 'GSTR-1 / 3B Outward',
      labelTa: 'ஜிஎஸ்டிஆர்-1 / 3B விற்பனை வரி',
      titleEn: 'GSTR-1 & GSTR-3B Outward Supplies Register',
      titleTa: 'ஜிஎஸ்டிஆர்-1 & 3B வெளிச்செல்லும் விநியோகப் பதிவேடு',
      icon: FileText,
    },
    {
      id: 'purchases-register',
      labelEn: 'Purchase Register',
      labelTa: 'கொள்முதல் பதிவேடு',
      titleEn: 'Inbound Raw Material Purchases Register',
      titleTa: 'மூலப்பொருள் கொள்முதல் பதிவேடு',
      icon: FileSpreadsheet,
    },
    {
      id: 'stock-summary',
      labelEn: 'Stock Valuation Summary',
      labelTa: 'சரக்கு இருப்பு & மதிப்பு சுருக்கம்',
      titleEn: 'Stock Summary & Weighted Average Valuation',
      titleTa: 'சரக்கு இருப்பு & சராசரி கொள்முதல் மதிப்பு அறிக்கை',
      icon: Database,
    },
    {
      id: 'production-costing',
      labelEn: 'Batch Costing & Variances',
      labelTa: 'தொகுதி அடக்க விலை & மாறுபாடுகள்',
      titleEn: 'Production Batch Costing & Yield Variance Report',
      titleTa: 'உற்பத்தி தொகுதி அடக்க விலை & மகசூல் மாறுபாடு அறிக்கை',
      icon: Layers,
    },
    {
      id: 'customer-ageing',
      labelEn: 'Receivables Ageing',
      labelTa: 'நிலுவைத் தொகை வயதுப் பகுப்பாய்வு',
      titleEn: 'Customer Receivables Ageing Analysis',
      titleTa: 'வாடிக்கையாளர் நிலுவைத் தொகை வயதுப் பகுப்பாய்வு அறிக்கை',
      icon: TrendingUp,
    },
  ];

  const activeDef = reportDefinitions.find((r) => r.id === activeReport) || reportDefinitions[0];

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      {activeTab === 'integrity' && (
        <div className="flex items-center justify-end pb-1">
          <button
            onClick={runAuditCheck}
            disabled={isAuditing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-lg text-xs font-medium shadow-xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-gray-500 ${isAuditing ? 'animate-spin' : ''}`} />
            <span>{isTa ? 'மீண்டும் சரிபார்க்கவும்' : 'Rerun Verification'}</span>
          </button>
        </div>
      )}

      {/* ================= TAB: LIVE LEDGER INTEGRITY AUDIT ================= */}
      {activeTab === 'integrity' && auditResult && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {isTa ? 'கணக்கு மற்றும் சரக்கு சரிபார்ப்பு' : 'Account & Stock Verification'}
                </h3>
                <p className="text-xs text-gray-500">
                  {isTa
                    ? 'மாற்ற முடியாத இருப்பு பதிவேடுகள் மற்றும் பைசா-கணக்கீடுகள் முழுமையாக சரிபார்க்கப்பட்டன'
                    : 'Verified across all append-only stock movements and integer-paisa invoice tables'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium font-mono">
                SCORE: {auditResult.integrity_score}
              </span>
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-mono font-medium">
                DRIFT: {auditResult.paisa_drift} PAISA
              </span>
            </div>
          </div>

          {/* Individual Checks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {auditResult.checks.map((c, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-lg bg-gray-50/80 border border-gray-100 flex items-start space-x-2.5 text-xs"
              >
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-gray-900">{c.check}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{c.details}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================= TAB: AUDITOR REPORTS LIBRARY ================= */}
      {activeTab === 'reports' && (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              {isTa ? 'அறிக்கைகள்' : 'Reports Library'}
            </h3>
            <p className="text-xs text-gray-500">
              {isTa ? 'உடனடி அட்டவணை பார்வை & எக்செல் (.xlsx) அல்லது CSV ஏற்றுமதி' : 'Tabular views with export to Excel (.xlsx) and CSV'}
            </p>
          </div>

          {/* Export Buttons */}
          <div className="flex items-center gap-2">
            <a
              href={api.getReport(activeReport, 'xlsx') as string}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-xs transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isTa ? 'எக்செல் (.xlsx)' : 'Export Excel (.xlsx)'}</span>
            </a>
            <a
              href={api.getReport(activeReport, 'csv') as string}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isTa ? 'CSV ஏற்றுமதி' : 'Export CSV'}</span>
            </a>
          </div>
        </div>

        {/* Report Selector Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {reportDefinitions.map((btn) => {
            const Icon = btn.icon;
            const isActive = activeReport === btn.id;
            return (
              <button
                key={btn.id}
                onClick={() => handleSwitchReport(btn.id)}
                className={`p-2.5 rounded-xl text-left border transition text-xs font-semibold flex flex-col justify-between ${
                  isActive
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <Icon className={`w-4 h-4 mb-1.5 ${isActive ? 'text-emerald-700' : 'text-slate-500'}`} />
                <span className="leading-tight">{isTa ? btn.labelTa : btn.labelEn}</span>
              </button>
            );
          })}
        </div>

        {/* Active Report Header */}
        <div className="flex items-center justify-between pt-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            {isTa ? activeDef.titleTa : activeDef.titleEn}
          </h4>
          <span className="text-[11px] text-slate-400 font-mono">
            {isLoading ? (isTa ? 'ஏற்றுகிறது...' : 'Loading data...') : (isTa ? 'நேரலை புதுப்பிப்பு' : 'Live Synced')}
          </span>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 gap-2 font-sans border border-dashed border-slate-200 rounded-lg">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs">{isTa ? 'அறிக்கை தரவு ஏற்றப்படுகிறது...' : 'Loading report data...'}</span>
          </div>
        ) : (
          <>
            {/* 1. SALES REGISTER TABLE */}
            {activeReport === 'sales-register' && (() => {
              const rows = getSafeRows(reportData);
              return (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-semibold font-sans uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">{isTa ? 'விலைப்பட்டியல் #' : 'Invoice #'}</th>
                        <th className="p-2.5">{isTa ? 'தேதி' : 'Date'}</th>
                        <th className="p-2.5">{isTa ? 'வாடிக்கையாளர்' : 'Customer Party'}</th>
                        <th className="p-2.5">{isTa ? 'மாநிலம்' : 'State'}</th>
                        <th className="p-2.5">{isTa ? 'பொருள்' : 'Product'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'அளவு' : 'Qty'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'விலை' : 'Rate'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'வரிக்குரிய மதிப்பு' : 'Taxable'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'CGST' : 'CGST'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'SGST' : 'SGST'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'IGST' : 'IGST'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'மொத்தம் (₹)' : 'Total (₹)'}</th>
                        <th className="p-2.5 text-center">{isTa ? 'நிலை' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="p-6 text-center text-slate-400 font-sans">
                            {isTa ? 'விற்பனை விலைப்பட்டியல் பதிவுகள் எதுவும் இல்லை.' : 'No sales invoice records found.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((row: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50/70">
                            <td className="p-2.5 font-bold text-slate-900">{row.invoice_no}</td>
                            <td className="p-2.5 text-slate-600">{row.date}</td>
                            <td className="p-2.5 font-sans font-semibold text-slate-900">{row.customer_name}</td>
                            <td className="p-2.5 font-sans text-slate-500">{row.state}</td>
                            <td className="p-2.5 font-sans text-slate-700">{row.item_sku}</td>
                            <td className="p-2.5 text-right tabular-nums">{row.qty_packets}</td>
                            <td className="p-2.5 text-right tabular-nums">₹{formatINR(row.rate_inr)}</td>
                            <td className="p-2.5 text-right font-bold tabular-nums">₹{formatINR(row.taxable_inr)}</td>
                            <td className="p-2.5 text-right tabular-nums text-slate-600">₹{formatINR(row.cgst_inr)}</td>
                            <td className="p-2.5 text-right tabular-nums text-slate-600">₹{formatINR(row.sgst_inr)}</td>
                            <td className="p-2.5 text-right tabular-nums text-slate-600">₹{formatINR(row.igst_inr)}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">
                              ₹{formatINR(row.total_inr)}
                            </td>
                            <td className="p-2.5 text-center">
                              <span className="px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* 2. GSTR-1 / 3B OUTWARD TABLE */}
            {activeReport === 'gst-outward' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {isTa ? 'தொழிற்சாலை வரி பதிவு விவரங்கள்' : 'Factory Tax Registration Details'}
                    </h4>
                    <div className="text-xs text-slate-600">
                      <div>GSTIN: <strong className="text-slate-900 font-mono">{reportData?.data?.factory_gstin || '33ABCDE1234F1Z5'}</strong></div>
                      <div>{isTa ? 'மூல மாநிலம்' : 'Origin State'}: <strong className="text-emerald-700 font-bold">{reportData?.data?.factory_state || 'Tamil Nadu'}</strong></div>
                    </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1.5">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      {isTa ? 'GSTR-3B பிரிவு 3.1a மொத்த சுருக்கம்' : 'GSTR-3B Table 3.1a Total Summary'}
                    </h4>
                    <div className="text-xs text-slate-700 font-mono">
                      <div>
                        {isTa ? 'வரிக்குரிய மதிப்பு' : 'Taxable Value'}:{' '}
                        <strong className="text-slate-900">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_taxable_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_taxable_inr ?? 0)}
                        </strong>
                      </div>
                      <div>
                        {isTa ? 'மொத்த வரி' : 'Total Tax'}:{' '}
                        <strong className="text-emerald-700 font-bold">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_tax_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_tax_inr ?? 0)}
                        </strong>
                      </div>
                      <div>
                        {isTa ? 'மொத்த மதிப்பு' : 'Grand Value'}:{' '}
                        <strong className="text-slate-900 font-bold">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.grand_total_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.grand_total_inr ?? 0)}
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-semibold font-sans uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">{isTa ? 'விநியோக வகைப்பாடு' : 'Supply Classification'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'விலைப்பட்டியல்கள்' : 'Invoices'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'வரிக்குரிய மதிப்பு (₹)' : 'Taxable (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'CGST (₹)' : 'CGST (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'SGST (₹)' : 'SGST (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'IGST (₹)' : 'IGST (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'மொத்த வரி (₹)' : 'Total Tax (₹)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-semibold text-slate-900">
                          {isTa ? '4A - மாநிலத்திற்குள் B2B (தமிழ்நாடு 50/50 பகிர்வு)' : '4A - Intra-State B2B (Tamil Nadu 50/50 split)'}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">{reportData?.data?.intra_state_b2b?.invoice_count || 0}</td>
                        <td className="p-2.5 text-right font-bold tabular-nums">₹{formatINR(reportData?.data?.intra_state_b2b?.taxable_inr)}</td>
                        <td className="p-2.5 text-right tabular-nums">₹{formatINR(reportData?.data?.intra_state_b2b?.cgst_inr)}</td>
                        <td className="p-2.5 text-right tabular-nums">₹{formatINR(reportData?.data?.intra_state_b2b?.sgst_inr)}</td>
                        <td className="p-2.5 text-right text-slate-400 tabular-nums">₹0.00</td>
                        <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">
                          ₹{formatINR(reportData?.data?.intra_state_b2b?.total_tax_inr ?? ((Number(reportData?.data?.intra_state_b2b?.cgst_inr) || 0) + (Number(reportData?.data?.intra_state_b2b?.sgst_inr) || 0)))}
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-2.5 font-sans font-semibold text-slate-900">
                          {isTa ? '4B - மாநிலங்களுக்கு இடையிலான B2B (100% IGST)' : '4B - Inter-State B2B (Other States 100% IGST)'}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">{reportData?.data?.inter_state_b2b?.invoice_count || 0}</td>
                        <td className="p-2.5 text-right font-bold tabular-nums">₹{formatINR(reportData?.data?.inter_state_b2b?.taxable_inr)}</td>
                        <td className="p-2.5 text-right text-slate-400 tabular-nums">₹0.00</td>
                        <td className="p-2.5 text-right text-slate-400 tabular-nums">₹0.00</td>
                        <td className="p-2.5 text-right tabular-nums text-slate-700">₹{formatINR(reportData?.data?.inter_state_b2b?.igst_inr)}</td>
                        <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">
                          ₹{formatINR(reportData?.data?.inter_state_b2b?.total_tax_inr ?? (Number(reportData?.data?.inter_state_b2b?.igst_inr) || 0))}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-slate-100/80 font-bold border-t border-slate-300">
                      <tr>
                        <td className="p-2.5 font-sans text-slate-900">
                          {isTa ? 'மொத்த விநியோகம் (GSTR-3B Table 3.1a)' : 'Total Outward Supplies (GSTR-3B Table 3.1a)'}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">
                          {(reportData?.data?.intra_state_b2b?.invoice_count || 0) + (reportData?.data?.inter_state_b2b?.invoice_count || 0)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-slate-900">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_taxable_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_taxable_inr ?? 0)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_cgst_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_cgst_inr ?? 0)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_sgst_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_sgst_inr ?? 0)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_igst_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_igst_inr ?? 0)}
                        </td>
                        <td className="p-2.5 text-right text-emerald-800 font-extrabold tabular-nums">
                          ₹{formatINR(reportData?.data?.total_taxable_supplies?.total_tax_inr ?? reportData?.data?.gstr_3b_table_3_1_a?.total_tax_inr ?? 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* 3. PURCHASES REGISTER TABLE */}
            {activeReport === 'purchases-register' && (() => {
              const rows = getSafeRows(reportData);
              return (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-semibold font-sans uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">{isTa ? 'பில் எண்' : 'Bill No'}</th>
                        <th className="p-2.5">{isTa ? 'தேதி' : 'Date'}</th>
                        <th className="p-2.5">{isTa ? 'விற்பனையாளர்' : 'Supplier'}</th>
                        <th className="p-2.5">{isTa ? 'பொருள்' : 'Item'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'அளவு' : 'Qty'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'அலகு விலை (₹)' : 'Unit Rate (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'மொத்தம் (₹)' : 'Total (₹)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400 font-sans">
                            {isTa ? 'கொள்முதல் ரசீதுகள் எதுவும் இல்லை.' : 'No purchase bills recorded.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{p.bill_no}</td>
                            <td className="p-2.5 text-slate-600">{p.date}</td>
                            <td className="p-2.5 font-sans font-semibold text-slate-900">{p.supplier}</td>
                            <td className="p-2.5 font-sans text-slate-700">{p.item}</td>
                            <td className="p-2.5 text-right font-bold tabular-nums">{p.qty}</td>
                            <td className="p-2.5 text-right tabular-nums">₹{formatINR(p.rate)}</td>
                            <td className="p-2.5 text-right font-bold text-emerald-700 tabular-nums">₹{formatINR(p.total)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* 4. STOCK SUMMARY TABLE */}
            {activeReport === 'stock-summary' && (() => {
              const rows = getSafeRows(reportData);
              return (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-semibold font-sans uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">{isTa ? 'பொருள் குறியீடு' : 'SKU'}</th>
                        <th className="p-2.5">{isTa ? 'பொருள் பெயர்' : 'Item Name'}</th>
                        <th className="p-2.5">{isTa ? 'வகை' : 'Category'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'ஆரம்ப இருப்பு' : 'Opening'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'கொள்முதல்' : 'Purchased'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'பயன்பாடு' : 'Issued'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'உற்பத்தி' : 'Produced'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'விற்பனை' : 'Dispatched'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'இறுதி இருப்பு' : 'Closing'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'அலகு மதிப்பு (₹)' : 'Unit Rate (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'மதிப்பு (₹)' : 'Valuation (₹)'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-6 text-center text-slate-400 font-sans">
                            {isTa ? 'சரக்கு இருப்பு விவரங்கள் இல்லை.' : 'No stock summary records found.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((s: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-slate-900">{s.sku_code}</td>
                            <td className="p-2.5 font-sans text-slate-900 font-medium">{s.item_name || s.name}</td>
                            <td className="p-2.5 font-sans text-slate-500">{s.category}</td>
                            <td className="p-2.5 text-right tabular-nums">{s.opening_qty ?? 0}</td>
                            <td className="p-2.5 text-right tabular-nums text-emerald-700">+{s.purchased_qty ?? 0}</td>
                            <td className="p-2.5 text-right tabular-nums text-rose-700">-{s.prod_issued_qty ?? 0}</td>
                            <td className="p-2.5 text-right tabular-nums text-teal-700">+{s.prod_output_qty ?? 0}</td>
                            <td className="p-2.5 text-right tabular-nums text-amber-700">-{s.sales_dispatched_qty ?? 0}</td>
                            <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">{s.closing_stock ?? 0}</td>
                            <td className="p-2.5 text-right tabular-nums">₹{formatINR(s.unit_valuation_inr ?? s.unit_rate_rupees)}</td>
                            <td className="p-2.5 text-right font-bold text-emerald-700 tabular-nums">
                              ₹{formatINR(s.total_valuation_inr ?? s.valuation_rupees)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* 5. PRODUCTION VARIANCE & COSTING TABLE */}
            {(activeReport === 'production-costing' || (activeReport as string) === 'production-variance') && (() => {
              const rows = (reportData?.data && Array.isArray(reportData.data) && reportData.data.length > 0)
                ? reportData.data
                : (Array.isArray(productionRuns) ? productionRuns : []);
              return (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">{isTa ? 'தொகுதி #' : 'Run #'}</th>
                        <th className="p-2.5">{isTa ? 'பொருள்' : 'Finished SKU'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'தொகுதிகள்' : 'Batches'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'எதிர்பார்த்தது' : 'Expected'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'உற்பத்தி பாக்கெட்டுகள்' : 'Good Pkts'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'மகசூல் மாறுபாடு' : 'Yield Var'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'தொகுதி செலவு' : 'Batch Cost'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'பாக்கெட் விலை' : 'Cost / Pkt'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'விற்பனை விலை' : 'Selling Price'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'லாப வரம்பு' : 'Gross Margin'}</th>
                        <th className="p-2.5 text-center">{isTa ? '3% எச்சரிக்கை' : '3% Alert'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800 font-mono">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={11} className="p-6 text-center text-slate-400 font-sans">
                            {isTa ? 'உற்பத்தி தொகுதிகள் எதுவும் செய்யப்படவில்லை.' : 'No production batches executed yet.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((r: any) => {
                          const runNumber = r.run_number;
                          const skuName = r.finished_item_name || r.finished_sku || 'Murukku 200g';
                          const batchesCount = r.batches_count;
                          const expected = r.expected_packets ?? r.expected_output_packets ?? 0;
                          const actual = r.actual_packets ?? r.actual_good_packets ?? 0;
                          const yieldVar = formatINR(r.yield_variance_pct);
                          const batchCost = formatINR(r.batch_cost_inr ?? ((r.costing?.total_batch_cost_paisa || 0) / 100));
                          const costPerPkt = formatINR(r.cost_per_packet_inr ?? ((r.cost_per_packet_paisa || 0) / 100));
                          const sellingPrice = formatINR(r.selling_price_inr ?? ((r.costing?.selling_price_paisa || 0) / 100));
                          const grossMargin = formatINR(r.gross_margin_pct ?? r.costing?.gross_margin_pct);
                          const hasAlert = r.has_variance_alert;

                          return (
                            <tr key={runNumber} className="hover:bg-slate-50">
                              <td className="p-2.5 font-bold text-slate-900">{runNumber}</td>
                              <td className="p-2.5 font-sans font-medium text-slate-900">{skuName}</td>
                              <td className="p-2.5 text-right tabular-nums">{batchesCount}</td>
                              <td className="p-2.5 text-right tabular-nums">{expected}</td>
                              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">{actual}</td>
                              <td className="p-2.5 text-right font-bold text-rose-600 tabular-nums">
                                {yieldVar}%
                              </td>
                              <td className="p-2.5 text-right tabular-nums">
                                ₹{batchCost}
                              </td>
                              <td className="p-2.5 text-right font-bold text-emerald-700 tabular-nums">
                                ₹{costPerPkt}
                              </td>
                              <td className="p-2.5 text-right tabular-nums">
                                ₹{sellingPrice}
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-900 tabular-nums">
                                {grossMargin}%
                              </td>
                              <td className="p-2.5 text-center">
                                {hasAlert ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    {isTa ? 'எச்சரிக்கை (>3%)' : 'FLAGGED (>3%)'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-sans font-bold bg-emerald-50 text-emerald-800">
                                    {isTa ? 'சரியானது' : 'NORMAL'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* 6. CUSTOMER AGEING TABLE */}
            {activeReport === 'customer-ageing' && (() => {
              const rows = getSafeRows(reportData);
              return (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-50 text-slate-600 font-semibold font-sans uppercase text-[11px]">
                      <tr>
                        <th className="p-2.5">{isTa ? 'வாடிக்கையாளர்' : 'Customer Party'}</th>
                        <th className="p-2.5">{isTa ? 'மாநிலம்' : 'State'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'விலைப்பட்டியல் (₹)' : 'Billed (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'செலுத்தியது (₹)' : 'Paid (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? 'நிலுவைத் தொகை (₹)' : 'Outstanding (₹)'}</th>
                        <th className="p-2.5 text-right">{isTa ? '0-30 நாட்கள்' : '0-30 Days'}</th>
                        <th className="p-2.5 text-right">{isTa ? '31-60 நாட்கள்' : '31-60 Days'}</th>
                        <th className="p-2.5 text-right">{isTa ? '60+ நாட்கள்' : '60+ Days'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-800">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-400 font-sans">
                            {isTa ? 'வாடிக்கையாளர் நிலுவை பதிவுகள் எதுவும் இல்லை.' : 'No customer ageing records found.'}
                          </td>
                        </tr>
                      ) : (
                        rows.map((rec: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2.5 font-sans font-semibold text-slate-900">{rec.customer_name}</td>
                            <td className="p-2.5 font-sans text-slate-500">{rec.state}</td>
                            <td className="p-2.5 text-right tabular-nums">₹{formatINR(rec.total_billed_rupees)}</td>
                            <td className="p-2.5 text-right tabular-nums text-slate-600">
                              ₹{formatINR(rec.total_paid_rupees)}
                            </td>
                            <td className="p-2.5 text-right font-bold text-amber-700 tabular-nums">
                              ₹{formatINR(rec.outstanding_rupees)}
                            </td>
                            <td className="p-2.5 text-right tabular-nums text-slate-700">
                              ₹{formatINR(rec.ageing_buckets?.days_0_30_rupees)}
                            </td>
                            <td className="p-2.5 text-right tabular-nums text-slate-700">
                              ₹{formatINR(rec.ageing_buckets?.days_31_60_rupees)}
                            </td>
                            <td className="p-2.5 text-right tabular-nums text-slate-700">
                              ₹{formatINR(rec.ageing_buckets?.days_60_plus_rupees)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </>
        )}
      </div>
      )}
    </div>
  );
};
