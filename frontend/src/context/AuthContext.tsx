/**
 * Pocket Ledger ERP - Authentication & Role Context
 * Provides quick 2-second role switching and bilingual EN|தமிழ் preferences.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  language: 'EN' | 'TA';
  login: (username: string, password?: string) => Promise<void>;
  logout: () => void;
  quickSwitchRole: (role: UserRole | string) => Promise<void>;
  toggleLanguage: () => void;
  isLoading: boolean;
  factoryDistrict: string;
  setFactoryDistrict: (district: string) => void;
  updateFactoryHub: (district: string) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'pocket_ledger_active_user';
const LANG_STORAGE_KEY = 'pocket_ledger_lang';

// Pre-configured seeded user mappings for instant demo switching
export const DEMO_USERS: Record<string, { username: string; label: string; role: UserRole; desc: string }> = {
  salesman_a: { username: 'salesman_a', label: 'Salesman A', role: 'SALESMAN', desc: 'Field Sales' },
  salesman_b: { username: 'salesman_b', label: 'Salesman B', role: 'SALESMAN', desc: 'Regional Sales' },
  admin: { username: 'admin', label: 'Factory Admin', role: 'ADMIN', desc: 'Operations & Invoicing' },
  supervisor: { username: 'supervisor', label: 'Floor Supervisor', role: 'PRODUCTION', desc: 'Production & Recipes' },
  auditor: { username: 'auditor', label: 'External Auditor', role: 'AUDITOR', desc: 'Audit & Compliance' },
  owner: { username: 'owner', label: 'Factory Owner', role: 'OWNER', desc: 'Executive Management' },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [language, setLanguage] = useState<'EN' | 'TA'>('EN');
  const [isLoading, setIsLoading] = useState(true);
  const [factoryDistrict, setFactoryDistrict] = useState<string>('Karur');

  useEffect(() => {
    // Restore saved language
    const savedLang = localStorage.getItem(LANG_STORAGE_KEY);
    if (savedLang?.toUpperCase() === 'TA') {
      setLanguage('TA');
    } else if (savedLang?.toUpperCase() === 'EN') {
      setLanguage('EN');
    }

    // Load active factory config
    api.getFactoryConfig()
      .then((cfg) => {
        if (cfg?.factory_district) {
          setFactoryDistrict(cfg.factory_district);
        }
      })
      .catch(() => {
        // Fallback to Karur
      });

    // Restore saved user or default to admin for instant access
    const savedUser = localStorage.getItem(USER_STORAGE_KEY);
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        // Ignore
      }
    } else {
      // Default initial login for smooth presentation
      setUser({
        id: 3,
        username: 'admin',
        full_name: 'Factory Admin',
        role: 'ADMIN',
        is_active: true,
      });
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string = 'demo123') => {
    setIsLoading(true);
    try {
      const u = await api.login(username, password);
      setUser(u);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(u));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY);
  };

  const quickSwitchRole = async (target: UserRole | string) => {
    let targetUsername = 'admin';

    // If target is already a demo user key
    if (DEMO_USERS[target]) {
      targetUsername = target;
    } else {
      // Map role to primary username
      switch (target) {
        case 'SALESMAN':
          targetUsername = 'salesman_a';
          break;
        case 'PRODUCTION':
          targetUsername = 'supervisor';
          break;
        case 'ADMIN':
          targetUsername = 'admin';
          break;
        case 'AUDITOR':
          targetUsername = 'auditor';
          break;
        case 'OWNER':
          targetUsername = 'owner';
          break;
      }
    }

    await login(targetUsername, 'demo123');
  };

  const toggleLanguage = () => {
    const nextLang = language === 'EN' ? 'TA' : 'EN';
    setLanguage(nextLang);
    localStorage.setItem(LANG_STORAGE_KEY, nextLang);
  };

  const updateFactoryHub = async (district: string) => {
    const res = await api.updateFactoryDistrict(district);
    if (res?.factory_district) {
      setFactoryDistrict(res.factory_district);
    }
    return res;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        language,
        login,
        logout,
        quickSwitchRole,
        toggleLanguage,
        isLoading,
        factoryDistrict,
        setFactoryDistrict,
        updateFactoryHub,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
