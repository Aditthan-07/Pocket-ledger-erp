"""
Pocket Ledger ERP - Phase 2 Automated Benchmark Verification Test Suite
NIT Tiruchirappalli CDI Winter Internship Specification

Executes Section 5 Benchmark Steps 1, 2, 3, and 8 in an isolated test database
so that production pocket_ledger.db remains clean at its opening state.

Asserts Exact Benchmark Matches:
- Step 1: Purchase 60 kg Flour @ ₹45/kg -> Weighted average Flour rate = ₹43.125/kg (4312.5 paisa).
- Step 2 & 3: Run 1 batch Murukku 200g (40kg Flour, 10.5L Oil, 1.2kg Spice).
  Output: 188 good packets, 6 damaged pouches, 9 cartons used.
- Exact Closing Balances:
  * Flour: 120.0000 kg
  * Oil: 19.5000 L
  * Salt/Spice: 3.8000 kg
  * 200g Pouches: 306 pcs (500 - 188 - 6)
  * Cartons: 21 pcs (30 - 9)
  * Finished Murukku 200g: 238 packets (50 + 188)
- 3% Tolerance Rule Variance Alerts:
  * Yield variance = -6.00% (Flagged)
  * Oil consumption variance = +5.00% (Flagged)
  * Flour consumption variance = 0.00% (Not Flagged)
- Step 8 Costing Engine & Overhead Allocation:
  * ₹1,200 Labour + ₹600 Gas/Power Overheads
  * Material & Packaging Cost = ₹4,055.00 (1725 + 1470 + 240 + 485 + 135)
  * Total Batch Cost = ₹5,855.00 (585500 paisa)
  * Cost per packet = ₹31.14 (3114 paisa)
- Decoupled BOM verification (adding Murukku 500g SKU with zero code changes).
- Negative stock protection invariant.
- FastAPI Phase 2 router endpoints via TestClient.
"""

import sys
from pathlib import Path
from decimal import Decimal
import tempfile
import os

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from backend.database import Base, get_db
from backend.models import (
    User,
    Party,
    Item,
    BOMHeader,
    StockLedger,
    StockTransactionType,
    ProductionRun,
)
from backend.services.ledger_service import (
    get_item_balance,
    get_weighted_average_rate_paisa,
    record_stock_movement,
    get_all_stock_balances,
)
from backend.services.production_service import (
    create_purchase,
    preview_production_run,
    execute_production_run,
    update_production_overheads,
    create_bom_sku_mapping,
)
from backend.main import app


