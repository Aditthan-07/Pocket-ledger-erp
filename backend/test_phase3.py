"""
Pocket Ledger ERP - Phase 3 Complete End-to-End Benchmark Verification Suite
NIT Tiruchirappalli CDI Winter Internship Specification

Runs ALL 9 STEPS of Section 5 sequentially in an isolated test database
so that production pocket_ledger.db remains clean at its opening state.

Step-by-Step Assertions:
- Step 1: Purchase 60 kg Flour @ ₹45/kg -> Weighted avg rate ₹43.125/kg (4312.5 paisa).
- Step 2 & 3: Production run 1 batch Murukku 200g (40kg flour, 10.5L oil, 1.2kg spice)
  Output: 188 good packets, 6 damaged pouches, 9 cartons.
  Alerts: Yield variance -6.00% (flagged), Oil variance +5.00% (flagged).
  Stock after production: Flour 120 kg, Oil 19.5 L, Pouches 306, Cartons 21, Murukku 238 pkts.
- Step 4 & 5: Sales Order 150 packets for Retailer A (Tamil Nadu) by Salesman A.
  Admin verifies & approves -> Generates GST Tax Invoice (INV/26-27/0001).
  Taxable: ₹7,500.00, CGST: ₹187.50, SGST: ₹187.50, IGST: ₹0.00, Total: ₹7,875.00.
  Dispatch executed -> Finished Murukku stock becomes 88 packets (238 - 150).
- Step 6: Sales Order 120 packets for Distributor B (Karnataka) by Salesman B.
  System detects stock shortage: Available 88 pkts, Shortage 32 pkts.
  System detects Inter-State supply -> IGST applicable.
  Smart Planner recommends 1 batch production run (yield 200 packets) with ingredient check.
- Step 7: Record ₹4,000.00 payment (400,000 paisa) from Retailer A.
  Retailer A outstanding balance becomes ₹3,875.00 (387,500 paisa).
  Ageing buckets verified.
- Step 8: Direct Batch Overhead Allocation (₹1,200 labour + ₹600 power/gas).
  Batch cost verified as ₹5,855.00 (585,500 paisa).
  Cost per packet verified as ₹31.14 (3114 paisa).
  Gross margin vs ₹50 selling price verified as 37.72%.
- Step 9: GST Tax Invoice PDF generation, Section 4.6 Excel/CSV exports,
  Credit note cancellation invariant, and Live Ledger Integrity Audit Check (100% PASSED).
"""

import os
import sys
import tempfile
from datetime import date
from decimal import Decimal
from pathlib import Path

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
    Invoice,
    CreditNote,
    Payment,
)
from backend.services.ledger_service import (
    get_item_balance,
    get_weighted_average_rate_paisa,
)
from backend.services.production_service import (
    create_purchase,
    execute_production_run,
    update_production_overheads,
)
from backend.services.sales_service import (
    create_sales_order,
    approve_and_invoice_order,
    dispatch_invoice,
    cancel_invoice_with_credit_note,
    record_payment,
    get_customer_receivables,
)
from backend.services.pdf_report_service import (
    generate_invoice_pdf,
    build_excel_workbook,
    build_csv_content,
    get_sales_register_data,
    get_gst_outward_summary_data,
    get_stock_summary_report_data,
    run_ledger_integrity_audit,
)
from backend.main import app


def setup_isolated_test_db():
    """Create an isolated temporary SQLite database seeded with Section 5 opening data."""
    temp_db_fd, temp_db_path = tempfile.mkstemp(suffix="_test_p3_pocket_ledger.db")
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
            party = Party(name=name, party_type=ptype, gstin=gstin, state=state, address=f"{name} Address, {state}")
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
                hsn_code="21069099" if "MUR" in sku else "110290",
                gst_rate_bps=500,  # 5%
                selling_price_paisa=5000 if "MUR" in sku else 0,  # ₹50.00
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


