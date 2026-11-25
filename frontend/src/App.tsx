/**
 * Pocket Ledger ERP - Commercial Enterprise ERP Root Layout
 * Features:
 * - Fixed left sidebar (240px, #1E293B dark slate) with categorized modules strictly per role
 * - Crisp #F8FAFC light-gray canvas with subtle 1px solid #E2E8F0 borders
 * - Top Action Header with section title, contextual emerald actions, EN|தமிழ் toggle & sync status
 * - Tabular numbers across all amounts, quantities and percentages
 * - Strict Footer: "Pocket Ledger • Batch Manufacturing & GST Ledger System"
 * - Zero assignment watermarks
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Toast } from './components/Toast';
import { LoginView } from './views/LoginView';
import { SalesmanPortal } from './views/SalesmanPortal';
import { ProductionPortal } from './views/ProductionPortal';
import { AdminPortal } from './views/AdminPortal';
import { AuditorPortal } from './views/AuditorPortal';
import { OwnerDashboard } from './views/OwnerDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const { user, language, isLoading, factoryDistrict } = useAuth();
  const [activeSection, setActiveSection] = useState<string>('production-batches');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Set default active section according to user's assigned role
  useEffect(() => {
    if (user) {
      switch (user.role) {
        case 'SALESMAN':
          setActiveSection('sales-entry');
          break;
        case 'PRODUCTION':
          setActiveSection('production-batches');
          break;
        case 'ADMIN':
          setActiveSection('admin-orders');
          break;
        case 'AUDITOR':
          setActiveSection('auditor-reports');
          break;
        case 'OWNER':
          setActiveSection('owner-dashboard');
          break;
        default:
          setActiveSection('production-batches');
      }
    }
  }, [user?.role]);

  // Calm Layout Skeleton to prevent white flash on refresh
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] flex font-sans antialiased text-[#111827]">
        <div className="w-60 bg-[#FAFAFB] fixed top-0 bottom-0 left-0 border-r border-[#E5E7EB] p-4 space-y-6 hidden md:block select-none">
          <div className="h-8 bg-slate-200 rounded-lg animate-pulse w-3/4"></div>
          <div className="space-y-3 pt-4">
            <div className="h-6 bg-slate-200/60 rounded-md animate-pulse"></div>
            <div className="h-6 bg-slate-200/60 rounded-md animate-pulse w-5/6"></div>
            <div className="h-6 bg-slate-200/60 rounded-md animate-pulse w-4/6"></div>
          </div>
        </div>
        <div className="flex-1 md:ml-60 flex flex-col min-h-screen">
          <div className="h-14 bg-white border-b border-[#E5E7EB] px-6 flex items-center justify-between">
            <div className="h-5 bg-gray-200 rounded w-48 animate-pulse"></div>
            <div className="h-8 bg-gray-200 rounded w-24 animate-pulse"></div>
          </div>
          <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-32 bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(16,24,40,0.04)] animate-pulse"></div>
              <div className="h-32 bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(16,24,40,0.04)] animate-pulse"></div>
              <div className="h-32 bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(16,24,40,0.04)] animate-pulse"></div>
            </div>
            <div className="h-80 bg-white rounded-xl border border-slate-200/90 shadow-[0_1px_3px_rgba(16,24,40,0.04)] animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  // Get current section title & subtitle
  const getSectionMetadata = () => {
    const isTa = language?.toUpperCase() === 'TA' || language?.toLowerCase() === 'ta';
    const isSalesmanB = user?.username === 'salesman_b' || user?.full_name?.includes('B') || user?.id === 2;
    const salesmanTerritory = isSalesmanB
      ? (isTa ? 'விற்பனையாளர் பி • வெளிமாநில & ஏற்றுமதி மண்டலம்' : 'Salesman B • Inter-State & Export Territory')
      : (isTa ? 'விற்பனையாளர் ஏ • தமிழ்நாடு உள்ளூர் மண்டலம்' : 'Salesman A • TN Local Territory');

    switch (activeSection) {
      case 'sales-entry':
        return {
          title: isTa ? 'புதிய விற்பனை ஆர்டர்' : 'New Sales Order',
          subtitle: salesmanTerritory,
        };
      case 'sales-orders':
        return {
          title: isTa ? 'விற்பனை ஆர்டர்கள்' : 'Orders',
          subtitle: salesmanTerritory,
        };
      case 'production-batches':
        return {
          title: isTa ? 'உற்பத்தி தொகுதிகள்' : 'Batches',
          subtitle: isTa ? 'தொகுதி உற்பத்தி & அடக்க விலை கணக்கீடு' : 'Batch manufacturing and unit costing',
        };
      case 'owner-batches':
        return {
          title: isTa ? 'உற்பத்தி தொகுதிகள்' : 'Batches',
          subtitle: isTa ? 'தொகுதி உற்பத்தி வரலாறு & அடக்க விலை மாறுபாடுகள்' : 'Production batch history & costing variances',
        };
      case 'production-bom':
        return {
          title: isTa ? 'செய்முறைகள்' : 'Recipes',
          subtitle: isTa ? 'தயாரிப்பு செய்முறைகள் & நேரடி அளவீட்டு முன்னோட்டம்' : 'Product formulas and live batch scaling',
        };
      case 'production-purchases':
        return {
          title: isTa ? 'மூலப்பொருள் கொள்முதல்' : 'Raw Material Purchases',
          subtitle: isTa ? 'சப்ளையர் பில்கள் & கொள்முதல் வரவு' : 'Inbound raw materials and supplier invoices',
        };
      case 'production-stock':
        return {
          title: isTa ? 'சரக்கு இருப்பு' : 'Inventory',
          subtitle: isTa ? 'மூலப்பொருட்கள், பேக்கிங் & முடிவுற்ற பொருட்கள் இருப்பு' : 'Current stock balances and reorder alerts',
        };
      case 'admin-orders':
        return {
          title: isTa ? 'ஆர்டர்கள்' : 'Orders',
          subtitle: isTa ? 'ஆர்டர் ஒப்புதல் & சரக்கு திட்டமிடல்' : 'Order approval and stock allocation',
        };
      case 'admin-invoices':
      case 'owner-invoices':
        return {
          title: isTa ? 'விலைப்பட்டியல்கள்' : 'Invoices',
          subtitle: isTa ? 'ஜிஎஸ்டி வரி விலைப்பட்டியல்கள் & சரக்கு அனுப்புதல்' : 'GST tax invoices and dispatch logs',
        };
      case 'admin-receivables':
      case 'owner-receivables':
        return {
          title: isTa ? 'நிலுவைத் தொகை' : 'Receivables',
          subtitle: isTa ? 'வாடிக்கையாளர் நிலுவை & வயது வகைப்பாடு' : 'Customer receivables & ageing breakdown',
        };
      case 'admin-masters':
        return {
          title: isTa ? 'பொருட்கள் & பார்ட்டிகள்' : 'Catalog & Parties',
          subtitle: isTa ? 'பொருட்கள் பட்டியல், HSN குறியீடுகள் & பார்ட்டி விவரங்கள்' : 'Master item catalog and party directory',
        };
      case 'auditor-reports':
      case 'owner-reports':
        return {
          title: isTa ? 'அறிக்கைகள்' : 'Reports',
          subtitle: isTa ? 'சட்டப்பூர்வ அறிக்கைகள் & எக்செல் ஏற்றுமதி' : 'Statutory compliance registers and Excel exports',
        };
      case 'auditor-integrity':
        return {
          title: isTa ? 'கணக்கு & இருப்பு சரிபார்ப்பு' : 'Account & Stock Verification',
          subtitle: isTa ? 'லெட்ஜர் மாறிலிகள் & பைசா சமநிலை சரிபார்ப்பு' : 'Automated ledger invariant and balance verification',
        };
      case 'owner-dashboard':
        return {
          title: isTa ? 'டாஷ்போர்டு' : 'Dashboard',
          subtitle: isTa ? 'தொழிற்சாலை நிதி மற்றும் உற்பத்தி சுருக்கம்' : 'Executive overview, inventory valuation, and margins',
        };
      default:
        return {
          title: 'Pocket Ledger',
          subtitle: 'Manufacturing & GST Operations',
        };
    }
  };

  const meta = getSectionMetadata();

  const renderActiveView = () => {
    // SALESMAN VIEWS
    if (activeSection === 'sales-entry') {
      return (
        <SalesmanPortal
          activeTab="entry"
          onTabChange={(tab) => setActiveSection(tab === 'entry' ? 'sales-entry' : 'sales-orders')}
        />
      );
    }
    if (activeSection === 'sales-orders') {
      return (
        <SalesmanPortal
          activeTab="orders"
          onTabChange={(tab) => setActiveSection(tab === 'entry' ? 'sales-entry' : 'sales-orders')}
        />
      );
    }

    // PRODUCTION VIEWS
    if (activeSection === 'production-batches') {
      return (
        <ProductionPortal
          activeTab="batches"
          onTabChange={(tab) => setActiveSection(`production-${tab}`)}
        />
      );
    }
    if (activeSection === 'owner-batches') {
      return (
        <OwnerDashboard
          activeTab="batches"
          onNavigate={(sec) => setActiveSection(sec)}
        />
      );
    }
    if (activeSection === 'production-bom') {
      return (
        <ProductionPortal
          activeTab="bom"
          onTabChange={(tab) => setActiveSection(`production-${tab}`)}
        />
      );
    }
    if (activeSection === 'production-purchases') {
      return (
        <ProductionPortal
          activeTab="purchases"
          onTabChange={(tab) => setActiveSection(`production-${tab}`)}
        />
      );
    }
    if (activeSection === 'production-stock') {
      return (
        <ProductionPortal
          activeTab="stock"
          onTabChange={(tab) => setActiveSection(`production-${tab}`)}
        />
      );
    }

    // ADMIN VIEWS
    if (activeSection === 'admin-orders') {
      return (
        <AdminPortal
          activeTab="orders"
          onTabChange={(tab) => setActiveSection(`admin-${tab}`)}
        />
      );
    }
    if (activeSection === 'admin-invoices') {
      return (
        <AdminPortal
          activeTab="invoices"
          onTabChange={(tab) => setActiveSection(`admin-${tab}`)}
        />
      );
    }
    if (activeSection === 'owner-invoices') {
      return (
        <OwnerDashboard
          activeTab="invoices"
          onNavigate={(sec) => setActiveSection(sec)}
        />
      );
    }
    if (activeSection === 'admin-receivables') {
      return (
        <AdminPortal
          activeTab="payments"
          onTabChange={(tab) => setActiveSection(`admin-${tab}`)}
        />
      );
    }
    if (activeSection === 'owner-receivables') {
      return (
        <OwnerDashboard
          activeTab="receivables"
          onNavigate={(sec) => setActiveSection(sec)}
        />
      );
    }
    if (activeSection === 'admin-masters') {
      return (
        <AdminPortal
          activeTab="masters"
          onTabChange={(tab) => setActiveSection(`admin-${tab}`)}
        />
      );
    }

    // AUDITOR VIEWS
    if (activeSection === 'auditor-reports' || activeSection === 'owner-reports') {
      return (
        <AuditorPortal
          activeTab="reports"
          onTabChange={(tab) => {
            if (user?.role === 'OWNER') {
              setActiveSection('owner-reports');
            } else {
              setActiveSection(`auditor-${tab}`);
            }
          }}
        />
      );
    }
    if (activeSection === 'auditor-integrity') {
      return (
        <AuditorPortal
          activeTab="integrity"
          onTabChange={(tab) => setActiveSection(`auditor-${tab}`)}
        />
      );
    }

    // OWNER DASHBOARD
    if (activeSection === 'owner-dashboard') {
      return <OwnerDashboard onNavigate={(sec) => setActiveSection(sec)} />;
    }

    // Fallbacks
    if (user?.role === 'SALESMAN') return <SalesmanPortal activeTab="entry" />;
    if (user?.role === 'PRODUCTION') return <ProductionPortal activeTab="batches" />;
    if (user?.role === 'ADMIN') return <AdminPortal activeTab="orders" />;
    if (user?.role === 'AUDITOR') return <AuditorPortal activeTab="reports" />;
    return <OwnerDashboard onNavigate={(sec) => setActiveSection(sec)} />;
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-[#111827] flex font-sans antialiased">
      {/* Fixed Left Sidebar (240px Desktop) */}
      <Sidebar
        activeSection={activeSection}
        onNavigate={(sec) => {
          setActiveSection(sec);
          setMobileMenuOpen(false);
        }}
      />

      {/* Main Content Area (Offset 240px on md screens) */}
      <div className="flex-1 flex flex-col md:ml-60 min-w-0 min-h-screen">
        {/* Top Action Header */}
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-7 max-w-7xl w-full mx-auto">
          <ErrorBoundary>
            {renderActiveView()}
          </ErrorBoundary>
        </main>

        {/* Strict Clean Enterprise Footer */}
        <footer className="border-t border-[#E5E7EB] bg-white py-3.5 px-6 text-center text-xs text-[#6B7280] font-medium">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <span className="font-heading font-medium text-[#374151]">Pocket Ledger • Manufacturing & GST Operations</span>
            <span className="font-mono text-[11px] text-[#9CA3AF]">
              Tamil Nadu Multi-District Operations &bull; {factoryDistrict} Factory Base
            </span>
          </div>
        </footer>
      </div>

      {/* Global Notifications */}
      <Toast />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
