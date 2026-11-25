/**
 * Pocket Ledger ERP - Commercial Top Action Header
 * Left: Current section title + breadcrumb badge
 * Right: Primary emerald/teal action button, EN|தமிழ் toggle, offline/sync indicator
 */

import React, { useState, useEffect } from 'react';
import {
  Globe,
  Wifi,
  WifiOff,
  Menu,
  Plus,
  MapPin,
  ChevronDown,
  X,
  Check,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { offlineQueue } from '../services/offlineQueue';
import { TN_DISTRICTS } from '../constants/districts';

interface HeaderProps {
  title: string;
  subtitle?: string;
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  onMobileMenuToggle?: () => void;
  onFactoryDistrictChange?: (district: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  primaryAction,
  onMobileMenuToggle,
  onFactoryDistrictChange,
}) => {
  const { language, toggleLanguage, user, factoryDistrict, updateFactoryHub } = useAuth();
  const [isOnline, setIsOnline] = useState(offlineQueue.isOnline());
  const [queuedCount, setQueuedCount] = useState(offlineQueue.getQueue().length);
  const [isHubModalOpen, setIsHubModalOpen] = useState(false);
  const [isSavingHub, setIsSavingHub] = useState(false);

  const canEditHub = user?.role === 'ADMIN' || user?.role === 'OWNER';

  useEffect(() => {
    return offlineQueue.subscribe(() => {
      setIsOnline(offlineQueue.isOnline());
      setQueuedCount(offlineQueue.getQueue().length);
    });
  }, []);

  const handleToggleOffline = () => {
    offlineQueue.toggleSimulatedOffline();
  };

  const handleSelectDistrict = async (d: string) => {
    if (d === factoryDistrict) {
      setIsHubModalOpen(false);
      return;
    }
    setIsSavingHub(true);
    try {
      const res = await updateFactoryHub(d);
      if (onFactoryDistrictChange && res?.factory_district) {
        onFactoryDistrictChange(res.factory_district);
      }
      setIsHubModalOpen(false);
    } catch (err) {
      console.error('Failed to update factory hub district:', err);
    } finally {
      setIsSavingHub(false);
    }
  };

  return (
    <header className="h-14 bg-white border-b border-[#E5E7EB] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-[0_1px_2px_rgba(16,24,40,0.02)] select-none">
      {/* Left: Mobile Toggle & Section Title */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onMobileMenuToggle}
          className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-[#111827] font-heading tracking-tight">
              {title}
            </h1>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] uppercase font-mono">
              {user?.role}
            </span>
          </div>
          {subtitle && (
            <p className="text-[11px] text-[#6B7280] hidden sm:block">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Actions, Language & Network Sync */}
      <div className="flex items-center space-x-2">
        {/* Factory Hub Location Pill */}
        <button
          onClick={() => canEditHub && setIsHubModalOpen(true)}
          title={canEditHub ? 'Click to change active Factory Base District (All 38 TN Districts)' : `Factory Base: ${factoryDistrict}, Tamil Nadu`}
          className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition shadow-[0_1px_2px_rgba(16,24,40,0.02)] ${
            canEditHub
              ? 'bg-white hover:bg-slate-50 text-[#374151] border-[#E5E7EB] cursor-pointer'
              : 'bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] cursor-default'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 text-[#059669] shrink-0" />
          <span className="text-[11px] font-semibold text-[#111827]">
            Hub: {factoryDistrict}, TN
          </span>
          {canEditHub && <ChevronDown className="w-3 h-3 text-[#9CA3AF]" />}
        </button>

        {/* Contextual Primary Action Button */}
        {primaryAction && (
          <button
            onClick={primaryAction.onClick}
            className="h-8 flex items-center gap-1.5 px-3 bg-[#059669] hover:bg-[#047857] active:bg-[#065F46] text-white rounded-lg text-xs font-semibold transition-all shadow-[0_1px_2px_rgba(5,150,105,0.15)]"
          >
            {primaryAction.icon || <Plus className="w-3.5 h-3.5" />}
            <span className="hidden xs:inline">{primaryAction.label}</span>
          </button>
        )}

        {/* Bilingual EN | தமிழ் Toggle */}
        <button
          onClick={toggleLanguage}
          title="Toggle Language: English | தமிழ்"
          className="h-8 flex items-center gap-1.5 px-2.5 bg-white hover:bg-slate-50 text-[#374151] border border-[#E5E7EB] rounded-lg text-xs font-medium transition shadow-[0_1px_2px_rgba(16,24,40,0.02)]"
        >
          <Globe className="w-3.5 h-3.5 text-[#059669]" />
          <span className="text-[11px] font-medium tracking-wide">
            {language === 'EN' ? 'தமிழ்' : 'English'}
          </span>
        </button>

        {/* Offline Simulation Toggle */}
        <button
          onClick={handleToggleOffline}
          title={isOnline ? 'Simulate field offline mode (no network)' : 'Offline mode active. Click to restore online.'}
          className={`h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition shadow-[0_1px_2px_rgba(16,24,40,0.02)] ${
            !isOnline
              ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-inner'
              : 'bg-white text-[#4B5563] border-[#E5E7EB] hover:bg-slate-50'
          }`}
        >
          {!isOnline ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span className="font-mono text-[11px] text-amber-700 font-bold">
                Offline {queuedCount > 0 && `(${queuedCount}Q)`}
              </span>
            </>
          ) : (
            <>
              <Wifi className="w-3.5 h-3.5 text-[#059669]" />
              <span className="hidden lg:inline text-[11px] text-[#4B5563]">Online</span>
            </>
          )}
        </button>
      </div>

      {/* Factory Base Hub Selection Modal */}
      {isHubModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Change Factory Base Hub</h3>
                <p className="text-xs text-slate-500">Active origin district for Tamil Nadu production & GST dispatch</p>
              </div>
              <button
                onClick={() => setIsHubModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TN_DISTRICTS.map((d) => {
                const isSelected = d === factoryDistrict;
                return (
                  <button
                    key={d}
                    onClick={() => handleSelectDistrict(d)}
                    disabled={isSavingHub}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border text-left transition ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <span>{d}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500">
              <span>38 Districts Available (Tamil Nadu)</span>
              <button
                onClick={() => setIsHubModalOpen(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-md font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
