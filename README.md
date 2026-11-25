# Pocket Ledger

## Order-to-Audit Manufacturing & GST ERP
### NIT Tiruchirappalli — Centre for Development of Industry (CDI) Assessment
**Prototype Implementation for Small-Scale Packaged Snacks Manufacturing (Karur, Tamil Nadu)**

---

## Demo Walkthrough Video

A complete 1080p browser walkthrough demonstrating all six personas, order-to-dispatch workflows, live GST calculations, two-step production execution, and auditor verification is available on YouTube:

- **Full Video Demonstration:** [https://youtu.be/Qo33yg0E5bE](https://youtu.be/Qo33yg0E5bE)

---

## 1. Executive Overview

Pocket Ledger is an auditable, commercial-grade Order-to-Audit ERP prototype engineered for small-scale packaged snack manufacturers in South India (e.g., traditional Murukku, Mixture, Banana Chips, and Thattai production units). 

The application resolves the core operational friction points of small manufacturing enterprises: manual paper registers, untracked dough-to-pouch production scrap, erroneous floating-point tax calculations, inventory drift, and complex multi-state GST compliance.

The user interface follows a clean, industrial design language inspired by Frappe Books, emphasizing high data density, clear contrast, and zero visual clutter. It features an instant role switcher across six personas and provides full bilingual support (English and Tamil / தமிழ்) tailored for shop-floor supervisors.

---

## 2. Core Architecture & Accounting Invariants

### 2.1 Technical Stack

- **Backend:** FastAPI, SQLAlchemy 2.0 (Declarative ORM), Pydantic v2, SQLite (`pocket_ledger.db`) with full PostgreSQL schema compatibility.
- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, Lucide icons.
- **Document & Reporting Engines:**
  - **PDF Generation:** ReportLab for statutory B2B GST tax invoices conforming to CBIC guidelines.
  - **Excel Generation:** OpenPyXL for auditor registers (GSTR-1, GSTR-3B, Stock Ledger, Sales Register, Purchase Register, Costing Sheets).

---

### 2.2 Core Financial & Inventory Safeguards

#### Integer-Paisa Monetary Arithmetic
Floating-point arithmetic in standard programming languages causes accumulated binary roundoff errors (for example, `0.1 + 0.2 != 0.3`). Pocket Ledger stores and calculates every monetary value—rates, unit prices, line subtotals, tax splits, invoice grand totals, customer payments, and outstanding balances—as signed 64-bit integers (`int`) representing **paisa** ($\text{₹}1.00 = 100 \text{ paisa}$). Rounding is performed exclusively at the final paisa boundary using standard half-up arithmetic, guaranteeing zero fractional drift across all transactions.

#### Immutable Append-Only Stock Ledger
The database schema contains no mutable `current_stock` column on item records. Current inventory balance is strictly derived in real-time by aggregating movements:
$$\text{Current Stock} = \sum \text{qty\_change}$$
Every inventory change creates an immutable transaction in `stock_ledger` recording quantity change, running weighted average cost, reference document ID, and movement type (`OPENING`, `PURCHASE`, `PROD_ISSUE`, `PROD_YIELD`, `PROD_SCRAP`, `SALE_DISPATCH`, `CREDIT_RETURN`). Negative inventory balance states are strictly rejected at the database transaction layer.

#### Place-of-Supply GST Engine
The manufacturing facility is registered in Karur, Tamil Nadu (`State Code: 33`, GSTIN: `33AAAAA0000A1Z5`). The tax engine dynamically resolves the Place of Supply:
- **Intra-State (Tamil Nadu):** 5% GST split equally into 2.5% CGST + 2.5% SGST.
- **Inter-State (Kerala, Karnataka, Andhra Pradesh, Telangana):** 5% IGST levied in full.
- **Export Under Bond / LUT:** Designated port dispatches (Chennai Seaport, Tuticorin Port) processed under Letter of Undertaking (0% LUT) with zero tax charge.

#### Two-Step Bill of Materials (BOM) & Unit Costing
Manufacturing is decoupled into two physical stages:
1. **Dough / Base Mixing:** Bulk raw material consumption (flour, edible oil, salt and spice blends) to produce bulk finished dough.
2. **Frying & Packaging:** Packaging material consumption (food-grade pouches, corrugated shipping cartons) to produce finished retail Stock Keeping Units (SKUs).

Batch costing absorbs direct material costs, packaging costs, direct labor, and factory overhead:
$$\text{Unit Cost per Packet} = \frac{\text{Direct Materials} + \text{Packaging} + \text{Direct Labour} + \text{Factory Overhead}}{\text{Actual Finished Packets Produced}}$$

#### Automatic >3% Yield Variance Audit Flagging
Any production run where raw material consumption or finished packet yield deviates by more than $3.0\%$ from the engineered standard recipe is automatically flagged as a high-priority variance in the database and surfaced to management and auditors.

---

## 3. Role-Based Workflows (6 Personas)

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

## 4. Quickstart & Automated Verification

### 4.1 Prerequisites
- Python 3.10 or higher
- Node.js 18 or higher (with npm)

---

### 4.2 Backend Setup

```bash
# 1. Install backend dependencies
pip install -r backend/requirements.txt

# 2. Reset database to clean opening benchmark state
python backend/reset_db.py

# 3. Start FastAPI server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

The FastAPI application will be accessible at:
- **API Root & Health:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive Swagger Documentation:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)

---

### 4.3 Frontend Setup

```bash
# 1. Navigate to frontend directory and install dependencies
cd frontend
npm install

# 2. Start Vite development server
npm run dev
```

The React single-page application will be accessible at:
- **Application Portal:** [http://127.0.0.1:5173](http://127.0.0.1:5173)

---

### 4.4 Single-Command Execution Alternatives

- **Windows Batch Script:**
  ```cmd
  run.bat
  ```
- **Linux / macOS Shell Script:**
  ```bash
  chmod +x run.sh
  ./run.sh
  ```
- **Docker Compose:**
  ```bash
  docker compose up --build
  ```

---

### 4.5 Automated Verification Suites

The repository includes four automated test suites validating the end-to-end accounting invariants, production workflows, and tax computations:

```bash
# Phase 1: Database models, units, schema validation, and seed verification
python backend/test_phase1.py

# Phase 2: Stock ledger transactions, BOM execution, and variance detection
python backend/test_phase2.py

# Phase 3: Complete 9-step Section 5 benchmark test
python backend/test_phase3.py

# Complete End-to-End Suite: Cross-role flow, inter-state taxes, and audit parity
python backend/verify_e2e_full.py

# Frontend TypeScript compilation and production build
cd frontend && npm run build
```

---

## 5. Section 5 Benchmark Results

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

---

## 6. Project Directory Structure

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

---

## 7. NIT Trichy CDI Deliverables Mapping

| Deliverable | Description | Location in Repository |
| :--- | :--- | :--- |
| **Deliverable 1** | **Working Prototype** | Full-stack application in [backend/](file:///D:/PROJECT/Pocket-Ledger/backend/) and [frontend/](file:///D:/PROJECT/Pocket-Ledger/frontend/), executable via `run.bat` or `run.sh`. |
| **Deliverable 2** | **System Documentation** | This [README.md](file:///D:/PROJECT/Pocket-Ledger/README.md) documenting architecture, role workflows, setup instructions, and benchmark verification. |
| **Deliverable 3** | **Technical Design Note** | Comprehensive design document in [DESIGN_NOTE.md](file:///D:/PROJECT/Pocket-Ledger/DESIGN_NOTE.md) and compiled [DESIGN_NOTE.pdf](file:///D:/PROJECT/Pocket-Ledger/DESIGN_NOTE.pdf). |
