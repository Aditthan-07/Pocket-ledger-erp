/**
 * Pocket Ledger ERP - Commercial ERP Login Screen
 * Features:
 * - Crisp light-mode visual design with subtle borders
 * - 1-Click Quick Demo Login cards for all 6 enterprise roles
 * - Zero assignment watermarks
 */

import React, { useState } from 'react';
import {
  Shield,
  Factory,
  UserCheck,
  FileCheck2,
  TrendingUp,
  ArrowRight,
  Lock,
} from 'lucide-react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { Logo } from '../components/Logo';

export const LoginView: React.FC = () => {
  const { login, quickSwitchRole, isLoading } = useAuth();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('demo123');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    }
  };

  const getCardIcon = (role: string) => {
    switch (role) {
      case 'SALESMAN':
        return <UserCheck className="w-5 h-5 text-sky-600" />;
      case 'PRODUCTION':
        return <Factory className="w-5 h-5 text-emerald-600" />;
      case 'ADMIN':
        return <Shield className="w-5 h-5 text-indigo-600" />;
      case 'AUDITOR':
        return <FileCheck2 className="w-5 h-5 text-teal-600" />;
      case 'OWNER':
        return <TrendingUp className="w-5 h-5 text-amber-600" />;
      default:
        return <UserCheck className="w-5 h-5 text-slate-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-gray-900 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-4xl w-full mx-auto space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-2 flex flex-col items-center">
          <Logo size={48} className="mb-1" />
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Pocket Ledger
          </h1>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Manufacturing & GST Operations
          </p>
        </div>

        {/* 1-Click Demo Login Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500 px-1">
            <span className="font-semibold text-gray-700 tracking-wider uppercase text-[11px]">
              Select Demo Account
            </span>
            <span className="font-mono text-gray-500">
              Password: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-700 font-medium">demo123</code>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {Object.entries(DEMO_USERS).map(([key, item]) => (
              <button
                key={key}
                type="button"
                onClick={() => quickSwitchRole(key)}
                className="bg-white hover:bg-gray-50 border border-gray-200 hover:border-emerald-300 p-4 rounded-xl text-left transition-all duration-150 group flex flex-col justify-between shadow-xs hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                      {getCardIcon(item.role)}
                    </div>
                    <span className="text-[10px] font-mono font-medium uppercase px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {item.role}
                    </span>
                  </div>
                  <h3 className="font-semibold text-sm text-gray-900 group-hover:text-emerald-700 transition">
                    {item.label}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                <div className="mt-4 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-emerald-700 font-medium">
                  <span>Sign in as {item.username}</span>
                  <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Manual Credentials Fallback */}
        <div className="max-w-md mx-auto bg-white border border-gray-200 p-6 rounded-xl shadow-xs">
          <h2 className="text-sm font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-400" /> Sign In
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-emerald-600 focus:bg-white"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition shadow-xs disabled:opacity-50"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* Clean Footer */}
        <div className="text-center text-xs text-gray-400 font-medium">
          Pocket Ledger • Manufacturing & GST Operations
        </div>
      </div>
    </div>
  );
};
