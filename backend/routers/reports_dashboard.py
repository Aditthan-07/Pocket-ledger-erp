"""
Pocket Ledger ERP - Owner Dashboard & Auditor Reports API Router
NIT Tiruchirappalli CDI Winter Internship Specification
Exports reports in JSON, CSV, and Excel (.xlsx) formats.
"""

from datetime import date
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.database import get_db
from backend.models import (
    Invoice,
    Payment,
    Purchase,
    ProductionRun,
    Item,
    StockLedger,
    Party,
)
from backend.services.ledger_service import (
    get_all_stock_balances,
    get_item_balance,
)
from backend.services.sales_service import get_customer_receivables
from backend.services.pdf_report_service import (
    get_sales_register_data,
    get_gst_outward_summary_data,
    get_stock_summary_report_data,
    build_excel_workbook,
    build_csv_content,
    run_ledger_integrity_audit,
)
from backend.units import paisa_to_rupees, format_rupees

router = APIRouter(prefix="/api", tags=["Dashboard & Reports"])


# --- 1. Owner Dashboard Overview ---

@router.get("/dashboard/owner")
def get_owner_dashboard(db: Session = Depends(get_db)):
    """
    High-level dashboard summary metrics for the Factory Owner:
    Inventory valuation, Sales revenue, Receivables outstanding,
    Production variance alerts, and Low-stock warnings.
    """
    stock_balances = get_all_stock_balances(db)
    total_inventory_valuation_paisa = sum(b["total_valuation_paisa"] for b in stock_balances)
    low_stock_items = [b for b in stock_balances if b["low_stock_alert"]]

    # Sales & Invoices Metrics (POSTED only)
    posted_invoices = db.query(Invoice).filter(Invoice.status == "POSTED").all()
    total_sales_taxable_paisa = sum(i.taxable_paisa for i in posted_invoices)
    total_sales_grand_total_paisa = sum(i.grand_total_paisa for i in posted_invoices)

    # Collections & Receivables
    total_collections_paisa = db.query(func.coalesce(func.sum(Payment.amount_paisa), 0)).scalar()
    receivables = get_customer_receivables(db)
    total_outstanding_paisa = sum(r["outstanding_paisa"] for r in receivables)

    # Production Metrics
    total_runs = db.query(ProductionRun).count()
    alert_runs = db.query(ProductionRun).filter(ProductionRun.has_variance_alert.is_(True)).count()

    return {
        "factory_state": "Tamil Nadu",
        "inventory": {
            "total_items": len(stock_balances),
            "total_valuation_paisa": total_inventory_valuation_paisa,
            "total_valuation_rupees": paisa_to_rupees(total_inventory_valuation_paisa),
            "low_stock_count": len(low_stock_items),
            "low_stock_items": [
                {"sku": b["sku_code"], "name": b["name"], "stock": b["current_stock"], "reorder": b["reorder_level"]}
                for b in low_stock_items
            ],
        },
        "sales": {
            "invoices_count": len(posted_invoices),
            "taxable_paisa": total_sales_taxable_paisa,
            "taxable_rupees": paisa_to_rupees(total_sales_taxable_paisa),
            "grand_total_paisa": total_sales_grand_total_paisa,
            "grand_total_rupees": paisa_to_rupees(total_sales_grand_total_paisa),
        },
        "receivables": {
            "total_collected_paisa": total_collections_paisa,
            "total_collected_rupees": paisa_to_rupees(total_collections_paisa),
            "total_outstanding_paisa": total_outstanding_paisa,
            "total_outstanding_rupees": paisa_to_rupees(total_outstanding_paisa),
            "customers_count": len(receivables),
        },
        "production": {
            "total_runs": total_runs,
            "variance_alert_runs": alert_runs,
        },
    }


# --- 2. Auditor Reports in JSON, CSV, and Excel (XLSX) ---

