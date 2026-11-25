"""
Pocket Ledger ERP - GST Engine & Sequential Document Numbering Service
NIT Tiruchirappalli CDI Winter Internship Specification

Enforces Pure Integer-Paisa GST Calculation:
- Factory State: Tamil Nadu (State Code: 33)
- Intra-State (Tamil Nadu): 50/50 split into CGST and SGST with exact integer conservation.
- Inter-State (e.g. Karnataka): 100% IGST, CGST=0, SGST=0.
- Financial Year Sequential Numbering (e.g. INV/26-27/0001, CN/26-27/0001, REC/26-27/0001).
"""

from datetime import date
from decimal import Decimal
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from backend.models import Invoice, CreditNote, Payment

# All 38 Districts of Tamil Nadu
TN_DISTRICTS = [
    "Ariyalur", "Chengalpattu", "Chennai", "Coimbatore", "Cuddalore",
    "Dharmapuri", "Dindigul", "Erode", "Kallakurichi", "Kancheepuram",
    "Kanniyakumari", "Karur", "Krishnagiri", "Madurai", "Mayiladuthurai",
    "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai",
    "Ramanathapuram", "Ranipet", "Salem", "Sivaganga", "Tenkasi",
    "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli",
    "Tirupathur", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur",
    "Vellore", "Viluppuram", "Virudhunagar",
]

# Factory Configuration
FACTORY_NAME = "Pocket Ledger Foods Pvt Ltd"
FACTORY_STATE = "Tamil Nadu"
FACTORY_STATE_CODE = "33"
FACTORY_GSTIN = "33AAACP0123M1Z8"
FACTORY_DISTRICT = "Karur"
FACTORY_ADDRESS = (
    "Plot 14-16, Food Processing Cluster, SIDCO Industrial Estate, "
    "Karur, Tamil Nadu 639004"
)


def get_factory_config() -> Dict[str, Any]:
    global FACTORY_NAME, FACTORY_STATE, FACTORY_STATE_CODE, FACTORY_GSTIN, FACTORY_DISTRICT, FACTORY_ADDRESS
    return {
        "factory_name": FACTORY_NAME,
        "factory_district": FACTORY_DISTRICT,
        "factory_state": FACTORY_STATE,
        "factory_state_code": FACTORY_STATE_CODE,
        "factory_gstin": FACTORY_GSTIN,
        "factory_address": FACTORY_ADDRESS,
        "tn_districts": TN_DISTRICTS,
    }


def set_factory_district(district: str) -> Dict[str, Any]:
    global FACTORY_DISTRICT, FACTORY_ADDRESS
    clean_district = district.strip()
    matched = next((d for d in TN_DISTRICTS if d.lower() == clean_district.lower()), None)
    if not matched:
        raise ValueError(f"Invalid Tamil Nadu district '{district}'. Must be one of the 38 TN districts.")
    FACTORY_DISTRICT = matched
    FACTORY_ADDRESS = f"Plot 14-16, Food Processing Cluster, SIDCO Industrial Estate, {matched}, Tamil Nadu"
    return get_factory_config()


def get_dispatch_route(
    destination_district: Optional[str],
    destination_state: str,
    destination_type: Optional[str] = None,
) -> str:
    """Compute dispatch route string, e.g. Karur → Tiruchirappalli (TN • CGST+SGST) or Karur → Tuticorin Port (Export • 0% LUT)"""
    origin = FACTORY_DISTRICT
    dest = (destination_district or "").strip()
    state_str = (destination_state or "").strip().lower()
    is_export = (
        (destination_type and destination_type.upper() == "EXPORT")
        or "export" in dest.lower()
        or "export" in state_str
        or "lut" in state_str
    )
    if is_export:
        return f"{origin} → {dest or 'Seaport'} (Export • 0% LUT)"

    is_intra = state_str == FACTORY_STATE.lower()
    if not dest:
        dest = destination_state.strip()
    state_code_map = {
        "tamil nadu": "TN",
        "karnataka": "KA",
        "kerala": "KL",
        "andhra pradesh": "AP",
        "telangana": "TS",
    }
    state_code = state_code_map.get(state_str, destination_state[:2].upper() if len(destination_state) >= 2 else "INT")
    tax_desc = "CGST+SGST" if is_intra else "IGST"
    return f"{origin} → {dest} ({state_code} • {tax_desc})"


