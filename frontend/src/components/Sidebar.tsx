/**
 * Pocket Ledger ERP - Commercial Enterprise Sidebar Navigation
 * 240px Fixed Left Sidebar (Refined Soft-Slate #F8FAFC) with categorized ERP modules
 * and bottom User Profile Card + 1-Click Role Switcher.
 */

import React, { useState } from 'react';
import {
  Package,
  Layers,
  FlaskConical,
  ShoppingCart,
  Receipt,
  FileCheck2,
  TrendingUp,
  Shield,
  Factory,
  UserCheck,
  LogOut,
  ChevronRight,
  Truck,
  DollarSign,
  ShoppingBag,
  Clock,
  Database,
} from 'lucide-react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { UserRole } from '../types';
import { Logo } from './Logo';

interface SidebarProps {
  activeSection: string;
  onNavigate: (section: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeSection, onNavigate }) => {
  const { user, quickSwitchRole, logout, language } = useAuth();
  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  const isTa = language?.toUpperCase() === 'TA' || language?.toLowerCase() === 'ta';

  // Role icon helper
  const getRoleIcon = (role: UserRole | string) => {
    switch (role) {
      case 'SALESMAN':
        return <UserCheck className="w-4 h-4 text-sky-600" />;
      case 'PRODUCTION':
        return <Factory className="w-4 h-4 text-emerald-600" />;
      case 'ADMIN':
        return <Shield className="w-4 h-4 text-indigo-600" />;
      case 'AUDITOR':
        return <FileCheck2 className="w-4 h-4 text-teal-600" />;
      case 'OWNER':
        return <TrendingUp className="w-4 h-4 text-amber-600" />;
      default:
        return <UserCheck className="w-4 h-4 text-slate-500" />;
    }
  };

  // Robust active section mapping strictly scoped by user role
  const isItemActive = (itemId: string) => {
    if (activeSection === itemId) return true;
    if (user?.role === 'OWNER') {
      if (itemId === 'owner-dashboard') return activeSection === 'owner-dashboard' || activeSection === 'dashboard';
      if (itemId === 'owner-batches') return activeSection === 'owner-batches' || activeSection === 'production-batches' || activeSection === 'batches';
      if (itemId === 'owner-invoices') return activeSection === 'owner-invoices' || activeSection === 'admin-invoices' || activeSection === 'invoices';
      if (itemId === 'owner-receivables') return activeSection === 'owner-receivables' || activeSection === 'admin-receivables' || activeSection === 'receivables';
      if (itemId === 'owner-reports') return activeSection === 'owner-reports' || activeSection === 'auditor-reports' || activeSection === 'reports';
      return false;
    }
    if (user?.role === 'ADMIN') {
      if (itemId === 'admin-orders') return activeSection === 'admin-orders' || activeSection === 'orders';
      if (itemId === 'admin-invoices') return activeSection === 'admin-invoices' || activeSection === 'invoices';
      if (itemId === 'admin-receivables') return activeSection === 'admin-receivables' || activeSection === 'receivables';
      if (itemId === 'admin-masters') return activeSection === 'admin-masters' || activeSection === 'masters';
      return false;
    }
    if (user?.role === 'PRODUCTION') {
      if (itemId === 'production-batches') return activeSection === 'production-batches' || activeSection === 'batches';
      if (itemId === 'production-bom') return activeSection === 'production-bom' || activeSection === 'bom';
      if (itemId === 'production-purchases') return activeSection === 'production-purchases' || activeSection === 'purchases';
      if (itemId === 'production-stock') return activeSection === 'production-stock' || activeSection === 'stock';
      return false;
    }
    if (user?.role === 'AUDITOR') {
      if (itemId === 'auditor-reports') return activeSection === 'auditor-reports' || activeSection === 'reports';
      if (itemId === 'auditor-integrity') return activeSection === 'auditor-integrity' || activeSection === 'integrity';
      return false;
    }
    if (user?.role === 'SALESMAN') {
      if (itemId === 'sales-entry') return activeSection === 'sales-entry' || activeSection === 'entry';
      if (itemId === 'sales-orders') return activeSection === 'sales-orders' || activeSection === 'orders';
      return false;
    }
    return false;
  };

  // Strict role-based navigation menus
  const getNavCategoriesForRole = () => {
    switch (user?.role) {
      case 'SALESMAN':
        return [
          {
            category: isTa ? 'விற்பனை' : 'Sales',
            items: [
              { id: 'sales-entry', label: isTa ? 'புதிய விற்பனை ஆர்டர்' : 'New Sales Order', icon: ShoppingBag },
              { id: 'sales-orders', label: isTa ? 'விற்பனை ஆர்டர்கள்' : 'Orders', icon: Clock },
            ],
          },
        ];
      case 'PRODUCTION':
        return [
          {
            category: isTa ? 'உற்பத்தி' : 'Production',
            items: [
              { id: 'production-batches', label: isTa ? 'உற்பத்தி தொகுதிகள்' : 'Batches', icon: Layers },
              { id: 'production-bom', label: isTa ? 'செய்முறைகள்' : 'Recipes', icon: FlaskConical },
              { id: 'production-purchases', label: isTa ? 'மூலப்பொருள் கொள்முதல்' : 'Raw Material Purchases', icon: Truck },
              { id: 'production-stock', label: isTa ? 'சரக்கு இருப்பு' : 'Inventory', icon: Package },
            ],
          },
        ];
      case 'ADMIN':
        return [
          {
            category: isTa ? 'செயல்பாடுகள் & பில்லிங்' : 'Operations & Billing',
            items: [
              { id: 'admin-orders', label: isTa ? 'ஆர்டர்கள்' : 'Orders', icon: ShoppingCart },
              { id: 'admin-invoices', label: isTa ? 'விலைப்பட்டியல்கள்' : 'Invoices', icon: Receipt },
              { id: 'admin-receivables', label: isTa ? 'நிலுவைத் தொகை' : 'Receivables', icon: DollarSign },
              { id: 'admin-masters', label: isTa ? 'பொருட்கள் & பார்ட்டிகள்' : 'Catalog & Parties', icon: Database },
            ],
          },
        ];
      case 'AUDITOR':
        return [
          {
            category: isTa ? 'தணிக்கை & இணக்கம்' : 'Audit & Compliance',
            items: [
              { id: 'auditor-reports', label: isTa ? 'அறிக்கைகள்' : 'Reports', icon: FileCheck2 },
              { id: 'auditor-integrity', label: isTa ? 'கணக்கு சரிபார்ப்பு' : 'Verification', icon: Shield },
            ],
          },
        ];
      case 'OWNER':
        return [
          {
            category: isTa ? 'நிர்வாகம்' : 'Executive',
            items: [
              { id: 'owner-dashboard', label: isTa ? 'டாஷ்போர்டு' : 'Dashboard', icon: TrendingUp },
              { id: 'owner-batches', label: isTa ? 'உற்பத்தி தொகுதிகள்' : 'Batches', icon: Layers },
              { id: 'owner-invoices', label: isTa ? 'விலைப்பட்டியல்கள்' : 'Invoices', icon: Receipt },
              { id: 'owner-receivables', label: isTa ? 'நிலுவைத் தொகை' : 'Receivables', icon: DollarSign },
              { id: 'owner-reports', label: isTa ? 'அறிக்கைகள்' : 'Reports', icon: FileCheck2 },
            ],
          },
        ];
      default:
        return [];
    }
  };

  const navCategories = getNavCategoriesForRole();

  return (
    <aside className="w-60 bg-[#FAFAFB] text-slate-700 flex flex-col fixed top-0 bottom-0 left-0 z-30 border-r border-[#E5E7EB] shadow-xs select-none">
      {/* Brand Header */}
      <div className="px-4 py-4 border-b border-[#E5E7EB] bg-[#FAFAFB]">
        <Logo size={34} showText subtitle="Manufacturing & GST" theme="light" />
      </div>

      {/* Categorized Nav Items */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 scrollbar-thin scrollbar-thumb-slate-200">
        {navCategories.map((cat, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
              {cat.category}
            </div>
            {cat.items.map((item) => {
              const Icon = item.icon;
              const isActive = isItemActive(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full h-9 flex items-center justify-between px-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#ECFDF5] text-[#065F46] font-semibold border border-[#A7F3D0]/70 shadow-[0_1px_2px_rgba(5,150,105,0.05)]'
                      : 'text-[#4B5563] hover:text-[#111827] hover:bg-[#F3F4F6] transition-colors'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-[#059669]' : 'text-[#9CA3AF]'}`} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#059669] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom User Profile & Role Switcher */}
      <div className="border-t border-[#E5E7EB] bg-[#FAFAFB] p-3 relative">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="p-1.5 rounded-lg bg-white border border-[#E5E7EB] shadow-[0_1px_2px_rgba(16,24,40,0.04)] flex-shrink-0">
              {user && getRoleIcon(user.role)}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#111827] truncate font-heading">
                {user?.full_name}
              </div>
              <div className="text-[10px] text-[#059669] font-mono uppercase tracking-wider font-semibold truncate" title={user?.username === 'salesman_b' ? 'Inter-State & Export Territory' : user?.username === 'salesman_a' ? 'TN Local Territory' : user?.role}>
                {user?.username === 'salesman_b' || user?.id === 2
                  ? (isTa ? 'வெளிமாநில & ஏற்றுமதி' : 'Inter-State & Export')
                  : user?.username === 'salesman_a' || user?.id === 1
                  ? (isTa ? 'தமிழ்நாடு உள்ளூர்' : 'TN Local Territory')
                  : user?.role}
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            title={isTa ? 'வெளியேறு' : 'Log Out'}
            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Role Switcher Trigger Button */}
        <button
          onClick={() => setRoleSwitcherOpen(!roleSwitcherOpen)}
          className="w-full h-8 flex items-center justify-center gap-1.5 px-2 bg-white hover:bg-slate-50 text-[#374151] border border-[#E5E7EB] rounded-lg text-[11px] font-medium shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#059669]" />
          <span>{isTa ? 'பயனர் மாற்று' : 'Switch Role'}</span>
        </button>

        {/* Role Popover */}
        {roleSwitcherOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 bg-white border border-[#E5E7EB] rounded-xl shadow-lg p-2 z-50 space-y-1">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
              <span>{isTa ? 'பயனர் தேர்வு' : 'Switch Demo Account'}</span>
            </div>
            {Object.entries(DEMO_USERS).map(([key, item]) => (
              <button
                key={key}
                onClick={() => {
                  quickSwitchRole(key);
                  setRoleSwitcherOpen(false);
                }}
                className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs transition ${
                  user?.username === item.username
                    ? 'bg-[#ECFDF5] text-[#065F46] font-semibold border border-[#A7F3D0]/70'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {getRoleIcon(item.role)}
                <div className="flex-1 text-left min-w-0">
                  <div className="text-xs truncate">{item.label}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
