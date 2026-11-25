/**
 * Pocket Ledger ERP - Top Navigation Bar
 * Features:
 * - One-click Quick Role Switcher (2-second role change for demo video)
 * - Interactive Simulated Offline Toggle (demonstrating salesman PWA queue without turning off Wi-Fi)
 * - Bilingual EN|தமிழ் Language Toggle
 */

import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Globe,
  ChevronDown,
  UserCheck,
  Shield,
  Factory,
  FileCheck2,
  TrendingUp,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { offlineQueue } from '../services/offlineQueue';
import { Logo } from './Logo';

export const Navbar: React.FC = () => {
  const { user, language, quickSwitchRole, toggleLanguage, logout } = useAuth();
  const [isOnline, setIsOnline] = useState(offlineQueue.isOnline());
  const [isSimulated, setIsSimulated] = useState(offlineQueue.isSimulated());
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [queuedCount, setQueuedCount] = useState(offlineQueue.getQueue().length);

  useEffect(() => {
    return offlineQueue.subscribe(() => {
      setIsOnline(offlineQueue.isOnline());
      setIsSimulated(offlineQueue.isSimulated());
      setQueuedCount(offlineQueue.getQueue().length);
    });
  }, []);

  const handleToggleOffline = () => {
    offlineQueue.toggleSimulatedOffline();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'SALESMAN':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'PRODUCTION':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'ADMIN':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'AUDITOR':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'OWNER':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-slate-700 text-slate-300 border-slate-600';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'SALESMAN':
        return <UserCheck className="w-3.5 h-3.5" />;
      case 'PRODUCTION':
        return <Factory className="w-3.5 h-3.5" />;
      case 'ADMIN':
        return <Shield className="w-3.5 h-3.5" />;
      case 'AUDITOR':
        return <FileCheck2 className="w-3.5 h-3.5" />;
      case 'OWNER':
        return <TrendingUp className="w-3.5 h-3.5" />;
      default:
        return <UserCheck className="w-3.5 h-3.5" />;
    }
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md bg-opacity-95 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand & Factory Details */}
        <Logo size={36} showText subtitle="Manufacturing & GST" theme="dark" />

        {/* Center / Right: Interactive Demo Controls */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 text-xs">
          {/* Simulated Offline Toggle Pill */}
          <button
            onClick={handleToggleOffline}
            title={isSimulated ? "Currently simulating offline mode. Click to restore online." : "Click to simulate offline mode for demo without disconnecting Wi-Fi"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-medium transition-all ${
              !isOnline
                ? 'bg-amber-950/80 text-amber-300 border-amber-600/50 shadow-inner'
                : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span className="font-mono text-[11px]">
                  Offline {queuedCount > 0 && `(${queuedCount}Q)`}
                </span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline text-[11px]">Simulate Offline</span>
              </>
            )}
          </button>

          {/* Bilingual Tamil/English Switcher */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-800 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg transition"
            title="Toggle Bilingual Interface: English | தமிழ்"
          >
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold text-[11px] tracking-wide">
              {language === 'EN' ? 'தமிழ்' : 'English'}
            </span>
          </button>

          {/* 2-Second Role Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setRoleMenuOpen(!roleMenuOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                user ? getRoleBadgeColor(user.role) : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {user && getRoleIcon(user.role)}
              <span className="max-w-[100px] truncate sm:max-w-none">
                {user ? user.full_name : 'Select Role'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {roleMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-2 z-50 animate-scale-in">
                <div className="px-3 py-1.5 border-b border-slate-800 mb-1 flex items-center justify-between text-slate-400 text-[11px]">
                  <span className="flex items-center gap-1 text-amber-400 font-semibold">
                    <Sparkles className="w-3 h-3" /> Quick Demo Role Switch
                  </span>
                  <span>2s Switch</span>
                </div>
                <div className="space-y-1">
                  {Object.entries(DEMO_USERS).map(([key, item]) => (
                    <button
                      key={key}
                      onClick={() => {
                        quickSwitchRole(key);
                        setRoleMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-start space-x-2.5 transition ${
                        user?.username === item.username
                          ? 'bg-slate-800 text-white font-medium border border-slate-700'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="mt-0.5">{getRoleIcon(item.role)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{item.label}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">{item.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="border-t border-slate-800 mt-2 pt-1">
                  <button
                    onClick={() => {
                      logout();
                      setRoleMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-950/30 flex items-center gap-2 transition"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Log Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
