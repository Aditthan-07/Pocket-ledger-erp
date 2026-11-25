"""
Pocket Ledger ERP - Database Clean Reset Script
NIT Tiruchirappalli CDI Winter Internship Specification

Purges all test transactions (orders, invoices, payments, production runs, stock movements)
and resets pocket_ledger.db to pure Section 5 opening balances:
- 0 Orders
- 0 Invoices
- 0 Payments
- 0 Production Runs
- Pure opening stock ledger entries (total valuation: ₹12,600.00)
"""

import sys
from pathlib import Path

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.seed import seed_database

if __name__ == "__main__":
    print("=======================================================")
    print("🚀 RESETTING POCKET LEDGER DATABASE TO CLEAN BENCHMARK")
    print("=======================================================")
    seed_database(verbose=True, clean_transactions=True)
    print(" [OK] Database reset complete: Exactly 0 orders and 0 invoices!")
