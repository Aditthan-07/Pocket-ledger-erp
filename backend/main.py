"""
Pocket Ledger ERP - FastAPI Main Application Entry Point
NIT Tiruchirappalli CDI Winter Internship Specification
"""

import sys
from pathlib import Path
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Dict, Any

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.database import get_db, init_db
from backend.models import (
    User,
    Party,
    Item,
    BOMHeader,
    StockLedger,
    StockTransactionType,
    AuditLog,
)
from backend.schemas import (
    UserResponse,
    PartyResponse,
    PartyCreate,
    ItemResponse,
    BOMHeaderResponse,
    OpeningSummaryResponse,
    OpeningItemSummary,
)
from backend.units import paisa_to_rupees, format_rupees
from backend.routers.inventory_production import router as inventory_production_router
from backend.routers.sales_billing import router as sales_billing_router
from backend.routers.reports_dashboard import router as reports_dashboard_router

app = FastAPI(
    title="Pocket Ledger API",
    version="1.0.0",
    description="Production-grade Order-to-Audit ERP Prototype for South Indian Packaged Snacks Manufacturing",
)

# Enable CORS for frontend Vite development server and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits all origins during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Modular Routers
app.include_router(inventory_production_router)
app.include_router(sales_billing_router)
app.include_router(reports_dashboard_router)


@app.on_event("startup")
def on_startup():
    """Ensure database tables exist on server startup."""
    init_db()


@app.get("/api/health", tags=["System"])
def health_check(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Health check endpoint to verify database connectivity and system status."""
    try:
        # Verify DB connection with a simple scalar query
        db.execute(func.now()).scalar()
        db_status = "connected"
    except Exception as exc:
        db_status = f"unhealthy: {exc}"

    return {
        "status": "ok",
        "app_title": "Pocket Ledger API",
        "factory_state": "Tamil Nadu",
        "database": db_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "1.0.0",
    }


@app.get("/api/master/opening-summary", response_model=OpeningSummaryResponse, tags=["Master Data"])
def get_opening_summary(db: Session = Depends(get_db)):
    """
    Retrieve Section 5 Benchmark Master Data and Ledger Opening Balances.
    Verifies the immutable stock ledger invariant:
    Stock is never read from a mutable item column; it is always derived via SUM(qty_change).
    """
    users_count = db.query(User).count()
    parties_count = db.query(Party).count()
    items = db.query(Item).order_by(Item.id).all()
    boms_count = db.query(BOMHeader).count()
    stock_entries_count = db.query(StockLedger).count()

    total_opening_valuation_paisa = 0
    item_summaries: List[OpeningItemSummary] = []

    for item in items:
        # Invariant: Derive current stock strictly from SUM(qty_change)
        stock_sum = (
            db.query(func.coalesce(func.sum(StockLedger.qty_change), Decimal("0.0000")))
            .filter(StockLedger.item_id == item.id)
            .scalar()
        )

        # Retrieve benchmark opening entry
        opening_entry = (
            db.query(StockLedger)
            .filter(
                StockLedger.item_id == item.id,
                StockLedger.transaction_type == StockTransactionType.OPENING.value,
                StockLedger.reference_type == "OPENING_BALANCE",
            )
            .first()
        )

        opening_qty = opening_entry.qty_change if opening_entry else Decimal("0.0000")
        opening_rate = opening_entry.unit_rate_paisa if opening_entry and opening_entry.unit_rate_paisa else 0
        valuation_paisa = int(opening_qty * opening_rate)
        total_opening_valuation_paisa += valuation_paisa

        item_summaries.append(
            OpeningItemSummary(
                sku_code=item.sku_code,
                name=item.name,
                name_ta=item.name_ta,
                category=item.category,
                base_unit=item.base_unit,
                opening_qty=opening_qty,
                current_stock=Decimal(str(stock_sum)),
                opening_unit_rate_paisa=opening_rate,
                opening_unit_rate_rupees=paisa_to_rupees(opening_rate),
                opening_valuation_paisa=valuation_paisa,
                opening_valuation_rupees=paisa_to_rupees(valuation_paisa),
                reorder_level=item.reorder_level,
            )
        )

    return OpeningSummaryResponse(
        factory_state="Tamil Nadu",
        users_count=users_count,
        parties_count=parties_count,
        items_count=len(items),
        bom_recipes_count=boms_count,
        stock_ledger_entries_count=stock_entries_count,
        total_opening_valuation_paisa=total_opening_valuation_paisa,
        total_opening_valuation_rupees=paisa_to_rupees(total_opening_valuation_paisa),
        items=item_summaries,
    )


@app.get("/api/master/users", response_model=List[UserResponse], tags=["Master Data"])
def list_users(db: Session = Depends(get_db)):
    """List all registered system users."""
    return db.query(User).order_by(User.id).all()


@app.get("/api/master/parties", response_model=List[PartyResponse], tags=["Master Data"])
def list_parties(db: Session = Depends(get_db)):
    """List all parties (Customers & Suppliers)."""
    return db.query(Party).order_by(Party.id).all()


@app.post("/api/master/parties", response_model=PartyResponse, tags=["Master Data"])
def create_party(party_in: PartyCreate, db: Session = Depends(get_db)):
    """Create a new party (Retailer, Distributor, Supplier) with Tamil Nadu district."""
    party = Party(
        name=party_in.name,
        party_type=party_in.party_type.value if hasattr(party_in.party_type, "value") else str(party_in.party_type),
        gstin=party_in.gstin,
        state=party_in.state,
        district=party_in.district or party_in.city,
        address=party_in.address,
    )
    db.add(party)
    db.commit()
    db.refresh(party)
    return party


@app.get("/api/master/items", response_model=List[ItemResponse], tags=["Master Data"])
def list_items(db: Session = Depends(get_db)):
    """List all items across RAW_MATERIAL, PACKAGING, and FINISHED_GOOD categories."""
    return db.query(Item).order_by(Item.id).all()


@app.get("/api/master/boms", response_model=List[BOMHeaderResponse], tags=["Master Data"])
def list_boms(db: Session = Depends(get_db)):
    """List all Bill of Materials recipes with ingredients and finished SKU mappings."""
    return db.query(BOMHeader).order_by(BOMHeader.id).all()


# --- Production SPA Serving (All-in-One Evaluator Deployment) ---
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DIST_DIR = BASE_DIR / "frontend" / "dist"
if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    if (DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Allow API routes, docs, and schema to pass through
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            raise HTTPException(status_code=404, detail="API endpoint not found.")
        file_path = DIST_DIR / full_path
        if full_path and file_path.is_file() and not file_path.name == "index.html":
            return FileResponse(file_path)
        return FileResponse(
            DIST_DIR / "index.html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

