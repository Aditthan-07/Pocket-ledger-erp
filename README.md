# Pocket Ledger

**Auditable Order-to-Audit Manufacturing & GST ERP Prototype**  
Built for small-scale packaged snacks manufacturing (Karur, Tamil Nadu) — *NIT Tiruchirappalli Centre for Development of Industry (CDI) Assessment*

[![Python](https://img.shields.io/badge/Python-3.10+-1F2937?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-0F766E?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-1D4ED8?style=flat-square&logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-1E40AF?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite%20%2F%20PostgreSQL-Integer--Paisa-374151?style=flat-square)](https://www.sqlite.org/)

> 🎥 **Full 1080p Demo Walkthrough:** [Watch on YouTube](https://youtu.be/Qo33yg0E5bE)  
> 📄 **Architecture & Accounting Proof:** [DESIGN_NOTE.md](DESIGN_NOTE.md) · [DESIGN_NOTE.pdf](DESIGN_NOTE.pdf)

---

## ⚡ Overview

Pocket Ledger replaces fragmented paper registers in small packaged-snack units (`Murukku`, `Mixture`, `Banana Chips`, `Thattai`) with a single **Order-to-Audit loop**—eliminating untracked dough-to-pouch scrap, floating-point tax drift, and disconnected field-to-factory stock visibility.

```text
[Field Sales (A & B)] --> [Factory Admin] --> [Floor Supervisor] --> [Auditor & Owner]
 Offline/Online Order      Stock & Demand      2-Step BOM Batch       Real-Time Parity
 Place-of-Supply GST       GST Tax Invoice     >3% Yield Alert        GSTR-1/3B Exports
 Territory Isolation       Dispatch & e-Way    Immutable Ledger       Margin & Ageing
```

---

## 🏛️ Core Architecture & Accounting Safeguards

- **Integer-Paisa Monetary Arithmetic:** Every monetary amount (unit rates, tax splits, line totals, invoices, settlements) is stored and computed in signed 64-bit integer paisa ($\text{₹}1.00 = 100\text{ paisa}$) with strict half-up rounding only at the final paisa boundary, eliminating floating-point rounding drift.
- **Immutable Append-Only Stock Ledger:** No mutable `current_stock` column exists on items; inventory balance is derived on-the-fly ($\text{Current Stock} = \sum \Delta \text{Quantity}$) across immutable transaction records (`OPENING`, `PURCHASE`, `PROD_ISSUE`, `PROD_YIELD`, `PROD_SCRAP`, `SALE_DISPATCH`, `CREDIT_RETURN`), rejecting negative stock at the database level.
- **Place-of-Supply GST Engine (`State Code: 33`):** Dynamically applies `2.5% CGST + 2.5% SGST` for intra-state Tamil Nadu buyers, `5.0% IGST` for inter-state buyers (Kerala, Karnataka, AP, Telangana), and `0% LUT` for bonded port dispatches (Chennai Seaport, Tuticorin Port).
- **Two-Step BOM & `>3%` Variance Flagging:** Decouples dough mixing (raw ingredients to bulk dough) from frying/packaging (pouches & cartons to finished SKUs), absorbs materials, packaging, direct labour, and factory overhead into unit costing, and automatically raises audit flags whenever yield or ingredient consumption deviates by > 3.0% from the standard recipe.
- **Statutory Document Engines:** ReportLab generates CBIC-compliant B2B GST tax invoices (`INV/26-27/XXXX`) with HSN summaries and QR blocks, while OpenPyXL generates 6 real-time audit registers (GSTR-1, GSTR-3B, Sales, Purchases, Stock Ledger, Batch Costing).

---

## 👥 Role-Based Workflows (6 Personas)

Pocket Ledger provides role-based access control with distinct operational boundaries. Evaluators can switch between personas instantly using the top navigation bar switcher:

| Persona | Credentials | Operational Scope | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Salesman A** | `salesman_a` / `demo123` | Field Sales (Tamil Nadu Local Territory) | Mobile-first ordering PWA, dynamic party address auto-fill, offline order capture with local queue, live intra-state tax preview, approved order GST invoice PDF download. |
| **Salesman B** | `salesman_b` / `demo123` | Field Sales (Inter-State & Export Territory) | Dedicated territory order ledger (isolated from Salesman A), inter-state IGST calculation, export port destination routing (0% LUT), direct approved invoice PDF download. |
| **Factory Admin** | `admin` / `demo123` | Factory Operations & Desk Management | Order verification, stock shortage detection, demand-to-batch production planning, sequential GST tax invoicing (`INV/26-27/XXXX`), dispatch logging, e-Way bill capture, payment recording, customer ageing tracking. |
| **Floor Supervisor** | `supervisor` / `demo123` | Production Floor & Stock Intake | Bilingual English / தமிழ் (Tamil) interface, raw material purchase receipt at weighted average rate, 2-step BOM batch execution, packaging scrap logging, variance review. |
| **External Auditor** | `auditor` / `demo123` | Independent Statutory Audit | Read-only compliance portal, real-time double-entry parity audit (0 paisa drift, 100% integrity score), export of 6 statutory Excel/CSV registers (GSTR-1, GSTR-3B, Sales, Purchases, Stock, Batch Costing). |
| **Factory Owner** | `owner` / `demo123` | Executive Management & Strategy | Executive KPI dashboard, real-time gross margin analytics, stock valuation breakdown (raw materials vs packaging vs finished goods), customer ageing buckets (0-30d, 31-60d, 60+d), customer segment breakdown. |

---

## 🚀 Quickstart & Verification

### Prerequisites
- Python 3.10+ & Node.js 18+ (npm)

### Single-Command Launch
- **Windows:** `run.bat`
- **Linux / macOS:** `chmod +x run.sh && ./run.sh`
- **Docker Compose:** `docker compose up --build`

### Manual Setup
```bash
# Backend (FastAPI - http://127.0.0.1:8000)
pip install -r backend/requirements.txt
python backend/reset_db.py
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000

# Frontend (React 18 + Vite - http://127.0.0.1:5173)
cd frontend && npm install && npm run dev
```

### Automated Verification Suites
```bash
python backend/test_phase1.py        # Phase 1: Models & schema verification
python backend/test_phase2.py        # Phase 2: Stock ledger transactions & BOM variance
python backend/test_phase3.py        # Phase 3: Complete 9-step Section 5 benchmark test
python backend/verify_e2e_full.py    # E2E: Cross-role flows, inter-state taxes & audit parity
cd frontend && npm run build         # Frontend TypeScript compilation & production build
```

---

<details>
<summary><strong>📊 Expand Section 5 (9-Step) Verified Benchmark Results</strong></summary>

<br />

The system implements and verifies the complete 9-step benchmark scenario specified in the assessment requirements:

| Step | Benchmark Operation | Metric / Attribute | Specification Target | Verified Prototype Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **Step 1** | Inbound Purchase: 60 kg Flour @ ₹45.00 | Flour Stock & Rate | 160 kg @ ₹43.125/kg | 160.0000 kg @ ₹43.125/kg | Verified |
| **Step 2** | Murukku 1 Batch Production Run | Raw Materials Issued | Flour: 40 kg, Oil: 10.5 L, Spice: 1.2 kg | Flour: 40.0, Oil: 10.5, Spice: 1.2 | Verified |
| **Step 3** | Production Output & Packaging Scrap | Output & Scrap Counts | 188 Good Pkts, 6 Damaged, 9 Cartons | 188 Pkts, 6 Pouches, 9 Cartons | Verified |
| **Step 3** | Variance Alert Check | Yield & Oil Variance | Yield: -6.0% (Flagged), Oil: +5.0% (Flagged) | Yield: -6.0% (True), Oil: +5.0% (True) | Verified |
| **Closing** | Raw Flour Stock Balance | Raw Flour Inventory | 120.0 kg | 120.0000 kg | Verified |
| **Closing** | Cooking Oil Stock Balance | Oil Inventory | 19.5 L | 19.5000 L | Verified |
| **Closing** | Salt & Spice Mix Balance | Spice Mix Inventory | 3.8 kg | 3.8000 kg | Verified |
| **Closing** | 200g Pouch Packaging Balance | Pouch Inventory | 306 pcs (500 - 194) | 306.0000 pcs | Verified |
| **Closing** | 20-Pack Shipping Cartons Balance | Carton Inventory | 21 pcs (30 - 9) | 21.0000 pcs | Verified |
| **Closing** | Murukku 200g Finished Stock | Finished SKU Balance | 238 pkts (50 opening + 188 produced) | 238.0000 pkts | Verified |
| **Step 4** | Retailer A Order (150 pkts @ ₹50.00) | Available vs Requested | Available: 238 pkts, Requested: 150 pkts | Shortage: 0, Intra-State TN | Verified |
| **Step 5** | GST Tax Invoice & Dispatch | Tax Calculation | Taxable: ₹7,500, CGST: ₹187.50, SGST: ₹187.50 | Grand Total: ₹7,875.00 (787500 paisa) | Verified |
| **Step 5** | Finished Goods Post-Dispatch Stock | Murukku 200g Balance | 238 - 150 = 88 pkts | 88.0000 pkts | Verified |
| **Step 6** | Distributor B Order (120 pkts, KA) | Shortage & Demand Plan | Shortage: 32 pkts -> Recommend 1 Batch | Shortage: 32.0, Batches: 1, IGST | Verified |
| **Step 7** | Retailer A Payment (₹4,000.00) | Outstanding & Ageing | Outstanding: ₹3,875.00 in 0-30 Days | ₹3,875.00 (387500 paisa, 0-30d) | Verified |
| **Step 8** | Batch Overhead Allocation & Costing | Cost Per Packet | Materials: ₹4,055 + Labour ₹1,200 + Overheads ₹600 | ₹31.14 / pkt (3114 paisa), Margin: 37.72% | Verified |
| **Step 9** | Statutory Auditor Audit Check | Double-Entry Drift | Zero Paisa Drift across all transactions | 0 Paisa Drift, 100% Audit Score | Verified |

</details>

---

<details>
<summary><strong>📁 Expand Repository Directory Structure</strong></summary>

<br />

```text
Pocket-Ledger/
|-- backend/
|   |-- routers/
|   |   |-- __init__.py
|   |   |-- inventory_production.py    # Raw purchases, 2-step production, stock ledger
|   |   |-- reports_dashboard.py       # Owner KPIs, auditor parity check, Excel exports
|   |   |-- sales_billing.py           # Orders, invoices, dispatches, payments, PDF downloads
|   |-- services/
|   |   |-- __init__.py
|   |   |-- gst_service.py             # Place-of-supply resolution, integer tax math
|   |   |-- ledger_service.py          # Append-only stock ledger, FIFO/WAR valuation
|   |   |-- pdf_report_service.py      # ReportLab statutory GST invoice generator
|   |   |-- production_service.py      # BOM scaling, scrap deduction, variance detection
|   |   |-- sales_service.py           # Sequential numbering, dispatch, settlement
|   |-- database.py                    # SQLAlchemy engine and session dependency
|   |-- main.py                        # FastAPI application entrypoint and middleware
|   |-- models.py                      # Relational ORM models with integer-paisa fields
|   |-- requirements.txt               # Backend dependencies
|   |-- reset_db.py                    # Database wipe and opening balance reset utility
|   |-- schemas.py                     # Pydantic v2 validation schemas
|   |-- seed.py                        # Master data and opening balance seed script
|   |-- test_phase1.py                 # Core schema and master data unit test
|   |-- test_phase2.py                 # Inventory and production workflow test
|   |-- test_phase3.py                 # 9-step Section 5 benchmark test
|   |-- units.py                       # Decimal unit conversion and formatting helpers
|   |-- verify_e2e_full.py             # Full end-to-end integration and role audit test
|-- frontend/
|   |-- src/
|   |   |-- api/
|   |   |   |-- client.ts              # Axios API client and typed endpoint methods
|   |   |-- components/
|   |   |   |-- ErrorBoundary.tsx      # React error boundary
|   |   |   |-- Header.tsx             # Top bar with role switcher and offline indicator
|   |   |   |-- Logo.tsx               # Pocket Ledger branding component
|   |   |   |-- Navbar.tsx             # Navigation bar component
|   |   |   |-- SalesmanPortal.tsx     # Re-export component wrapper
|   |   |   |-- Sidebar.tsx            # Industrial sidebar navigation
|   |   |   |-- Toast.tsx              # Notification toast component
|   |   |-- constants/
|   |   |   |-- destinations.ts        # Dynamic delivery and export port definitions
|   |   |   |-- districts.ts           # South Indian districts reference
|   |   |-- context/
|   |   |   |-- AuthContext.tsx        # Authentication and active role state provider
|   |   |-- services/
|   |   |   |-- offlineQueue.ts        # LocalStorage offline order sync service
|   |   |-- types/
|   |   |   |-- index.ts               # Shared TypeScript domain interfaces
|   |   |-- views/
|   |   |   |-- AdminPortal.tsx        # Factory admin portal (orders, invoices, ageing)
|   |   |   |-- AuditorPortal.tsx      # External auditor portal (parity, reports)
|   |   |   |-- LoginView.tsx          # Authentication screen
|   |   |   |-- OwnerDashboard.tsx     # Executive metrics and stock valuation
|   |   |   |-- ProductionPortal.tsx   # Bilingual Tamil/English floor supervisor portal
|   |   |   |-- SalesmanPortal.tsx     # Salesman A/B portal with offline capture
|   |   |-- App.tsx                    # Root application component and view routing
|   |   |-- index.css                  # Tailwind styles and custom industrial utilities
|   |   |-- main.tsx                   # React DOM entrypoint
|   |-- index.html                     # HTML document shell
|   |-- package.json                   # Frontend dependencies and scripts
|   |-- tailwind.config.js             # Tailwind CSS configuration
|   |-- tsconfig.json                  # TypeScript compiler configuration
|   |-- vite.config.ts                 # Vite build and proxy configuration
|-- .gitignore                         # Git exclusion rules
|-- DESIGN_NOTE.md                     # Technical architecture and accounting design note
|-- DESIGN_NOTE.pdf                    # Compiled PDF version of design note
|-- docker-compose.yml                 # Multi-container orchestration definition
|-- Dockerfile                         # Production container image definition
|-- README.md                          # System documentation
|-- requirements.txt                   # Root Python dependencies
|-- run.bat                            # Windows startup script
|-- run.sh                             # Linux/macOS startup script
```

</details>

---

## 🎯 NIT Trichy CDI Deliverables Mapping

| Deliverable | Description | Location in Repository |
| :--- | :--- | :--- |
| **Deliverable 1** | **Working Prototype** | Full-stack application in [backend/](backend/) and [frontend/](frontend/), executable via `run.bat` or `run.sh`. |
| **Deliverable 2** | **System Documentation** | This [README.md](README.md) documenting architecture, role workflows, setup instructions, and benchmark verification. |
| **Deliverable 3** | **Technical Design Note** | Comprehensive design document in [DESIGN_NOTE.md](DESIGN_NOTE.md) and compiled [DESIGN_NOTE.pdf](DESIGN_NOTE.pdf). |
| **Deliverable 4** | **Walkthrough Video** | Full 1080p demonstration across all 6 personas on [YouTube](https://youtu.be/Qo33yg0E5bE). |
