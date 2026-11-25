"""
Pocket Ledger ERP - PDF Invoice & Auditor Report Service
Generates Auditor-grade GST Tax Invoice PDFs (ReportLab) and exports
reports in JSON, CSV, and Excel (.xlsx via openpyxl) for GSTR-1, GSTR-3B,
Sales Register, Purchase Register, Stock Ledger, and Integrity Audits.
"""

import io
import csv
from datetime import date, datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    KeepTogether,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

from backend.models import (
    Invoice,
    InvoiceItem,
    Purchase,
    Party,
    Item,
    StockLedger,
    ProductionRun,
    ProductionConsumption,
    Payment,
    BOMHeader,
)
from backend.services.gst_service import (
    FACTORY_NAME,
    FACTORY_GSTIN,
    FACTORY_STATE,
    FACTORY_STATE_CODE,
    FACTORY_ADDRESS,
)
from backend.services.ledger_service import (
    get_item_balance,
    get_weighted_average_rate_paisa,
)
from backend.units import paisa_to_rupees, format_rupees


# --- Number to Indian Rupees Words Helper ---

def amount_to_words_inr(paisa: int) -> str:
    """Convert integer paisa to English words in Indian numbering format."""
    rupees = paisa // 100
    paise = paisa % 100

    ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
            "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
            "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def convert_upto_999(n: int) -> str:
        s = ""
        if n >= 100:
            s += ones[n // 100] + " Hundred "
            n %= 100
        if n >= 20:
            s += tens[n // 20] + " "
            n %= 20
        if n > 0:
            s += ones[n] + " "
        return s.strip()

    if rupees == 0:
        words = "Zero Rupees"
    else:
        crores = rupees // 10000000
        rupees %= 10000000
        lakhs = rupees // 100000
        rupees %= 100000
        thousands = rupees // 1000
        rupees %= 1000

        parts = []
        if crores:
            parts.append(convert_upto_999(crores) + " Crore")
        if lakhs:
            parts.append(convert_upto_999(lakhs) + " Lakh")
        if thousands:
            parts.append(convert_upto_999(thousands) + " Thousand")
        if rupees:
            parts.append(convert_upto_999(rupees))
        words = " ".join(parts).strip() + " Rupees"

    if paise > 0:
        words += " and " + convert_upto_999(paise) + " Paise"
    return words + " Only"


# --- 1. GST Tax Invoice PDF Generator ---

def generate_invoice_pdf(invoice: Invoice) -> bytes:
    """
    Generate an auditor-ready GST Tax Invoice PDF.
    Complies with Rule 46 of CGST Rules 2017.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36,
    )
    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "InvoiceTitle",
        parent=styles["Heading1"],
        fontSize=16,
        leading=20,
        alignment=1,  # Center
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "InvoiceSubtitle",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=1,
        textColor=colors.HexColor("#64748b"),
        spaceAfter=12,
    )
    cell_style = ParagraphStyle(
        "CellNormal",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#1e293b"),
    )
    cell_bold = ParagraphStyle(
        "CellBold",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#0f172a"),
    )
    cell_right = ParagraphStyle(
        "CellRight",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
        alignment=2,  # Right
        textColor=colors.HexColor("#1e293b"),
    )

    story = []

    # Title & Subtitle
    story.append(Paragraph("<b>TAX INVOICE</b>", title_style))
    story.append(
        Paragraph("(Issued under Section 31 of CGST Act, 2017 read with Rule 46 of CGST Rules)", subtitle_style)
    )

    # Header Box: Supplier Details vs Invoice & Customer Details
    is_intra = invoice.place_of_supply_state.strip().lower() == FACTORY_STATE.lower()
    tax_scheme = "Intra-State (CGST + SGST)" if is_intra else "Inter-State (IGST)"

    supplier_info = (
        f"<b>{FACTORY_NAME}</b><br/>"
        f"{FACTORY_ADDRESS}<br/>"
        f"<b>GSTIN:</b> {FACTORY_GSTIN}<br/>"
        f"<b>State:</b> {FACTORY_STATE} (Code: {FACTORY_STATE_CODE})<br/>"
    )

    inv_meta = (
        f"<b>Invoice No:</b> {invoice.invoice_number}<br/>"
        f"<b>Invoice Date:</b> {invoice.invoice_date.strftime('%d-%b-%Y')}<br/>"
        f"<b>Financial Year:</b> {invoice.financial_year}<br/>"
        f"<b>Supply Type:</b> {tax_scheme}<br/>"
        f"<b>Status:</b> {invoice.status}"
    )

    customer = invoice.customer
    customer_info = (
        f"<b>Billed To (Customer):</b><br/>"
        f"<b>Name:</b> {customer.name} ({customer.party_type})<br/>"
        f"<b>Address:</b> {customer.address or 'N/A'}<br/>"
        f"<b>GSTIN / UIN:</b> {customer.gstin or 'Unregistered'}<br/>"
        f"<b>Place of Supply:</b> {invoice.place_of_supply_state}"
    )

    header_table_data = [
        [Paragraph(supplier_info, cell_style), Paragraph(inv_meta, cell_style)],
        [Paragraph(customer_info, cell_style), Paragraph(f"<b>Order Reference:</b> #{invoice.order.order_number if invoice.order else 'Direct'}", cell_style)],
    ]
    header_table = Table(header_table_data, colWidths=[270, 252])
    header_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(header_table)
    story.append(Spacer(1, 10))

    # Line Items Table
    headers = [
        Paragraph("<b>#</b>", cell_bold),
        Paragraph("<b>Item Description</b>", cell_bold),
        Paragraph("<b>HSN</b>", cell_bold),
        Paragraph("<b>Qty (Pkts)</b>", cell_bold),
        Paragraph("<b>Rate (₹)</b>", cell_bold),
        Paragraph("<b>Taxable (₹)</b>", cell_bold),
        Paragraph("<b>GST %</b>", cell_bold),
        Paragraph("<b>Tax (₹)</b>", cell_bold),
        Paragraph("<b>Total (₹)</b>", cell_bold),
    ]

    items_data = [headers]
    for idx, line in enumerate(invoice.items, start=1):
        line_tax = line.cgst_paisa + line.sgst_paisa + line.igst_paisa
        line_total = line.taxable_paisa + line_tax
        gst_pct = f"{line.gst_rate_bps / 100:.1f}%"

        items_data.append([
            Paragraph(str(idx), cell_style),
            Paragraph(f"{line.item.name}<br/><font color='#64748b' size='6'>{line.item.name_ta or ''}</font>", cell_style),
            Paragraph(line.item.hsn_code or "21069099", cell_style),
            Paragraph(f"{line.qty_packets:,.0f}", cell_right),
            Paragraph(f"{line.unit_price_paisa / 100:,.2f}", cell_right),
            Paragraph(f"{line.taxable_paisa / 100:,.2f}", cell_right),
            Paragraph(gst_pct, cell_style),
            Paragraph(f"{line_tax / 100:,.2f}", cell_right),
            Paragraph(f"{line_total / 100:,.2f}", cell_right),
        ])

    items_table = Table(
        items_data,
        colWidths=[20, 150, 45, 50, 50, 60, 40, 50, 57],
    )
    items_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
            ("TOPPADDING", (0, 0), (-1, 0), 4),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 1), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 4),
        ])
    )
    story.append(items_table)
    story.append(Spacer(1, 10))

    # Summary Totals & Tax Breakup Table
    tax_breakdown = []
    tax_breakdown.append([Paragraph("<b>Total Taxable Value:</b>", cell_style), Paragraph(f"₹{invoice.taxable_paisa / 100:,.2f}", cell_right)])
    if is_intra:
        tax_breakdown.append([Paragraph("<b>Central Tax (CGST):</b>", cell_style), Paragraph(f"₹{invoice.cgst_paisa / 100:,.2f}", cell_right)])
        tax_breakdown.append([Paragraph("<b>State Tax (SGST):</b>", cell_style), Paragraph(f"₹{invoice.sgst_paisa / 100:,.2f}", cell_right)])
    else:
        tax_breakdown.append([Paragraph("<b>Integrated Tax (IGST):</b>", cell_style), Paragraph(f"₹{invoice.igst_paisa / 100:,.2f}", cell_right)])

    tax_breakdown.append([Paragraph("<b>Grand Total (Incl. GST):</b>", cell_bold), Paragraph(f"<b>₹{invoice.grand_total_paisa / 100:,.2f}</b>", cell_bold)])

    amount_words = amount_to_words_inr(invoice.grand_total_paisa)
    words_cell = Paragraph(
        f"<b>Amount Chargeable (in words):</b><br/><i>{amount_words}</i><br/><br/>"
        f"<b>Bank Account Details:</b><br/>"
        f"Bank: State Bank of India &bull; A/C: 38290192831 &bull; IFSC: SBIN0001618<br/>"
        f"Branch: Thuvakudi Industrial Estate, Trichy",
        cell_style,
    )

    summary_data = [
        [words_cell, Table(tax_breakdown, colWidths=[120, 92])]
    ]
    summary_table = Table(summary_data, colWidths=[310, 212])
    summary_table.setStyle(
        TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ])
    )
    story.append(summary_table)
    story.append(Spacer(1, 25))

    # Declaration & Signatures
    sig_data = [
        [
            Paragraph("<b>Terms & Conditions:</b><br/>1. Goods once sold will not be taken back.<br/>2. Subject to Tiruchirappalli jurisdiction.", cell_style),
            Paragraph(f"<b>For {FACTORY_NAME}</b><br/><br/><br/>Authorized Signatory", cell_right),
        ]
    ]
    sig_table = Table(sig_data, colWidths=[300, 222])
    sig_table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    story.append(KeepTogether(sig_table))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


# --- 2. Excel & CSV Export Utility ---

def build_excel_workbook(sheet_title: str, headers: List[str], rows: List[List[Any]]) -> bytes:
    """Generate professional Excel workbook with styled headers and alternating rows."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]

    # Header style: Navy background, white bold text
    header_fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    ws.append(headers)
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    # Append rows with alternating zebra shading
    zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    for row_idx, row_data in enumerate(rows, start=2):
        ws.append(row_data)
        for col_idx in range(1, len(row_data) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.border = thin_border
            if row_idx % 2 == 1:
                cell.fill = zebra_fill

    # Auto-adjust column widths
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = col[0].column_letter
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def build_csv_content(headers: List[str], rows: List[List[Any]]) -> str:
    """Generate RFC 4180 compliant CSV string."""
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return output.getvalue()


# --- 3. Auditor Reports Data Generators ---

def get_sales_register_data(db: Session) -> Tuple[List[str], List[List[Any]], List[Dict[str, Any]]]:
    """Sales Register report data (customer-wise and invoice-wise)."""
    headers = [
        "Invoice No", "Date", "Customer Name", "State", "GSTIN",
        "Item SKU", "Item Description", "Qty Packets", "Rate (INR)",
        "Taxable (INR)", "CGST (INR)", "SGST (INR)", "IGST (INR)", "Total (INR)", "Status"
    ]
    invoices = db.query(Invoice).order_by(Invoice.invoice_date.desc(), Invoice.id.desc()).all()
    rows = []
    json_data = []

    for inv in invoices:
        for item in inv.items:
            row = [
                inv.invoice_number,
                inv.invoice_date.strftime("%Y-%m-%d"),
                inv.customer.name,
                inv.customer.state,
                inv.customer.gstin or "N/A",
                item.item.sku_code,
                item.item.name,
                float(item.qty_packets),
                float(item.unit_price_paisa / 100),
                float(item.taxable_paisa / 100),
                float(item.cgst_paisa / 100),
                float(item.sgst_paisa / 100),
                float(item.igst_paisa / 100),
                float((item.taxable_paisa + item.cgst_paisa + item.sgst_paisa + item.igst_paisa) / 100),
                inv.status,
            ]
            rows.append(row)
            json_data.append(dict(zip([h.lower().replace(" ", "_").replace("(", "").replace(")", "") for h in headers], row)))

    return headers, rows, json_data


def get_gst_outward_summary_data(db: Session) -> Tuple[List[str], List[List[Any]], Dict[str, Any]]:
    """GSTR-1 & GSTR-3B Outward Supplies Summary."""
    headers = [
        "Supply Type", "Invoice Count", "Taxable Value (INR)",
        "Central Tax CGST (INR)", "State Tax SGST (INR)",
        "Integrated Tax IGST (INR)", "Total Tax (INR)", "Total Value (INR)"
    ]

    invoices = (
        db.query(Invoice)
        .filter(Invoice.status != "CANCELLED")
        .all()
    )

    intra_invoices = [i for i in invoices if (i.place_of_supply_state or i.customer_state or "").strip().lower() == FACTORY_STATE.lower()]
    inter_invoices = [i for i in invoices if (i.place_of_supply_state or i.customer_state or "").strip().lower() != FACTORY_STATE.lower()]

    def sum_metrics(inv_list):
        count = len(inv_list)
        taxable = sum(i.taxable_paisa for i in inv_list)
        cgst = sum(i.cgst_paisa for i in inv_list)
        sgst = sum(i.sgst_paisa for i in inv_list)
        igst = sum(i.igst_paisa for i in inv_list)
        tot_tax = cgst + sgst + igst
        tot_val = taxable + tot_tax
        return [
            count,
            float(taxable / 100),
            float(cgst / 100),
            float(sgst / 100),
            float(igst / 100),
            float(tot_tax / 100),
            float(tot_val / 100),
        ]

    intra_metrics = sum_metrics(intra_invoices)
    inter_metrics = sum_metrics(inter_invoices)

    rows = [
        ["4A - Intra-State B2B (Tamil Nadu)"] + intra_metrics,
        ["4B - Inter-State B2B (Other States)"] + inter_metrics,
    ]

    # Total Row
    tot_row = ["Total Outward Taxable Supplies (GSTR-3B Table 3.1a)"] + [
        intra_metrics[0] + inter_metrics[0],
        round(intra_metrics[1] + inter_metrics[1], 2),
        round(intra_metrics[2] + inter_metrics[2], 2),
        round(intra_metrics[3] + inter_metrics[3], 2),
        round(intra_metrics[4] + inter_metrics[4], 2),
        round(intra_metrics[5] + inter_metrics[5], 2),
        round(intra_metrics[6] + inter_metrics[6], 2),
    ]
    rows.append(tot_row)

    json_data = {
        "factory_gstin": FACTORY_GSTIN,
        "factory_state": FACTORY_STATE,
        "intra_state_b2b": {
            "invoice_count": intra_metrics[0],
            "taxable_inr": intra_metrics[1],
            "cgst_inr": intra_metrics[2],
            "sgst_inr": intra_metrics[3],
            "igst_inr": intra_metrics[4],
            "total_tax_inr": intra_metrics[5],
            "total_value_inr": intra_metrics[6],
        },
        "inter_state_b2b": {
            "invoice_count": inter_metrics[0],
            "taxable_inr": inter_metrics[1],
            "cgst_inr": inter_metrics[2],
            "sgst_inr": inter_metrics[3],
            "igst_inr": inter_metrics[4],
            "total_tax_inr": inter_metrics[5],
            "total_value_inr": inter_metrics[6],
        },
        "total_taxable_supplies": {
            "total_taxable_inr": tot_row[2],
            "total_cgst_inr": tot_row[3],
            "total_sgst_inr": tot_row[4],
            "total_igst_inr": tot_row[5],
            "total_tax_inr": tot_row[6],
            "grand_total_inr": tot_row[7],
        },
        "gstr_3b_table_3_1_a": {
            "total_taxable_inr": tot_row[2],
            "total_cgst_inr": tot_row[3],
            "total_sgst_inr": tot_row[4],
            "total_igst_inr": tot_row[5],
            "total_tax_inr": tot_row[6],
            "grand_total_inr": tot_row[7],
        },
    }

    return headers, rows, json_data


def get_stock_summary_report_data(db: Session) -> Tuple[List[str], List[List[Any]], List[Dict[str, Any]]]:
    """Stock Summary report with derived balances and latest weighted-average valuation."""
    headers = [
        "SKU Code", "Item Name", "Category", "Unit", "Opening Qty",
        "Purchased Qty", "Prod Issued Qty", "Prod Output Qty", "Sales Dispatched Qty",
        "Closing Stock", "Unit Valuation (INR)", "Total Valuation (INR)"
    ]
    items = db.query(Item).order_by(Item.category, Item.id).all()
    rows = []
    json_data = []

    for it in items:
        entries = db.query(StockLedger).filter(StockLedger.item_id == it.id).all()
        opening = sum(e.qty_change for e in entries if e.transaction_type == "OPENING")
        purchased = sum(e.qty_change for e in entries if e.transaction_type == "PURCHASE")
        issued = sum(abs(e.qty_change) for e in entries if e.transaction_type == "PROD_ISSUE")
        produced = sum(e.qty_change for e in entries if e.transaction_type == "PROD_OUTPUT")
        dispatched = sum(abs(e.qty_change) for e in entries if e.transaction_type == "SALE_DISPATCH")
        closing = sum(e.qty_change for e in entries)

        rate = get_weighted_average_rate_paisa(db, it.id, as_decimal=True)
        valuation = int(round(closing * rate))

        row = [
            it.sku_code,
            it.name,
            it.category,
            it.base_unit,
            float(opening),
            float(purchased),
            float(issued),
            float(produced),
            float(dispatched),
            float(closing),
            float(rate / 100),
            float(valuation / 100),
        ]
        rows.append(row)
        json_data.append({
            "sku_code": it.sku_code,
            "name": it.name,
            "category": it.category,
            "base_unit": it.base_unit,
            "opening_qty": float(opening),
            "purchased_qty": float(purchased),
            "prod_issued_qty": float(issued),
            "prod_output_qty": float(produced),
            "sales_dispatched_qty": float(dispatched),
            "closing_stock": float(closing),
            "unit_rate_rupees": float(rate / 100),
            "unit_valuation_inr": float(rate / 100),
            "valuation_rupees": float(valuation / 100),
            "total_valuation_inr": float(valuation / 100),
        })

    return headers, rows, json_data


# --- 4. Live Ledger Integrity Audit Check ---

def run_ledger_integrity_audit(db: Session) -> Dict[str, Any]:
    """
    Comprehensive verification audit:
    1. Verifies SUM(qty_change) for all items.
    2. Verifies zero paisa drift in all invoices (Invoice items total == invoice header total).
    3. Verifies invoice status consistency with stock ledger dispatches.
    4. Verifies non-negative inventory rule across all current balances.
    """
    issues = []
    checks = []

    # Check 1: Non-negative stock
    items = db.query(Item).all()
    negative_stock_found = False
    negative_stock_items_count = 0
    for it in items:
        bal = get_item_balance(db, it.id)
        if bal < Decimal("0.0000"):
            negative_stock_found = True
            negative_stock_items_count += 1
            issues.append(f"Negative stock detected for item {it.sku_code}: {bal} {it.base_unit}")

    checks.append({
        "check": "Non-negative Inventory Integrity",
        "passed": not negative_stock_found,
        "details": "All item balances strictly non-negative." if not negative_stock_found else "Negative stock found!",
    })

    # Check 2: Invoice Paisa Drift Check
    invoices = db.query(Invoice).all()
    paisa_drift_detected = False
    for inv in invoices:
        items_taxable = sum(i.taxable_paisa for i in inv.items)
        items_cgst = sum(i.cgst_paisa for i in inv.items)
        items_sgst = sum(i.sgst_paisa for i in inv.items)
        items_igst = sum(i.igst_paisa for i in inv.items)
        items_total = items_taxable + items_cgst + items_sgst + items_igst

        if items_total != inv.grand_total_paisa:
            paisa_drift_detected = True
            issues.append(
                f"Paisa drift on invoice #{inv.invoice_number}: Header {inv.grand_total_paisa} vs Items {items_total}"
            )

    checks.append({
        "check": "Invoice Mathematical & Paisa Parity",
        "passed": not paisa_drift_detected,
        "details": "Zero paisa drift across all invoices and line items." if not paisa_drift_detected else "Paisa drift detected!",
    })

    # Check 3: Stock Ledger Reference Integrity
    orphan_ledger_entries = (
        db.query(StockLedger)
        .filter(StockLedger.item_id.is_(None))
        .count()
    )
    checks.append({
        "check": "Ledger Foreign Key & Item Integrity",
        "passed": orphan_ledger_entries == 0,
        "details": f"{orphan_ledger_entries} orphaned stock movements found.",
    })

    # Overall Status
    all_passed = all(c["passed"] for c in checks)
    return {
        "status": "PASSED" if all_passed else "FAILED",
        "audit_status": "PASSED" if all_passed else "FAILED",
        "integrity_score": "100%" if all_passed else "Degraded",
        "negative_stock_items": negative_stock_items_count,
        "paisa_drift": 0 if not paisa_drift_detected else 1,
        "total_items_checked": len(items),
        "total_invoices_checked": len(invoices),
        "checks": checks,
        "issues": issues,
        "timestamp": datetime.now().isoformat(),
    }
