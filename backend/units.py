"""
Pocket Ledger ERP - Unit Conversion and Financial Math Helpers
Strict Decimal arithmetic for quantities (avoiding IEEE 754 float drift)
and Integer paisa conversions for accounting invariants.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Union

# Standard decimal precision scale: 4 decimal places for weights & volumes
QTY_DECIMAL_PLACES = Decimal("0.0001")
CURRENCY_DECIMAL_PLACES = Decimal("0.01")

NumericInput = Union[Decimal, int, float, str]


def to_decimal(val: NumericInput) -> Decimal:
    """Safely convert any numeric input to a Decimal without float drift."""
    if isinstance(val, Decimal):
        return val
    return Decimal(str(val))


def quantize_qty(qty: NumericInput, precision: Decimal = QTY_DECIMAL_PLACES) -> Decimal:
    """Round a quantity to standard decimal precision (4 decimal places)."""
    return to_decimal(qty).quantize(precision, rounding=ROUND_HALF_UP)


# --- Unit Conversion Helpers ---

def grams_to_kg(grams: NumericInput) -> Decimal:
    """Convert grams to kilograms: 1000 g = 1 kg."""
    return quantize_qty(to_decimal(grams) / Decimal("1000"))


def kg_to_grams(kg: NumericInput) -> Decimal:
    """Convert kilograms to grams: 1 kg = 1000 g."""
    return quantize_qty(to_decimal(kg) * Decimal("1000"))


def ml_to_litres(ml: NumericInput) -> Decimal:
    """Convert millilitres to litres: 1000 ml = 1 L."""
    return quantize_qty(to_decimal(ml) / Decimal("1000"))


def litres_to_ml(litres: NumericInput) -> Decimal:
    """Convert litres to millilitres: 1 L = 1000 ml."""
    return quantize_qty(to_decimal(litres) * Decimal("1000"))


def packets_to_cartons(packets: NumericInput, carton_capacity: int = 20) -> Decimal:
    """Convert packet count to carton count based on carton capacity."""
    if carton_capacity <= 0:
        raise ValueError("Carton capacity must be greater than zero.")
    return quantize_qty(to_decimal(packets) / Decimal(carton_capacity))


def cartons_to_packets(cartons: NumericInput, carton_capacity: int = 20) -> Decimal:
    """Convert carton count to packet count based on carton capacity."""
    if carton_capacity <= 0:
        raise ValueError("Carton capacity must be greater than zero.")
    return quantize_qty(to_decimal(cartons) * Decimal(carton_capacity))


# --- Currency & Money Helpers ---

def paisa_to_rupees(paisa: int) -> Decimal:
    """
    Convert integer paisa to Decimal rupees.
    Example: 5000 paisa -> Decimal("50.00")
    """
    return (Decimal(paisa) / Decimal("100")).quantize(CURRENCY_DECIMAL_PLACES)


def rupees_to_paisa(rupees: NumericInput) -> int:
    """
    Convert decimal rupees to integer paisa using ROUND_HALF_UP.
    Example: Decimal("50.00") -> 5000
    """
    paisa_dec = (to_decimal(rupees) * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(paisa_dec)


def format_rupees(paisa: int) -> str:
    """Format integer paisa as a readable INR string (e.g. ₹50.00)."""
    return f"₹{paisa_to_rupees(paisa):,.2f}"
