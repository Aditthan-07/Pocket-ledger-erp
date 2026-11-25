"""
Pocket Ledger ERP - Comprehensive End-to-End Automated Verification Suite
NIT Tiruchirappalli CDI Winter Internship Specification

Covers:
1. Master data & distributor check:
   - 4 finished goods snack SKUs (Murukku 200g, Mixture 250g, Banana Chips 200g, Thattai 200g)
   - 5 distributors (Distributor B, Chennai Metro, Kerala, Andhra Coastal, Telangana Metro)
   - Valid GSTIN formats and party_type == 'DISTRIBUTOR'
2. Multi-item & multi-regime GST invoicing:
   - Intra-state multi-item order (Retailer A in TN): CGST + SGST (2.5% + 2.5%), IGST == 0
   - Inter-state order (Kerala Spice & Snacks in Kerala): IGST (5%), CGST == SGST == 0
   - Export order (Chennai Seaport Export): 0% LUT (CGST == SGST == IGST == 0)
3. Production batch & stock ledger integrity:
   - 2-step production execution (start/issue -> complete)
   - Customer payment receipt (POST /api/payments)
   - Auditor verification check (GET /api/audit/verify)
"""

import sys
from pathlib import Path
from decimal import Decimal

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from backend.main import app

def run_e2e_verification():
    print("=" * 75)
    print("🚀 RUNNING COMPREHENSIVE END-TO-END AUTOMATED VERIFICATION SUITE")
    print("=" * 75)

    client = TestClient(app)

    # -------------------------------------------------------------------------
    # 1. Master Data & Distributor Check
    # -------------------------------------------------------------------------
    print("\n--- 1. MASTER DATA & DISTRIBUTOR VERIFICATION ---")

    # 1.1 Check 4 Snack SKUs
    res = client.get("/api/master/items")
    assert res.status_code == 200, f"Failed to fetch items: {res.text}"
    items = res.json()
    item_by_sku = {it["sku_code"]: it for it in items}

    expected_skus = {
        "FG-MUR-200G": "Murukku 200g",
        "FG-MIX-250G": "Mixture 250g",
        "FG-CHP-200G": "Banana Chips 200g",
        "FG-THT-200G": "Thattai 200g",
    }
    for sku, name in expected_skus.items():
        assert sku in item_by_sku, f"Missing finished good SKU: {sku}"
        assert name.lower() in item_by_sku[sku]["name"].lower(), f"SKU {sku} name mismatch: {item_by_sku[sku]['name']}"
        print(f" [OK] Finished Snack SKU: {sku} - {item_by_sku[sku]['name']} (Rate: ₹{item_by_sku[sku]['selling_price_paisa']/100:.2f})")

    # Raw material lookup
    rm_flour = item_by_sku["RM-FLOUR-01"]
    rm_oil = item_by_sku["RM-OIL-01"]
    rm_spice = item_by_sku["RM-SPICE-01"]
    fg_murukku = item_by_sku["FG-MUR-200G"]
    fg_mixture = item_by_sku["FG-MIX-250G"]
    fg_chips = item_by_sku["FG-CHP-200G"]
    fg_thattai = item_by_sku["FG-THT-200G"]

    # 1.2 Check 5 Distributors
    res = client.get("/api/master/parties")
    assert res.status_code == 200, f"Failed to fetch parties: {res.text}"
    parties = res.json()
    party_by_name = {p["name"]: p for p in parties}

    expected_distributors = [
        {"name": "Distributor B", "state": "Karnataka", "prefix": "29"},
        {"name": "Chennai Metro Distributors", "state": "Tamil Nadu", "prefix": "33"},
        {"name": "Kerala Spice & Snacks Distributors", "state": "Kerala", "prefix": "32"},
        {"name": "Andhra Coastal Distributors", "state": "Andhra Pradesh", "prefix": "37"},
        {"name": "Telangana Metro Distributors", "state": "Telangana", "prefix": "36"},
    ]

    for d in expected_distributors:
        p = party_by_name.get(d["name"])
        assert p is not None, f"Distributor '{d['name']}' not found in master parties!"
        assert p["party_type"] == "DISTRIBUTOR", f"Distributor '{d['name']}' has party_type '{p['party_type']}', expected 'DISTRIBUTOR'"
        assert p["gstin"].startswith(d["prefix"]), f"Distributor '{d['name']}' GSTIN '{p['gstin']}' must start with state code '{d['prefix']}'"
        assert p["state"] == d["state"], f"Distributor '{d['name']}' state mismatch: {p['state']}"
        print(f" [OK] Distributor: {p['name']} | State: {p['state']} | GSTIN: {p['gstin']} | Type: {p['party_type']}")

    retailer_a = party_by_name["Retailer A"]
    kerala_dist = party_by_name["Kerala Spice & Snacks Distributors"]

    # -------------------------------------------------------------------------
    # 2. Multi-Item & Multi-Regime GST Invoicing
    # -------------------------------------------------------------------------
    print("\n--- 2. MULTI-ITEM & MULTI-REGIME GST INVOICING ---")

    # 2.1 Intra-State Multi-Item Order (Retailer A in Tamil Nadu)
    print("\n[Case A] Intra-State Multi-Item Order (Retailer A, Tamil Nadu)")
    so_payload_a = {
        "customer_id": retailer_a["id"],
        "salesman_id": 1,
        "items": [
            {"item_id": fg_murukku["id"], "qty_packets": 5},
            {"item_id": fg_mixture["id"], "qty_packets": 5},
        ],
        "delivery_destination": "Madurai, Tamil Nadu",
        "notes": "Intra-state multi-snack field order",
    }
    res = client.post("/api/sales/orders", json=so_payload_a)
    assert res.status_code == 201, f"Failed to create intra-state order: {res.text}"
    order_a = res.json()
    order_a_id = order_a["order_id"]
    print(f" [+] Created Order #{order_a['order_number']} (Items: {len(order_a['items'])})")

    # Approve & Generate Invoice
    res = client.post(f"/api/orders/{order_a_id}/approve-invoice", json={"invoice_date": "2026-11-25"})
    assert res.status_code == 200, f"Failed to approve invoice: {res.text}"
    inv_a = res.json()
    inv_a_id = inv_a["id"]

    # Invariants for Intra-State (Tamil Nadu to Tamil Nadu):
    # CGST > 0, SGST > 0, IGST == 0, CGST + SGST == total_gst
    assert inv_a["cgst_paisa"] > 0, f"Intra-state must have CGST > 0, got {inv_a['cgst_paisa']}"
    assert inv_a["sgst_paisa"] > 0, f"Intra-state must have SGST > 0, got {inv_a['sgst_paisa']}"
    assert inv_a["igst_paisa"] == 0, f"Intra-state must have IGST == 0, got {inv_a['igst_paisa']}"
    assert inv_a["cgst_paisa"] == inv_a["sgst_paisa"], f"CGST and SGST must be equal: {inv_a['cgst_paisa']} vs {inv_a['sgst_paisa']}"
    assert inv_a["grand_total_paisa"] == inv_a["taxable_paisa"] + inv_a["cgst_paisa"] + inv_a["sgst_paisa"], "Parity check failed"
    print(f" [OK] Intra-State Invoice #{inv_a['invoice_number']} Verified:")
    print(f"      Taxable: ₹{inv_a['taxable_paisa']/100:.2f} | CGST: ₹{inv_a['cgst_paisa']/100:.2f} | SGST: ₹{inv_a['sgst_paisa']/100:.2f} | IGST: ₹{inv_a['igst_paisa']/100:.2f} | Total: ₹{inv_a['grand_total_paisa']/100:.2f}")

    # Dispatch Goods
    res = client.post(f"/api/invoices/{inv_a_id}/dispatch", json={"transporter_name": "VRL Logistics", "vehicle_number": "TN-47-BL-4821", "eway_bill_no": "EWB-33019421"})
    assert res.status_code == 200, f"Failed to dispatch invoice: {res.text}"
    print(f" [OK] Invoice #{inv_a['invoice_number']} Dispatched (Stock movement recorded)")

    # 2.2 Inter-State Order (Kerala Spice & Snacks Distributors, Kerala)
    print("\n[Case B] Inter-State Order (Kerala Spice & Snacks Distributors, Kochi)")
    so_payload_b = {
        "customer_id": kerala_dist["id"],
        "salesman_id": 1,
        "items": [
            {"item_id": fg_chips["id"], "qty_packets": 5},
        ],
        "delivery_destination": "Kochi, Kerala",
        "notes": "Inter-state supply to Kerala",
    }
    res = client.post("/api/sales/orders", json=so_payload_b)
    assert res.status_code == 201, f"Failed to create inter-state order: {res.text}"
    order_b = res.json()
    order_b_id = order_b["order_id"]
    print(f" [+] Created Order #{order_b['order_number']}")

    # Approve & Generate Invoice
    res = client.post(f"/api/orders/{order_b_id}/approve-invoice", json={"invoice_date": "2026-11-25"})
    assert res.status_code == 200, f"Failed to approve invoice: {res.text}"
    inv_b = res.json()
    inv_b_id = inv_b["id"]

    # Invariants for Inter-State (Tamil Nadu to Kerala):
    # CGST == 0, SGST == 0, IGST == total_gst > 0
    assert inv_b["cgst_paisa"] == 0, f"Inter-state must have CGST == 0, got {inv_b['cgst_paisa']}"
    assert inv_b["sgst_paisa"] == 0, f"Inter-state must have SGST == 0, got {inv_b['sgst_paisa']}"
    assert inv_b["igst_paisa"] > 0, f"Inter-state must have IGST > 0, got {inv_b['igst_paisa']}"
    assert inv_b["grand_total_paisa"] == inv_b["taxable_paisa"] + inv_b["igst_paisa"], "Parity check failed"
    print(f" [OK] Inter-State Invoice #{inv_b['invoice_number']} Verified:")
    print(f"      Taxable: ₹{inv_b['taxable_paisa']/100:.2f} | CGST: ₹{inv_b['cgst_paisa']/100:.2f} | SGST: ₹{inv_b['sgst_paisa']/100:.2f} | IGST: ₹{inv_b['igst_paisa']/100:.2f} | Total: ₹{inv_b['grand_total_paisa']/100:.2f}")

    # Dispatch Goods
    res = client.post(f"/api/invoices/{inv_b_id}/dispatch", json={"transporter_name": "Kerala Roadways", "vehicle_number": "KL-07-CD-9901", "eway_bill_no": "EWB-32098412"})
    assert res.status_code == 200, f"Failed to dispatch inter-state invoice: {res.text}"
    print(f" [OK] Invoice #{inv_b['invoice_number']} Dispatched")

    # 2.3 Export Order (Chennai Seaport Export, 0% LUT)
    print("\n[Case C] Export Order (Chennai Seaport Export, 0% LUT)")
    so_payload_c = {
        "customer_id": retailer_a["id"],
        "salesman_id": 1,
        "items": [
            {"item_id": fg_thattai["id"], "qty_packets": 5},
        ],
        "delivery_destination": "Chennai Seaport (Export)",
        "notes": "Export shipment under LUT",
    }
    res = client.post("/api/sales/orders", json=so_payload_c)
    assert res.status_code == 201, f"Failed to create export order: {res.text}"
    order_c = res.json()
    order_c_id = order_c["order_id"]
    print(f" [+] Created Export Order #{order_c['order_number']}")

    # Approve & Generate Invoice
    res = client.post(f"/api/orders/{order_c_id}/approve-invoice", json={"invoice_date": "2026-11-25"})
    assert res.status_code == 200, f"Failed to approve invoice: {res.text}"
    inv_c = res.json()
    inv_c_id = inv_c["id"]

    # Invariants for Export (0% LUT):
    # CGST == 0, SGST == 0, IGST == 0, Grand Total == Taxable
    assert inv_c["cgst_paisa"] == 0, f"Export must have CGST == 0, got {inv_c['cgst_paisa']}"
    assert inv_c["sgst_paisa"] == 0, f"Export must have SGST == 0, got {inv_c['sgst_paisa']}"
    assert inv_c["igst_paisa"] == 0, f"Export must have IGST == 0, got {inv_c['igst_paisa']}"
    assert inv_c["grand_total_paisa"] == inv_c["taxable_paisa"], f"Export grand total must equal taxable value: {inv_c['grand_total_paisa']} vs {inv_c['taxable_paisa']}"
    print(f" [OK] Export 0% LUT Invoice #{inv_c['invoice_number']} Verified:")
    print(f"      Taxable: ₹{inv_c['taxable_paisa']/100:.2f} | CGST: ₹0.00 | SGST: ₹0.00 | IGST: ₹0.00 | Total: ₹{inv_c['grand_total_paisa']/100:.2f}")

    # Dispatch Goods
    res = client.post(f"/api/invoices/{inv_c_id}/dispatch", json={"transporter_name": "Chennai Port Logistics", "vehicle_number": "TN-01-EXP-1122", "eway_bill_no": "EWB-33981122"})
    assert res.status_code == 200, f"Failed to dispatch export invoice: {res.text}"
    print(f" [OK] Export Invoice #{inv_c['invoice_number']} Dispatched")

    # -------------------------------------------------------------------------
    # 3. Production Batch Execution & Stock Ledger Integrity
    # -------------------------------------------------------------------------
    print("\n--- 3. PRODUCTION BATCH & STOCK LEDGER INTEGRITY ---")

    # Step A: Issue raw materials
    print("\n[Step A] Start Production Run (Issue Ingredients)")
    start_payload = {
        "finished_item_id": fg_murukku["id"],
        "batches_count": 1.0,
        "raw_materials_issued": [
            {"item_id": rm_flour["id"], "actual_qty": 40.0},
            {"item_id": rm_oil["id"], "actual_qty": 10.5},
            {"item_id": rm_spice["id"], "actual_qty": 1.2},
        ],
        "run_date": "2026-11-25",
        "created_by": 1,
    }
    res = client.post("/api/production/runs/start", json=start_payload)
    assert res.status_code == 201, f"Failed to start production batch: {res.text}"
    batch = res.json()
    run_id = batch["run_id"]
    print(f" [+] Batch Started: Run #{batch['run_number']} (ID: {run_id}, Finished: {batch['finished_item_name']})")

    # Step B: Complete production batch
    print("\n[Step B] Complete Production Batch (Record Yield, Packaging & Overheads)")
    complete_payload = {
        "actual_good_packets": 188.0,
        "damaged_pouches": 6.0,
        "cartons_used": 9,
        "labour_cost_paisa": 120000,
        "overhead_cost_paisa": 60000,
        "updated_by": 1,
    }
    res = client.post(f"/api/production/runs/{run_id}/complete", json=complete_payload)
    assert res.status_code == 200, f"Failed to complete production batch: {res.text}"
    run_summary = res.json()
    costing = run_summary.get("costing", {})
    total_cost = costing.get("total_batch_cost_paisa", 0)
    unit_cost = costing.get("unit_cost_per_packet_paisa", 0)
    print(f" [OK] Production Batch Completed (Status: {run_summary.get('status')}):")
    print(f"      Yield: {run_summary['actual_good_packets']} pkts | Total Cost: ₹{total_cost/100:.2f} | Cost/Pkt: ₹{unit_cost/100:.2f}")

    # 3.2 Customer Payment Receipt
    print("\n[Step C] Record Customer Payment Receipt")
    payment_payload = {
        "customer_id": retailer_a["id"],
        "amount_paisa": 50000,  # ₹500.00
        "payment_mode": "NEFT",
        "payment_date": "2026-11-25",
        "receipt_number": "RCP-2026-E2E-001",
        "created_by": 1,
    }
    res = client.post("/api/payments", json=payment_payload)
    assert res.status_code == 201, f"Failed to record payment: {res.text}"
    payment = res.json()
    print(f" [OK] Payment Recorded: Receipt #{payment['receipt_number']} | Amount: ₹{payment['amount_paisa']/100:.2f} via {payment['payment_mode']}")

    # 3.3 Auditor Verification Check
    print("\n[Step D] Live Auditor Verification Check (GET /api/audit/verify)")
    res = client.get("/api/audit/verify")
    assert res.status_code == 200, f"Failed to run audit verification: {res.text}"
    audit = res.json()

    print(f" [+] Audit Response:")
    print(f"     audit_status:         {audit.get('audit_status')}")
    print(f"     integrity_score:      {audit.get('integrity_score')}")
    print(f"     negative_stock_items: {audit.get('negative_stock_items')}")
    print(f"     paisa_drift:          {audit.get('paisa_drift')}")
    print(f"     total_items_checked:  {audit.get('total_items_checked')}")
    print(f"     total_invoices_checked: {audit.get('total_invoices_checked')}")

    # Strict Assertions
    assert audit.get("audit_status") == "PASSED", f"Expected audit_status 'PASSED', got {audit.get('audit_status')}"
    assert audit.get("integrity_score") == 100, f"Expected integrity_score 100, got {audit.get('integrity_score')}"
    assert audit.get("negative_stock_items") == 0, f"Expected negative_stock_items 0, got {audit.get('negative_stock_items')}"
    assert audit.get("paisa_drift") == 0, f"Expected paisa_drift 0, got {audit.get('paisa_drift')}"

    for chk in audit.get("checks", []):
        assert chk["passed"] is True, f"Check failed: {chk['check']} - {chk['details']}"
        print(f"     * {chk['check']}: PASSED ({chk['details']})")

    print("\n" + "=" * 75)
    print("🏆 ALL END-TO-END AUTOMATED VERIFICATION CHECKS PASSED WITH 100% SUCCESS!")
    print("=" * 75)


if __name__ == "__main__":
    run_e2e_verification()