def setup_isolated_test_db():
    """Create an isolated temporary SQLite database seeded with Section 5 opening data."""
    temp_db_fd, temp_db_path = tempfile.mkstemp(suffix="_test_pocket_ledger.db")
    os.close(temp_db_fd)

    test_engine = create_engine(
        f"sqlite:///{temp_db_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )

    @event.listens_for(test_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    # Seed master data into test db
    from backend.seed import (
        hash_password,
        UserRole,
        PartyType,
        ItemCategory,
        BOMIngredient,
        BOMSKUMapping,
        AuditLog,
    )

    db = TestingSessionLocal()
    try:
        # Seed Users
        users_data = [
            ("salesman_a", "Salesman A", UserRole.SALESMAN.value),
            ("salesman_b", "Salesman B", UserRole.SALESMAN.value),
            ("admin", "Factory Admin", UserRole.ADMIN.value),
            ("supervisor", "Production Floor Supervisor", UserRole.PRODUCTION.value),
            ("auditor", "External Auditor", UserRole.AUDITOR.value),
            ("owner", "Factory Owner", UserRole.OWNER.value),
        ]
        seeded_users = {}
        for username, full_name, role in users_data:
            user = User(
                username=username,
                full_name=full_name,
                password_hash=hash_password("demo123"),
                role=role,
                is_active=True,
            )
            db.add(user)
            db.flush()
            seeded_users[username] = user

        admin_id = seeded_users["admin"].id

        # Seed Parties
        parties_data = [
            ("Retailer A", PartyType.RETAILER.value, "33AABCR1234A1Z5", "Tamil Nadu"),
            ("Distributor B", PartyType.DISTRIBUTOR.value, "29AABCD5678B1Z9", "Karnataka"),
            ("Default Agro Suppliers", PartyType.SUPPLIER.value, "33AABCS9999C1Z1", "Tamil Nadu"),
        ]
        seeded_parties = {}
        for name, ptype, gstin, state in parties_data:
            party = Party(name=name, party_type=ptype, gstin=gstin, state=state)
            db.add(party)
            db.flush()
            seeded_parties[name] = party

        # Seed Items & Opening Stock
        items_data = [
            ("RM-FLOUR-01", "Flour", "அரிசி மாவு", ItemCategory.RAW_MATERIAL.value, "kg", Decimal("30"), Decimal("100"), 4200),
            ("RM-OIL-01", "Cooking Oil", "சமையல் எண்ணெய்", ItemCategory.RAW_MATERIAL.value, "litre", Decimal("10"), Decimal("30"), 14000),
            ("RM-SPICE-01", "Salt and Spice Mix", "உப்பு மற்றும் மசாலா கலவை", ItemCategory.RAW_MATERIAL.value, "kg", Decimal("2"), Decimal("5"), 20000),
            ("PKG-POUCH-200G", "200g Pouch", "200கி பை", ItemCategory.PACKAGING.value, "piece", Decimal("100"), Decimal("500"), 250),
            ("PKG-CTN-20", "Carton (20-pack)", "அட்டைப்பெட்டி (20 பாக்கெட்)", ItemCategory.PACKAGING.value, "piece", Decimal("10"), Decimal("30"), 1500),
            ("FG-MUR-200G", "Murukku 200g", "முறுக்கு 200கி", ItemCategory.FINISHED_GOOD.value, "packet", Decimal("20"), Decimal("50"), 3000),
        ]
        seeded_items = {}
        for sku, name, name_ta, cat, unit, reorder, open_qty, rate in items_data:
            item = Item(
                sku_code=sku,
                name=name,
                name_ta=name_ta,
                category=cat,
                base_unit=unit,
                pack_weight_grams=Decimal("200") if "MUR" in sku else None,
                carton_capacity=20 if "MUR" in sku else None,
                gst_rate_bps=500,
                selling_price_paisa=5000 if "MUR" in sku else 0,
                reorder_level=reorder,
            )
            db.add(item)
            db.flush()
            seeded_items[sku] = item

            # Seed Opening stock
            stock = StockLedger(
                item_id=item.id,
                transaction_type=StockTransactionType.OPENING.value,
                qty_change=open_qty,
                unit_rate_paisa=rate,
                reference_type="OPENING_BALANCE",
                reference_id=None,
                notes="Benchmark Opening Balance",
                created_by=admin_id,
            )
            db.add(stock)

        # Seed Base BOM & SKU Mapping
        bom = BOMHeader(
            code="BOM-MRK-BASE",
            name="Murukku Base Mix - 40kg flour batch",
            name_ta="முறுக்கு மாவு அடிப்படை கலவை - 40கிலோ தொகுதி",
            version=1,
            is_active=True,
        )
        db.add(bom)
        db.flush()

        ingredients = [
            (seeded_items["RM-FLOUR-01"].id, Decimal("40.0000"), "kg"),
            (seeded_items["RM-OIL-01"].id, Decimal("10.0000"), "litre"),
            (seeded_items["RM-SPICE-01"].id, Decimal("1.2000"), "kg"),
        ]
        for raw_id, sqty, unit in ingredients:
            db.add(BOMIngredient(bom_id=bom.id, raw_item_id=raw_id, standard_qty=sqty, unit=unit))

        mapping = BOMSKUMapping(
            bom_id=bom.id,
            finished_item_id=seeded_items["FG-MUR-200G"].id,
            expected_yield_packets=Decimal("200.0000"),
            pouch_item_id=seeded_items["PKG-POUCH-200G"].id,
            pouches_per_packet=Decimal("1.0000"),
            carton_item_id=seeded_items["PKG-CTN-20"].id,
            packets_per_carton=20,
        )
        db.add(mapping)
        db.commit()

    finally:
        db.close()

    return test_engine, TestingSessionLocal, temp_db_path


def run_benchmark_verification():
    """Execute Section 5 Steps 1, 2, 3, and 8 and assert 100% exact matches."""
    print("\n" + "=" * 65)
    print("🚀 STARTING SECTION 5 AUTOMATED BENCHMARK VERIFICATION")
    print("=" * 65)

    test_engine, SessionLocal, temp_db_path = setup_isolated_test_db()
    db = SessionLocal()

    try:
        # Retrieve items
        flour = db.query(Item).filter(Item.sku_code == "RM-FLOUR-01").one()
        oil = db.query(Item).filter(Item.sku_code == "RM-OIL-01").one()
        spice = db.query(Item).filter(Item.sku_code == "RM-SPICE-01").one()
        pouch = db.query(Item).filter(Item.sku_code == "PKG-POUCH-200G").one()
        carton = db.query(Item).filter(Item.sku_code == "PKG-CTN-20").one()
        murukku = db.query(Item).filter(Item.sku_code == "FG-MUR-200G").one()
        supplier = db.query(Party).filter(Party.name == "Default Agro Suppliers").one()
        admin = db.query(User).filter(User.username == "admin").one()

        # -------------------------------------------------------------------------
        # STEP 1: Inbound Purchase of 60 kg Flour @ ₹45/kg (4500 paisa)
        # -------------------------------------------------------------------------
        print("\n--- STEP 1: Inbound Purchase of 60 kg Flour @ ₹45/kg ---")
        init_flour_bal = get_item_balance(db, flour.id)
        assert init_flour_bal == Decimal("100.0000"), f"Expected 100 kg initial, got {init_flour_bal}"

        purchase = create_purchase(
            db=db,
            bill_no="PUR-2026-001",
            supplier_id=supplier.id,
            item_id=flour.id,
            qty=Decimal("60.0000"),
            unit_rate_paisa=4500,  # ₹45.00
            purchase_date=Decimal("2026-11-18") if False else None or flour.created_at.date(),
            created_by=admin.id,
        )
        db.commit()

        # Verify Flour Stock: 100 + 60 = 160 kg
        flour_stock_after_purchase = get_item_balance(db, flour.id)
        assert flour_stock_after_purchase == Decimal("160.0000"), (
            f"Expected 160.0000 kg Flour, got {flour_stock_after_purchase}"
        )

        # Verify Weighted Average Cost:
        # ((100 * 4200) + (60 * 4500)) / 160 = (420000 + 270000) / 160 = 690000 / 160 = 4312.5 paisa
        flour_weighted_rate = get_weighted_average_rate_paisa(db, flour.id, as_decimal=True)
        print(f" [+] Flour Inbound Stock: {flour_stock_after_purchase} kg")
        print(f" [+] Weighted Avg Flour Rate: {flour_weighted_rate} paisa/kg (₹{flour_weighted_rate / 100:,.3f}/kg)")
        assert flour_weighted_rate == Decimal("4312.5"), (
            f"Expected weighted average Flour rate 4312.5 paisa, got {flour_weighted_rate}"
        )

        # -------------------------------------------------------------------------
        # STEP 2 & 3: Production Run 1 Batch Murukku 200g
        # -------------------------------------------------------------------------
        print("\n--- STEP 2 & 3: Production Run Execution (1 Batch Murukku 200g) ---")
        # Dry-run Preview verification
        preview = preview_production_run(db, finished_item_id=murukku.id, batches_count=Decimal("1.0"))
        assert preview["can_produce"] is True
        assert preview["expected_output_packets"] == Decimal("200.0000")
        print(" [+] BOM Preview verified: 200 pkts expected, all ingredients available in stock.")

        # Execute Run with actuals:
        # Flour: 40.0 kg (variance: 0.00%)
        # Oil: 10.5 L (variance: +5.00% -> Flagged!)
        # Spice: 1.2 kg (variance: 0.00%)
        # Output: 188 good packets (yield variance: -6.00% -> Flagged!)
        # Damaged pouches: 6
        # Cartons used: 9
        raw_issued = [
            {"item_id": flour.id, "actual_qty": Decimal("40.0000")},
            {"item_id": oil.id, "actual_qty": Decimal("10.5000")},
            {"item_id": spice.id, "actual_qty": Decimal("1.2000")},
        ]

        run_result = execute_production_run(
            db=db,
            finished_item_id=murukku.id,
            batches_count=Decimal("1.0"),
            raw_materials_issued=raw_issued,
            actual_good_packets=Decimal("188.0000"),
            damaged_pouches=Decimal("6.0000"),
            cartons_used=9,
            labour_cost_paisa=0,  # Will allocate in Step 8
            overhead_cost_paisa=0,
            run_date=flour.created_at.date(),
            created_by=admin.id,
            run_number="PR-20261118-0001",
        )
        db.commit()

        # Verify 3% Variance Alerts
        print(f" [+] Run Number: {run_result['run_number']}")
        print(f" [+] Yield Variance: {run_result['yield_variance_pct']}% (Flagged: {run_result['yield_is_flagged']})")
        assert run_result["yield_variance_pct"] == Decimal("-6.0000"), (
            f"Expected yield variance -6.0000%, got {run_result['yield_variance_pct']}"
        )
        assert run_result["yield_is_flagged"] is True, "Yield variance must be flagged (>3% tolerance)!"

        # Check raw materials variance
        rm_variances = {item["sku_code"]: item for item in run_result["raw_materials_breakdown"]}
        print(f" [+] Oil Variance: {rm_variances['RM-OIL-01']['variance_pct']}% (Flagged: {rm_variances['RM-OIL-01']['is_flagged']})")
        assert rm_variances["RM-OIL-01"]["variance_pct"] == Decimal("5.0000")
        assert rm_variances["RM-OIL-01"]["is_flagged"] is True, "Oil +5% variance must be flagged!"

        print(f" [+] Flour Variance: {rm_variances['RM-FLOUR-01']['variance_pct']}% (Flagged: {rm_variances['RM-FLOUR-01']['is_flagged']})")
        assert rm_variances["RM-FLOUR-01"]["variance_pct"] == Decimal("0.0000")
        assert rm_variances["RM-FLOUR-01"]["is_flagged"] is False

        assert run_result["has_variance_alert"] is True, "Overall run must have has_variance_alert = True"

        # -------------------------------------------------------------------------
        # VERIFY CLOSING STOCK BALANCES
        # -------------------------------------------------------------------------
        print("\n--- VERIFYING CLOSING INVENTORY BALANCES ---")
        flour_close = get_item_balance(db, flour.id)
        oil_close = get_item_balance(db, oil.id)
        spice_close = get_item_balance(db, spice.id)
        pouch_close = get_item_balance(db, pouch.id)
        carton_close = get_item_balance(db, carton.id)
        murukku_close = get_item_balance(db, murukku.id)

        print(f" Flour Balance: {flour_close} kg (Expected: 120.0000 kg)")
        print(f" Cooking Oil Balance: {oil_close} L (Expected: 19.5000 L)")
        print(f" Salt/Spice Balance: {spice_close} kg (Expected: 3.8000 kg)")
        print(f" 200g Pouch Balance: {pouch_close} pcs (Expected: 306.0000 pcs)")
        print(f" Carton Balance: {carton_close} pcs (Expected: 21.0000 pcs)")
        print(f" Murukku 200g Balance: {murukku_close} pkts (Expected: 238.0000 pkts)")

        assert flour_close == Decimal("120.0000"), f"Flour balance mismatch: {flour_close}"
        assert oil_close == Decimal("19.5000"), f"Oil balance mismatch: {oil_close}"
        assert spice_close == Decimal("3.8000"), f"Spice balance mismatch: {spice_close}"
        assert pouch_close == Decimal("306.0000"), f"Pouch balance mismatch: {pouch_close}"
        assert carton_close == Decimal("21.0000"), f"Carton balance mismatch: {carton_close}"
        assert murukku_close == Decimal("238.0000"), f"Murukku balance mismatch: {murukku_close}"
        print(" [OK] All closing inventory balances match Section 5 specification 100%!")

        # -------------------------------------------------------------------------
        # STEP 8: Direct Batch Overhead Allocation & Cost Per Packet
        # -------------------------------------------------------------------------
        print("\n--- STEP 8: Direct Batch Overhead Allocation & Unit Costing ---")
        # Add ₹1,200 labour (120,000 paisa) + ₹600 overhead (60,000 paisa)
        patch_result = update_production_overheads(
            db=db,
            run_id=run_result["run_id"],
            labour_cost_paisa=120000,
            overhead_cost_paisa=60000,
            updated_by=admin.id,
        )
        db.commit()

        # Detailed verification of material & packaging cost:
        # 1. Flour: 40 kg * 43.125 paisa = 172,500 paisa (₹1,725.00)
        # 2. Oil: 10.5 L * 14000 paisa = 147,000 paisa (₹1,470.00)
        # 3. Spices: 1.2 kg * 20000 paisa = 24,000 paisa (₹240.00)
        # 4. Pouches: (188 good + 6 damaged) = 194 pcs * 250 paisa = 48,500 paisa (₹485.00)
        # 5. Cartons: 9 pcs * 1500 paisa = 13,500 paisa (₹135.00)
        # Material + Packaging Subtotal = 1725 + 1470 + 240 + 485 + 135 = ₹4,055.00 (405,500 paisa)
        # Overheads = 1200 + 600 = ₹1,800.00 (180,000 paisa)
        # Total Batch Cost = 4055 + 1800 = ₹5,855.00 (585,500 paisa)
        # Cost per packet = 585500 / 188 = 3114.3617... -> 3114 paisa = ₹31.14
        print(f" [+] Total Batch Cost: ₹{patch_result['total_batch_cost_paisa'] / 100:,.2f} ({patch_result['total_batch_cost_paisa']} paisa)")
        print(f" [+] Unit Cost Per Packet: ₹{patch_result['cost_per_packet_paisa'] / 100:,.2f} ({patch_result['cost_per_packet_paisa']} paisa)")
        print(f" [+] Gross Margin vs ₹50 Selling Price: {patch_result['gross_margin_pct']}%")

        assert patch_result["total_batch_cost_paisa"] == 585500, (
            f"Expected total batch cost 585500 paisa (₹5,855.00), got {patch_result['total_batch_cost_paisa']}"
        )
        assert patch_result["cost_per_packet_paisa"] == 3114, (
            f"Expected cost per packet 3114 paisa (₹31.14), got {patch_result['cost_per_packet_paisa']}"
        )

        # Verify PROD_OUTPUT entry in stock_ledger updated with new cost per packet
        output_entry = (
            db.query(StockLedger)
            .filter(
                StockLedger.reference_type == "PRODUCTION_RUN",
                StockLedger.reference_id == run_result["run_id"],
                StockLedger.transaction_type == StockTransactionType.PROD_OUTPUT.value,
            )
            .first()
        )
        assert output_entry is not None
        assert output_entry.unit_rate_paisa == 3114, (
            f"Expected stock ledger output unit rate 3114 paisa, got {output_entry.unit_rate_paisa}"
        )

        # -------------------------------------------------------------------------
        # ADDITIONAL INVARIANT TEST: Non-negative inventory enforcement
        # -------------------------------------------------------------------------
        print("\n--- TESTING INVARIANT: Non-Negative Inventory Enforcement ---")
        try:
            # Current flour balance is 120 kg. Attempting to issue 130 kg should fail.
            record_stock_movement(
                db=db,
                item_id=flour.id,
                transaction_type=StockTransactionType.PROD_ISSUE.value,
                qty_change=Decimal("-130.0000"),
                allow_negative=False,
            )
            assert False, "CRITICAL ERROR: Insufficient stock did not raise ValueError!"
        except ValueError as err:
            print(f" [OK] Correctly caught insufficient stock: {err}")

        # -------------------------------------------------------------------------
        # ADDITIONAL INVARIANT TEST: Decoupled BOM (Murukku 500g SKU Mapping)
        # -------------------------------------------------------------------------
        print("\n--- TESTING INVARIANT: Decoupled BOM (Murukku 500g SKU Mapping) ---")
        # Create a new SKU: Murukku 500g
        murukku_500 = Item(
            sku_code="FG-MUR-500G",
            name="Murukku 500g",
            name_ta="முறுக்கு 500கி",
            category="FINISHED_GOOD",
            base_unit="packet",
            pack_weight_grams=Decimal("500"),
            carton_capacity=10,
            selling_price_paisa=12000,
        )
        db.add(murukku_500)
        db.flush()

        # Link to the SAME BOMHeader (BOM-MRK-BASE) yielding 80 packets
        bom = db.query(BOMHeader).filter(BOMHeader.code == "BOM-MRK-BASE").one()
        mapping_500 = create_bom_sku_mapping(
            db=db,
            bom_id=bom.id,
            finished_item_id=murukku_500.id,
            expected_yield_packets=Decimal("80.0000"),
            pouch_item_id=pouch.id,
            pouches_per_packet=Decimal("1.0000"),
            carton_item_id=carton.id,
            packets_per_carton=10,
        )
        db.commit()

        preview_500 = preview_production_run(db, finished_item_id=murukku_500.id, batches_count=Decimal("1.0"))
        assert preview_500["expected_output_packets"] == Decimal("80.0000")
        assert len(preview_500["ingredients"]) == 3
        print(" [OK] Murukku 500g mapped to base recipe with 80 packets expected yield via data configuration!")

        # -------------------------------------------------------------------------
        # FASTAPI ROUTER ENDPOINTS VIA TESTCLIENT
        # -------------------------------------------------------------------------
        print("\n--- TESTING FASTAPI PHASE 2 ENDPOINTS ---")
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)

        # 1. /api/inventory/balances
        resp = client.get("/api/inventory/balances")
        assert resp.status_code == 200
        balances = resp.json()
        assert len(balances) >= 6
        flour_b = next(b for b in balances if b["sku_code"] == "RM-FLOUR-01")
        assert flour_b["current_stock"] == "120.0000"

        # 2. /api/inventory/ledger
        resp = client.get("/api/inventory/ledger")
        assert resp.status_code == 200
        assert len(resp.json()) > 0

        # 3. /api/purchases
        resp = client.get("/api/purchases")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        # 4. /api/boms
        resp = client.get("/api/boms")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

        # 5. /api/production/runs
        resp = client.get("/api/production/runs")
        assert resp.status_code == 200
        runs = resp.json()
        assert len(runs) >= 1
        assert runs[0]["cost_per_packet_paisa"] == 3114

        app.dependency_overrides.clear()
        print(" [OK] All FastAPI Phase 2 API endpoints passed successfully!")

        print("\n" + "=" * 65)
        print("✅ ALL SECTION 5 PHASE 2 BENCHMARK VERIFICATIONS PASSED 100%!")
        print("=" * 65 + "\n")

    finally:
        db.close()
        # Clean up temporary test DB
        try:
            os.remove(temp_db_path)
        except Exception:
            pass


if __name__ == "__main__":
    run_benchmark_verification()
