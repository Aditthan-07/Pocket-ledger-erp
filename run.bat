@echo off
setlocal enabledelayedexpansion

echo ======================================================================
echo    POCKET LEDGER ERP - SINGLE-COMMAND SYSTEM LAUNCHER
echo    NIT Tiruchirappalli CDI Winter Internship Specification
echo ======================================================================
echo.

:: 1. Verify Python Installation
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python 3.11+ is required but was not found in PATH.
    echo Please install Python and add it to your system PATH.
    pause
    exit /b 1
)

echo [1/4] Checking Python dependencies...
python -m pip install -q -r requirements.txt
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Encountered non-fatal issue during pip install. Proceeding...
)

echo [2/4] Initializing Database and Idempotent Master Data Seed...
python backend/seed.py
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Seed script failed!
    pause
    exit /b 1
)

echo [3/4] Checking Frontend Production Build...
if not exist "frontend\dist\index.html" (
    echo [INFO] frontend\dist not found. Compiling React Vite bundle...
    where npm >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        cd frontend
        call npm install --silent
        call npm run build
        cd ..
    ) else (
        echo [WARNING] Node.js/npm not found. Evaluators can run the backend API directly.
    )
) else (
    echo [OK] Pre-compiled React production bundle found in frontend\dist!
)

echo.
echo ======================================================================
echo    POCKET LEDGER ERP READY TO SERVE!
echo ======================================================================
echo    [1] Complete ERP Application : http://localhost:8000
echo    [2] Interactive Swagger Docs : http://localhost:8000/docs
echo    [3] React Dev Server (Opt.)  : http://localhost:5173 (run 'npm run dev' in /frontend)
echo.
echo    DEMO CREDENTIALS (password: demo123 for all):
echo    - salesman_a  : Field Sales Rep (Mobile Offline PWA)
echo    - admin       : Factory Admin (Orders, GST Invoicing, Dispatch)
echo    - supervisor  : Floor Supervisor (Bilingual EN|Tamil Production)
echo    - auditor     : External Auditor (Read-Only Ledger & Reports)
echo    - owner       : Factory Owner (KPIs, Valuation & Margins)
echo ======================================================================
echo.
echo Starting FastAPI application server on http://localhost:8000...
echo Press Ctrl+C to stop.
echo.

python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
