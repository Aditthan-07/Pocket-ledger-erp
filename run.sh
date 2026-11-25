#!/usr/bin/env bash
# ======================================================================
#    POCKET LEDGER ERP - SINGLE-COMMAND LAUNCHER (Linux / macOS)
#    NIT Tiruchirappalli CDI Winter Internship Specification
# ======================================================================

set -e

echo "======================================================================"
echo "   POCKET LEDGER ERP - SINGLE-COMMAND SYSTEM LAUNCHER"
echo "   NIT Tiruchirappalli CDI Winter Internship Specification"
echo "======================================================================"
echo ""

# 1. Verify Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python 3.11+ is required but was not found."
    exit 1
fi

echo "[1/4] Checking Python dependencies..."
python3 -m pip install -q -r requirements.txt || true

echo "[2/4] Initializing Database & Idempotent Master Data Seed..."
python3 backend/seed.py

echo "[3/4] Checking Frontend Production Build..."
if [ ! -f "frontend/dist/index.html" ]; then
    echo "[INFO] frontend/dist not found. Compiling React Vite bundle..."
    if command -v npm &> /dev/null; then
        (cd frontend && npm install --silent && npm run build)
    else
        echo "[WARNING] npm not found. Evaluators can access API directly."
    fi
else
    echo "[OK] Pre-compiled React production bundle found in frontend/dist!"
fi

echo ""
echo "======================================================================"
echo "   POCKET LEDGER ERP READY TO SERVE!"
echo "======================================================================"
echo "   [1] Complete ERP Application : http://localhost:8000"
echo "   [2] Interactive Swagger Docs : http://localhost:8000/docs"
echo "   [3] React Dev Server (Opt.)  : http://localhost:5173"
echo ""
echo "   DEMO CREDENTIALS (password: demo123 for all):"
echo "   - salesman_a  : Field Sales Rep (Mobile Offline PWA)"
echo "   - admin       : Factory Admin (Orders, GST Invoicing, Dispatch)"
echo "   - supervisor  : Floor Supervisor (Bilingual EN|Tamil Production)"
echo "   - auditor     : External Auditor (Read-Only Ledger & Reports)"
echo "   - owner       : Factory Owner (KPIs, Valuation & Margins)"
echo "======================================================================"
echo ""
echo "Starting FastAPI server on http://localhost:8000..."
exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