def run_full_section_5_end_to_end():
    """Execute all 9 steps of Section 5 sequentially."""
    print("\n" + "=" * 70)
    print("🌟 SECTION 5: COMPLETE END-TO-END BENCHMARK VERIFICATION (STEPS 1 TO 9)")
    print("=" * 70)

    test_engine, SessionLocal, temp_db_path = setup_isolated_test_db()
    db = SessionLocal()

    try:
        # Load Entities
        flour = db.query(Item).filter(Item.sku_code == "RM-FLOUR-01").one()
        oil = db.query(Item).filter(Item.sku_code == "RM-OIL-01").one()
        spice = db.query(Item).filter(Item.sku_code == "RM-SPICE-01").one()
        pouch = db.query(Item).filter(Item.sku_code == "PKG-POUCH-200G").one()
        carton = db.query(Item).filter(Item.sku_code == "PKG-CTN-20").one()
        murukku = db.query(Item).filter(Item.sku_code == "FG-MUR-200G").one()

        retailer_a = db.query(Party).filter(Party.name == "Retailer A").one()
        distributor_b = db.query(Party).filter(Party.name == "Distributor B").one()
        supplier = db.query(Party).filter(Party.name == "Default Agro Suppliers").one()

        salesman_a = db.query(User).filter(User.username == "salesman_a").one()
        salesman_b = db.query(User).filter(User.username == "salesman_b").one()
        admin = db.query(User).filter(User.username == "admin").one()

        # -------------------------------------------------------------------------
        # STEP 1: Inbound Purchase of 60 kg Flour @ ₹45/kg (4500 paisa)
        # -------------------------------------------------------------------------
        print("\n--- [STEP 1] Inbound Purchase of 60 kg Flour @ ₹45.00 ---")
        p = create_purchase(
            db=db,
            bill_no="PUR-2026-001",
            supplier_id=supplier.id,
            item_id=flour.id,
            qty=Decimal("60.0000"),
            unit_rate_paisa=4500,
            purchase_date=date(2026, 11, 18),
            created_by=admin.id,
        )
        db.commit()

        flour_stock_after_p = get_item_balance(db, flour.id)
        assert flour_stock_after_p == Decimal("160.0000")
        flour_rate = get_weighted_average_rate_paisa(db, flour.id, as_decimal=True)
        assert flour_rate == Decimal("4312.5")
        print(f" [+] Flour Stock: {flour_stock_after_p} kg, Weighted Avg Rate: ₹{flour_rate / 100:,.3f}/kg")

        # -------------------------------------------------------------------------
        # STEP 2 & 3: Production Run 1 Batch Murukku 200g
        # -------------------------------------------------------------------------
        print("\n--- [STEP 2 & 3] Production Run 1 Batch Murukku 200g ---")
        raw_issued = [
            {"item_id": flour.id, "actual_qty": Decimal("40.0000")},
            {"item_id": oil.id, "actual_qty": Decimal("10.5000")},
            {"item_id": spice.id, "actual_qty": Decimal("1.2000")},
        ]
        run_res = execute_production_run(
            db=db,
            finished_item_id=murukku.id,
            batches_count=Decimal("1.0"),
            raw_materials_issued=raw_issued,
            actual_good_packets=Decimal("188.0000"),
            damaged_pouches=Decimal("6.0000"),
            cartons_used=9,
            labour_cost_paisa=0,
            overhead_cost_paisa=0,
            run_date=date(2026, 11, 18),
            created_by=admin.id,
            run_number="PR-20261118-0001",
        )
        db.commit()

        assert run_res["yield_variance_pct"] == Decimal("-6.0000")
        assert run_res["yield_is_flagged"] is True
        assert run_res["has_variance_alert"] is True

        # Check balances after production
        assert get_item_balance(db, flour.id) == Decimal("120.0000")
        assert get_item_balance(db, oil.id) == Decimal("19.5000")
        assert get_item_balance(db, spice.id) == Decimal("3.8000")
        assert get_item_balance(db, pouch.id) == Decimal("306.0000")
        assert get_item_balance(db, carton.id) == Decimal("21.0000")
        assert get_item_balance(db, murukku.id) == Decimal("238.0000")  # 50 opening + 188 produced
        print(f" [+] Post-production stock: Murukku 200g = {get_item_balance(db, murukku.id)} packets")

        # -------------------------------------------------------------------------
        # STEP 4 & 5: Sales Order 150 packets for Retailer A (Tamil Nadu)
        # -------------------------------------------------------------------------
        print("\n--- [STEP 4 & 5] Sales Order 150 pkts for Retailer A (TN) -> GST Invoice -> Dispatch ---")
        so1_res = create_sales_order(
            db=db,
            customer_id=retailer_a.id,
            salesman_id=salesman_a.id,
            items=[{"item_id": murukku.id, "qty_packets": 150.0, "unit_price_paisa": 5000}],
            order_date=date(2026, 11, 18),
            notes="NIT Benchmark Retailer A order",
            created_by=salesman_a.id,
        )
        db.commit()
        assert so1_res["has_shortage"] is False
        assert so1_res["applicable_tax_type"] == "CGST+SGST"
        print(f" [+] Sales Order #{so1_res['order_number']} created: Available 238 pkts, Requested 150 pkts (Shortage: 0)")

        # Admin approves order and generates invoice
        inv1 = approve_and_invoice_order(
            db=db,
            order_id=so1_res["order_id"],
            invoice_date=date(2026, 11, 18),
            approved_by=admin.id,
        )
        db.commit()

        # Invariant Assertions on Invoice 1:
        # Taxable: 150 pkts * ₹50 = ₹7,500.00 (750,000 paisa)
        # GST 5% = ₹375.00 -> Intra-state TN: CGST ₹187.50 (18750 paisa), SGST ₹187.50 (18750 paisa)
        # Grand Total: ₹7,875.00 (787,500 paisa)
        print(f" [+] Invoice #{inv1.invoice_number} Generated:")
        print(f"     Taxable: ₹{inv1.taxable_paisa / 100:,.2f} ({inv1.taxable_paisa} paisa)")
        print(f"     CGST:    ₹{inv1.cgst_paisa / 100:,.2f} ({inv1.cgst_paisa} paisa)")
        print(f"     SGST:    ₹{inv1.sgst_paisa / 100:,.2f} ({inv1.sgst_paisa} paisa)")
        print(f"     IGST:    ₹{inv1.igst_paisa / 100:,.2f} ({inv1.igst_paisa} paisa)")
        print(f"     Total:   ₹{inv1.grand_total_paisa / 100:,.2f} ({inv1.grand_total_paisa} paisa)")

        assert inv1.taxable_paisa == 750000
        assert inv1.cgst_paisa == 18750
        assert inv1.sgst_paisa == 18750
        assert inv1.igst_paisa == 0
        assert inv1.grand_total_paisa == 787500

        # Dispatch Invoice
        dispatch_invoice(db=db, invoice_id=inv1.id, dispatched_by=admin.id)
        db.commit()

        # Verify stock after dispatch: 238 - 150 = 88 packets
        murukku_stock_after_so1 = get_item_balance(db, murukku.id)
        print(f" [+] Murukku 200g Stock after Dispatch: {murukku_stock_after_so1} pkts (Expected: 88.0000 pkts)")
        assert murukku_stock_after_so1 == Decimal("88.0000")

        # -------------------------------------------------------------------------
        # STEP 6: Sales Order 120 packets for Distributor B (Karnataka)
        # -------------------------------------------------------------------------
        print("\n--- [STEP 6] Sales Order 120 pkts for Distributor B (Karnataka) -> Shortage & Demand Planner ---")
        so2_res = create_sales_order(
            db=db,
            customer_id=distributor_b.id,
            salesman_id=salesman_b.id,
            items=[{"item_id": murukku.id, "qty_packets": 120.0, "unit_price_paisa": 5000}],
            order_date=date(2026, 11, 18),
            notes="NIT Benchmark Distributor B order",
            created_by=salesman_b.id,
        )
        db.commit()

        assert so2_res["has_shortage"] is True
        assert so2_res["applicable_tax_type"] == "IGST"  # Inter-state Karnataka!

        item_status = so2_res["items"][0]
        print(f" [+] Stock Check: Requested: {item_status['requested_qty']}, Available: {item_status['available_qty']}, Shortage: {item_status['shortage_qty']}")
        assert item_status["available_qty"] == Decimal("88.0000")
        assert item_status["shortage_qty"] == Decimal("32.0000")

        # Verify Smart Production Planner recommendation
        rec = item_status["production_recommendation"]
        assert rec is not None
        assert rec["batches_needed"] == 1
        assert rec["expected_output_packets"] == Decimal("200.0000")
        print(f" [+] Smart Demand-to-Batch Recommendation: {rec['batches_needed']} batch ({rec['expected_output_packets']} pkts expected output)")
        print(f"     Raw materials sufficient for batch: {rec['raw_materials_sufficient']}")

        # -------------------------------------------------------------------------
        # STEP 7: Customer Payment & Receivables Ageing
        # -------------------------------------------------------------------------
        print("\n--- [STEP 7] Customer Payment & Receivables Ageing (Retailer A) ---")
        payment = record_payment(
            db=db,
            customer_id=retailer_a.id,
            amount_paisa=400000,  # ₹4,000.00
            payment_mode="UPI",
            payment_date=date(2026, 11, 18),
            invoice_id=inv1.id,
            receipt_number="REC/26-27/0001",
            created_by=admin.id,
        )
        db.commit()

        # Check Receivables for Retailer A
        receivables = get_customer_receivables(db, customer_id=retailer_a.id)
        assert len(receivables) == 1
        r_a = receivables[0]

        # Total Billed = ₹7,875.00 (787,500 paisa)
        # Total Paid = ₹4,000.00 (400,000 paisa)
        # Outstanding = ₹3,875.00 (387,500 paisa)
        print(f" [+] Retailer A Receivables:")
        print(f"     Total Billed:      ₹{r_a['total_billed_rupees']:,.2f} ({r_a['total_billed_paisa']} paisa)")
        print(f"     Total Paid:        ₹{r_a['total_paid_rupees']:,.2f} ({r_a['total_paid_paisa']} paisa)")
        print(f"     Total Outstanding: ₹{r_a['outstanding_rupees']:,.2f} ({r_a['outstanding_paisa']} paisa)")
        print(f"     Ageing 0-30 Days:  ₹{r_a['ageing_buckets']['days_0_30_rupees']:,.2f}")

        assert r_a["total_billed_paisa"] == 787500
        assert r_a["total_paid_paisa"] == 400000
        assert r_a["outstanding_paisa"] == 387500
        assert r_a["ageing_buckets"]["days_0_30_paisa"] == 387500

        # -------------------------------------------------------------------------
        # STEP 8: Direct Batch Overhead Allocation & Costing Math
        # -------------------------------------------------------------------------
        print("\n--- [STEP 8] Direct Batch Overhead Allocation & Unit Costing ---")
        patch_res = update_production_overheads(
            db=db,
            run_id=run_res["run_id"],
            labour_cost_paisa=120000,  # ₹1,200.00
            overhead_cost_paisa=60000,  # ₹600.00
            updated_by=admin.id,
        )
        db.commit()

        print(f" [+] Total Batch Cost: ₹{patch_res['total_batch_cost_rupees']:,.2f} ({patch_res['total_batch_cost_paisa']} paisa)")
        print(f" [+] Cost Per Packet:  ₹{patch_res['cost_per_packet_rupees']:,.2f} ({patch_res['cost_per_packet_paisa']} paisa)")
        print(f" [+] Gross Margin:     {patch_res['gross_margin_pct']}%")

        assert patch_res["total_batch_cost_paisa"] == 585500
        assert patch_res["cost_per_packet_paisa"] == 3114
        assert patch_res["gross_margin_pct"] == Decimal("37.7200")

        # -------------------------------------------------------------------------
        # STEP 9: GST Tax Invoice PDF & Auditor Reports
        # -------------------------------------------------------------------------
        print("\n--- [STEP 9] GST Tax Invoice PDF & Section 4.6 Auditor Reports ---")
        # 9a. Test PDF Generation
        pdf_bytes = generate_invoice_pdf(inv1)
        assert len(pdf_bytes) > 1000
        assert pdf_bytes.startswith(b"%PDF"), "Generated file is not a valid PDF!"
        print(f" [OK] GST Tax Invoice PDF generated successfully ({len(pdf_bytes)} bytes)")

        # 9b. Test Sales Register
        sr_headers, sr_rows, sr_json = get_sales_register_data(db)
        assert len(sr_rows) >= 1
        assert sr_rows[0][0] == inv1.invoice_number
        print(f" [OK] Sales Register generated ({len(sr_rows)} rows)")

        # 9c. Test GST Outward Summary (GSTR-1 / GSTR-3B)
        gst_headers, gst_rows, gst_json = get_gst_outward_summary_data(db)
        assert len(gst_rows) == 3
        # Intra-state taxable should be 7500.0
        assert gst_json["intra_state_b2b"]["taxable_inr"] == 7500.0
        assert gst_json["intra_state_b2b"]["cgst_inr"] == 187.5
        assert gst_json["intra_state_b2b"]["sgst_inr"] == 187.5
        print(f" [OK] GSTR-1 / GSTR-3B Outward Supplies verified (Taxable: ₹7,500, CGST: ₹187.50, SGST: ₹187.50)")

        # 9d. Test Excel (.xlsx) Generation
        xlsx_bytes = build_excel_workbook("Sales Register", sr_headers, sr_rows)
        assert len(xlsx_bytes) > 1000
        assert xlsx_bytes.startswith(b"PK"), "Generated file is not a valid openpyxl XLSX!"
        print(f" [OK] Auditor Excel Workbook generated successfully ({len(xlsx_bytes)} bytes)")

        # 9e. Test CSV Generation
        csv_text = build_csv_content(sr_headers, sr_rows)
        assert "Invoice No" in csv_text
        print(f" [OK] Auditor CSV generated successfully ({len(csv_text)} characters)")

        # 9f. Test Credit Note Cancellation Invariant (creates credit note and restores stock)
        print("\n--- Testing Invariant: Credit Note Cancellation with Stock Return ---")
        # Create dummy invoice to test credit note cancellation
        dummy_so = create_sales_order(
            db=db,
            customer_id=retailer_a.id,
            salesman_id=salesman_a.id,
            items=[{"item_id": murukku.id, "qty_packets": 10.0, "unit_price_paisa": 5000}],
            order_date=date(2026, 11, 18),
        )
        db.commit()
        dummy_inv = approve_and_invoice_order(db=db, order_id=dummy_so["order_id"], approved_by=admin.id)
        db.commit()
        dispatch_invoice(db=db, invoice_id=dummy_inv.id, dispatched_by=admin.id)
        db.commit()

        stock_before_cn = get_item_balance(db, murukku.id)
        assert stock_before_cn == Decimal("78.0000")  # 88 - 10 = 78

        cn = cancel_invoice_with_credit_note(
            db=db,
            invoice_id=dummy_inv.id,
            reason="Customer cancelled before delivery transit",
            cancelled_by=admin.id,
        )
        db.commit()

        assert dummy_inv.status == "CANCELLED"
        assert cn.credit_note_number.startswith("CN/")
        stock_after_cn = get_item_balance(db, murukku.id)
        assert stock_after_cn == Decimal("88.0000")  # Stock restored via CREDIT_RETURN!
        print(f" [OK] Credit Note #{cn.credit_note_number} cancelled invoice and restored stock back to {stock_after_cn} packets!")

        # 9g. Live Ledger Integrity Audit Check
        print("\n--- Testing Live Ledger Integrity Audit Check ---")
        audit_res = run_ledger_integrity_audit(db)
        print(f" [+] Audit Status: {audit_res['status']}, Integrity Score: {audit_res['integrity_score']}")
        print(f" [+] Paisa Drift: {audit_res['paisa_drift']}")
        for chk in audit_res["checks"]:
            print(f"     * {chk['check']}: {'PASSED' if chk['passed'] else 'FAILED'}")
        assert audit_res["status"] == "PASSED"
        assert audit_res["integrity_score"] == "100%"
        assert audit_res["paisa_drift"] == 0

        # -------------------------------------------------------------------------
        # TEST FASTAPI ENDPOINTS VIA TESTCLIENT
        # -------------------------------------------------------------------------
        print("\n--- Testing FastAPI Phase 3 Endpoints via TestClient ---")
        app.dependency_overrides[get_db] = lambda: db
        client = TestClient(app)

        # 1. Login endpoint
        login_res = client.post("/api/auth/login", json={"username": "admin", "password": "demo123"})
        assert login_res.status_code == 200
        assert login_res.json()["role"] == "ADMIN"

        # 2. List Orders
        orders_res = client.get("/api/orders")
        assert orders_res.status_code == 200
        assert len(orders_res.json()) >= 2

        # 3. List Invoices
        inv_res = client.get("/api/invoices")
        assert inv_res.status_code == 200
        assert len(inv_res.json()) >= 1

        # 4. Invoice PDF endpoint
        pdf_res = client.get(f"/api/invoices/{inv1.id}/pdf")
        assert pdf_res.status_code == 200
        assert pdf_res.headers["content-type"] == "application/pdf"

        # 5. Receivables endpoint
        rec_res = client.get("/api/payments/receivables")
        assert rec_res.status_code == 200
        assert len(rec_res.json()) >= 1

        # 6. Owner Dashboard
        dash_res = client.get("/api/dashboard/owner")
        assert dash_res.status_code == 200
        dash_data = dash_res.json()
        assert dash_data["factory_state"] == "Tamil Nadu"

        # 7. Reports JSON, CSV, XLSX
        rep_json = client.get("/api/reports/sales-register?format=json")
        assert rep_json.status_code == 200

        rep_csv = client.get("/api/reports/sales-register?format=csv")
        assert rep_csv.status_code == 200
        assert rep_csv.headers["content-type"].startswith("text/csv")

        rep_xlsx = client.get("/api/reports/sales-register?format=xlsx")
        assert rep_xlsx.status_code == 200
        assert "spreadsheetml" in rep_xlsx.headers["content-type"]

        # 8. Integrity check endpoint
        audit_endpoint = client.get("/api/reports/audit/integrity-check")
        assert audit_endpoint.status_code == 200
        assert audit_endpoint.json()["status"] == "PASSED"

        app.dependency_overrides.clear()
        print(" [OK] All Phase 3 FastAPI Endpoints Passed Cleanly!")

        print("\n" + "=" * 70)
        print("🏆 ALL 9 STEPS OF SECTION 5 BENCHMARK PASSED WITH 100% SUCCESS!")
        print("=" * 70 + "\n")

    finally:
        db.close()
        try:
            os.remove(temp_db_path)
        except Exception:
            pass


if __name__ == "__main__":
    run_full_section_5_end_to_end()