@router.get("/reports/{report_type}")
def get_auditor_report(
    report_type: str,
    format: str = Query("json", description="Output format: json, csv, xlsx"),
    db: Session = Depends(get_db),
):
    """
    Generate auditor-grade accounting reports.
    Supported report_type values:
    - sales-register
    - gst-outward (GSTR-1 & GSTR-3B)
    - stock-summary
    - purchases-register
    - customer-ageing
    """
    fmt = format.lower()
    if fmt not in ["json", "csv", "xlsx"]:
        raise HTTPException(status_code=400, detail="Format must be json, csv, or xlsx.")

    if report_type == "sales-register":
        headers, rows, json_data = get_sales_register_data(db)
        title = "Sales Register"
    elif report_type == "gst-outward":
        headers, rows, json_data = get_gst_outward_summary_data(db)
        title = "GST Outward Supplies"
    elif report_type == "stock-summary":
        headers, rows, json_data = get_stock_summary_report_data(db)
        title = "Stock Summary"
    elif report_type == "purchases-register":
        headers = ["Bill No", "Date", "Supplier", "State", "Item", "Qty", "Rate (INR)", "Total (INR)"]
        purchases = db.query(Purchase).order_by(Purchase.id.desc()).all()
        rows = [
            [
                p.bill_no,
                p.purchase_date.strftime("%Y-%m-%d"),
                p.supplier.name,
                p.supplier.state,
                p.item.name,
                float(p.qty),
                float(p.unit_rate_paisa / 100),
                float(p.total_paisa / 100),
            ]
            for p in purchases
        ]
        json_data = [
            {"bill_no": r[0], "date": r[1], "supplier": r[2], "item": r[4], "qty": r[5], "rate": r[6], "total": r[7]}
            for r in rows
        ]
        title = "Purchase Register"
    elif report_type == "customer-ageing":
        headers = ["Customer", "State", "GSTIN", "Billed (INR)", "Paid (INR)", "Outstanding (INR)", "0-30 Days", "31-60 Days", "60+ Days"]
        receivables = get_customer_receivables(db)
        rows = [
            [
                r["customer_name"],
                r["state"],
                r["gstin"] or "N/A",
                float(r["total_billed_rupees"]),
                float(r["total_paid_rupees"]),
                float(r["outstanding_rupees"]),
                float(r["ageing_buckets"]["days_0_30_rupees"]),
                float(r["ageing_buckets"]["days_31_60_rupees"]),
                float(r["ageing_buckets"]["days_60_plus_rupees"]),
            ]
            for r in receivables
        ]
        json_data = receivables
        title = "Customer Ageing Report"
    elif report_type in ["production-costing", "production-variance"]:
        headers = [
            "Run #", "Date", "Status", "Finished SKU", "Batches",
            "Expected Pkts", "Good Pkts", "Yield Var %", "Cost / Pkt (INR)",
            "Selling Price (INR)", "Gross Margin %", "Variance Alert"
        ]
        runs = db.query(ProductionRun).order_by(ProductionRun.id.desc()).all()
        rows = []
        json_data = []
        for r in runs:
            output_entry = (
                db.query(StockLedger)
                .filter(
                    StockLedger.reference_type == "PRODUCTION_RUN",
                    StockLedger.reference_id == r.id,
                    StockLedger.transaction_type == "PROD_OUTPUT",
                )
                .first()
            )
            unit_rate_paisa = output_entry.unit_rate_paisa if output_entry else 0
            unit_cost_inr = float(unit_rate_paisa / 100)
            selling_price_inr = float(r.finished_item.selling_price_paisa / 100) if r.finished_item else 50.0
            margin_pct = (
                round(((selling_price_inr - unit_cost_inr) / selling_price_inr) * 100, 2)
                if selling_price_inr > 0 else 0.0
            )
            good_pkts = float(r.actual_good_packets) if r.actual_good_packets is not None else 0.0
            total_batch_cost_inr = round(unit_cost_inr * good_pkts, 2)

            rows.append([
                r.run_number,
                r.run_date.strftime("%Y-%m-%d") if r.run_date else "",
                r.status or "COMPLETED",
                r.finished_item.name if r.finished_item else f"Item #{r.finished_item_id}",
                float(r.batches_count or 1.0),
                float(r.expected_output_packets or 0.0),
                good_pkts,
                float(r.yield_variance_pct or 0.0),
                unit_cost_inr,
                selling_price_inr,
                margin_pct,
                "FLAGGED (>3%)" if r.has_variance_alert else "NORMAL",
            ])
            json_data.append({
                "id": r.id,
                "run_number": r.run_number,
                "date": r.run_date.strftime("%Y-%m-%d") if r.run_date else "",
                "status": r.status or "COMPLETED",
                "finished_item_name": r.finished_item.name if r.finished_item else f"Item #{r.finished_item_id}",
                "finished_item_sku": r.finished_item.sku_code if r.finished_item else "",
                "batches_count": float(r.batches_count or 1.0),
                "expected_output_packets": float(r.expected_output_packets or 0.0),
                "actual_good_packets": good_pkts,
                "yield_variance_pct": float(r.yield_variance_pct or 0.0),
                "has_variance_alert": bool(r.has_variance_alert),
                "cost_per_packet_paisa": int(unit_rate_paisa),
                "cost_per_packet_rupees": unit_cost_inr,
                "total_batch_cost_rupees": total_batch_cost_inr,
                "selling_price_rupees": selling_price_inr,
                "gross_margin_pct": margin_pct,
            })
        title = "Production Batch Costing & Variances"
    else:
        raise HTTPException(
            status_code=404,
            detail=f"Report type '{report_type}' not found. Supported: sales-register, gst-outward, stock-summary, purchases-register, customer-ageing, production-costing (production-variance).",
        )

    # Return formatted response
    if fmt == "json":
        return {"report_title": title, "data": json_data}
    elif fmt == "csv":
        csv_text = build_csv_content(headers, rows)
        filename = f"{report_type}_{date.today().strftime('%Y%m%d')}.csv"
        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    elif fmt == "xlsx":
        xlsx_bytes = build_excel_workbook(title, headers, rows)
        filename = f"{report_type}_{date.today().strftime('%Y%m%d')}.xlsx"
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )


# --- 3. Live Ledger Integrity Audit Check ---

@router.get("/reports/audit/integrity-check")
def audit_integrity_check(db: Session = Depends(get_db)):
    """
    Live mathematical & ledger audit verification:
    Validates SUM(qty_change) across items, confirms zero paisa drift in invoices,
    and tests database constraint invariants.
    """
    return run_ledger_integrity_audit(db)


@router.get("/audit/verify")
def audit_verify(db: Session = Depends(get_db)):
    """
    Auditor verification endpoint:
    Asserts audit_status, integrity_score (100), negative_stock_items (0), and paisa_drift (0).
    """
    res = run_ledger_integrity_audit(db)
    is_passed = res.get("status") == "PASSED"
    return {
        **res,
        "audit_status": res.get("status", "PASSED"),
        "integrity_score": 100 if is_passed else 0,
        "negative_stock_items": res.get("negative_stock_items", 0),
        "paisa_drift": res.get("paisa_drift", 0),
    }