def get_financial_year(target_date: Optional[date] = None) -> str:
    """
    Return Indian Financial Year string in 'YY-YY' format.
    Example:
        November 2026 -> '26-27'
        February 2027 -> '26-27'
        May 2027      -> '27-28'
    """
    if target_date is None:
        target_date = date.today()

    year = target_date.year
    month = target_date.month

    if month >= 4:
        start_yr = year % 100
        end_yr = (year + 1) % 100
    else:
        start_yr = (year - 1) % 100
        end_yr = year % 100

    return f"{start_yr:02d}-{end_yr:02d}"


def calculate_line_item_gst(
    taxable_paisa: int,
    gst_rate_bps: int,
    customer_state: str,
    destination_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Calculate GST components in integer paisa with exact parity.
    - If export (0% LUT): total_gst_paisa = 0, cgst = 0, sgst = 0, igst = 0.
    - If intra-state (Tamil Nadu): split total GST into CGST and SGST.
    - If inter-state: entire GST allocated to IGST.
    """
    if taxable_paisa < 0:
        raise ValueError("Taxable amount cannot be negative.")
    if gst_rate_bps < 0:
        raise ValueError("GST rate bps cannot be negative.")

    state_str = (customer_state or "").strip().lower()
    is_export = (
        (destination_type and destination_type.upper() == "EXPORT")
        or "export" in state_str
        or "lut" in state_str
    )

    if is_export:
        return {
            "is_intra_state": False,
            "is_export": True,
            "taxable_paisa": taxable_paisa,
            "gst_rate_bps": gst_rate_bps,
            "total_gst_paisa": 0,
            "cgst_paisa": 0,
            "sgst_paisa": 0,
            "igst_paisa": 0,
            "line_total_paisa": taxable_paisa,
        }

    # Total GST = taxable_paisa * gst_rate_bps / 10,000 (bps = 1/100 of 1%)
    # Using Decimal for intermediate exactness rounded half-up
    total_gst_paisa = int(
        round(Decimal(taxable_paisa) * Decimal(gst_rate_bps) / Decimal("10000"))
    )

    is_intra_state = state_str == FACTORY_STATE.lower()

    if is_intra_state:
        # Split equally: CGST = total // 2, SGST = remainder (ensures total conservation)
        cgst_paisa = total_gst_paisa // 2
        sgst_paisa = total_gst_paisa - cgst_paisa
        igst_paisa = 0
    else:
        cgst_paisa = 0
        sgst_paisa = 0
        igst_paisa = total_gst_paisa

    return {
        "is_intra_state": is_intra_state,
        "is_export": False,
        "taxable_paisa": taxable_paisa,
        "gst_rate_bps": gst_rate_bps,
        "total_gst_paisa": total_gst_paisa,
        "cgst_paisa": cgst_paisa,
        "sgst_paisa": sgst_paisa,
        "igst_paisa": igst_paisa,
        "line_total_paisa": taxable_paisa + total_gst_paisa,
    }


def generate_invoice_number(db: Session, target_date: Optional[date] = None) -> Tuple[str, str]:
    """
    Generate sequential invoice number: INV/YY-YY/XXXX
    Returns tuple of (invoice_number, financial_year).
    """
    fy = get_financial_year(target_date)
    existing_count = (
        db.query(Invoice)
        .filter(Invoice.financial_year == fy)
        .count()
    )
    next_seq = existing_count + 1
    invoice_num = f"INV/{fy}/{next_seq:04d}"
    return invoice_num, fy


def generate_credit_note_number(db: Session, target_date: Optional[date] = None) -> str:
    """Generate sequential credit note number: CN/YY-YY/XXXX"""
    fy = get_financial_year(target_date)
    existing_count = db.query(CreditNote).count()
    return f"CN/{fy}/{existing_count + 1:04d}"


def generate_receipt_number(db: Session, target_date: Optional[date] = None) -> str:
    """Generate sequential payment receipt number: REC/YY-YY/XXXX"""
    fy = get_financial_year(target_date)
    existing_count = db.query(Payment).count()
    return f"REC/{fy}/{existing_count + 1:04d}"
