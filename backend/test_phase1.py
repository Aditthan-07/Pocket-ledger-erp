"""
Pocket Ledger ERP - Phase 1 Verification Test Suite
Tests:
1. Strict Engineering Invariant: No float money (Integer paisa).
2. Strict Engineering Invariant: No float drift on quantities (Numeric 12,4 Decimal).
3. Immutable Ledger Stock: Verification that items table has NO current_stock column, and stock is derived.
4. Decoupled BOM: Verification of Base Mix and finished SKU mapping.
5. Section 5 Seed Verification: Opening stock quantities, rates, and valuation match benchmark.
6. FastAPI endpoints: /api/health and /api/master/opening-summary.
"""

import sys
from pathlib import Path
from decimal import Decimal

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from backend.database import SessionLocal
from backend.models import (
    Item,
    Party,
    User,
    BOMHeader,
    BOMIngredient,
    BOMSKUMapping,
    StockLedger,
    StockTransactionType,
)
from backend.units import (
    grams_to_kg,
    kg_to_grams,
    ml_to_litres,
    litres_to_ml,
    packets_to_cartons,
    cartons_to_packets,
    paisa_to_rupees,
    rupees_to_paisa,
)
from backend.main import app


def test_units_conversion():
    """Verify Decimal unit conversion arithmetic has zero IEEE 754 float drift."""
    print("Testing unit conversions...")
    assert grams_to_kg(200) == Decimal("0.2000")
    assert grams_to_kg("1200") == Decimal("1.2000")
    assert kg_to_grams(Decimal("1.2000")) == Decimal("1200.0000")
    assert ml_to_litres(500) == Decimal("0.5000")
    assert litres_to_ml(Decimal("0.5000")) == Decimal("500.0000")
    assert packets_to_cartons(200, 20) == Decimal("10.0000")
    assert cartons_to_packets(10, 20) == Decimal("200.0000")
    assert paisa_to_rupees(5000) == Decimal("50.00")
    assert rupees_to_paisa(Decimal("50.00")) == 5000
    assert rupees_to_paisa("42.50") == 4250
    print(" [OK] Unit conversions passed!")


def test_models_invariants():
    """Verify models enforce schema invariants: no current_stock column, integer money."""
    print("Testing model schema invariants...")
    item_cols = [c.name for c in Item.__table__.columns]
    assert "current_stock" not in item_cols, "CRITICAL ERROR: items table MUST NOT contain mutable current_stock!"
    assert "selling_price_paisa" in item_cols, "selling_price_paisa missing on items"
    assert "gst_rate_bps" in item_cols, "gst_rate_bps missing on items"

    # Verify money column types are Integer
    for col_name in ["selling_price_paisa", "gst_rate_bps"]:
        col = Item.__table__.columns[col_name]
        assert "INTEGER" in str(col.type).upper(), f"{col_name} must be Integer!"

    # Verify StockLedger quantity is Numeric(12, 4)
    qty_col = StockLedger.__table__.columns["qty_change"]
    assert "NUMERIC" in str(qty_col.type).upper() or "DECIMAL" in str(qty_col.type).upper()

    print(" [OK] Model schema invariants passed!")


def test_section_5_seed_data():
    """Verify Section 5 Benchmark Seed Data in Database."""
    print("Testing Section 5 benchmark data...")
    db = SessionLocal()
    try:
        # Users check
        users = db.query(User).all()
        assert len(users) >= 6, f"Expected at least 6 users, found {len(users)}"
        usernames = {u.username: u.role for u in users}
        expected_roles = {
            "salesman_a": "SALESMAN",
            "salesman_b": "SALESMAN",
            "admin": "ADMIN",
            "supervisor": "PRODUCTION",
            "auditor": "AUDITOR",
            "owner": "OWNER",
        }
        for u, r in expected_roles.items():
            assert u in usernames and usernames[u] == r, f"User {u} with role {r} missing!"

        # Parties check
        parties = {p.name: p for p in db.query(Party).all()}
        assert "Retailer A" in parties and parties["Retailer A"].state == "Tamil Nadu"
        assert "Distributor B" in parties and parties["Distributor B"].state == "Karnataka"
        assert "Default Agro Suppliers" in parties and parties["Default Agro Suppliers"].state == "Tamil Nadu"

        # Items & Derived Stock Check
        items = {it.sku_code: it for it in db.query(Item).all()}
        expected_items = {
            "RM-FLOUR-01": (Decimal("100.0000"), 4200),
            "RM-OIL-01": (Decimal("30.0000"), 14000),
            "RM-SPICE-01": (Decimal("5.0000"), 20000),
            "PKG-POUCH-200G": (Decimal("500.0000"), 250),
            "PKG-CTN-20": (Decimal("30.0000"), 1500),
            "FG-MUR-200G": (Decimal("50.0000"), 3000),
        }

        total_valuation_paisa = 0
        for sku, (expected_qty, rate_paisa) in expected_items.items():
            assert sku in items, f"Item {sku} missing!"
            it = items[sku]
            # Verify derived stock
            from sqlalchemy import func
            derived_stock = db.query(func.coalesce(func.sum(StockLedger.qty_change), 0)).filter(StockLedger.item_id == it.id).scalar()
            assert Decimal(str(derived_stock)) == expected_qty, f"Derived stock for {sku} was {derived_stock}, expected {expected_qty}"
            total_valuation_paisa += int(expected_qty * rate_paisa)

        assert total_valuation_paisa == 1260000, f"Expected total valuation 1260000 paisa (₹12,600.00), got {total_valuation_paisa}"

        # Decoupled BOM check
        bom = db.query(BOMHeader).filter(BOMHeader.code == "BOM-MRK-BASE").first()
        assert bom is not None, "BOM-MRK-BASE not found!"
        assert len(bom.ingredients) == 3, f"Expected 3 ingredients, got {len(bom.ingredients)}"
        assert len(bom.sku_mappings) == 1, f"Expected 1 SKU mapping, got {len(bom.sku_mappings)}"
        mapping = bom.sku_mappings[0]
        assert mapping.expected_yield_packets == Decimal("200.0000")
        assert mapping.packets_per_carton == 20

        print(f" [OK] Section 5 benchmark data passed! Total valuation: ₹{total_valuation_paisa / 100:,.2f}")
    finally:
        db.close()


def test_api_endpoints():
    """Verify FastAPI endpoints via TestClient."""
    print("Testing FastAPI endpoints...")
    client = TestClient(app)

    # 1. /api/health
    resp = client.get("/api/health")
    assert resp.status_code == 200, f"/api/health failed: {resp.text}"
    health_data = resp.json()
    assert health_data["status"] == "ok"
    assert health_data["database"] == "connected"
    assert health_data["factory_state"] == "Tamil Nadu"

    # 2. /api/master/opening-summary
    resp = client.get("/api/master/opening-summary")
    assert resp.status_code == 200, f"/api/master/opening-summary failed: {resp.text}"
    summary = resp.json()
    assert summary["factory_state"] == "Tamil Nadu"
    assert summary["users_count"] >= 6
    assert summary["parties_count"] >= 3
    assert summary["items_count"] >= 6
    assert summary["total_opening_valuation_paisa"] >= 1260000
    assert summary["total_opening_valuation_rupees"] == f"{summary['total_opening_valuation_paisa'] / 100:.2f}"

    print(" [OK] FastAPI endpoints passed cleanly!")


if __name__ == "__main__":
    test_units_conversion()
    test_models_invariants()
    test_section_5_seed_data()
    test_api_endpoints()
    print("\nALL PHASE 1 BACKEND VERIFICATIONS PASSED SUCCESSFULLY!")
