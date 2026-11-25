"""
Pocket Ledger ERP - Idempotent Benchmark Seed Script (Section 5 Master Data)
NIT Tiruchirappalli CDI Winter Internship Specification

Seeds:
1. Factory State: Tamil Nadu
2. Default Users with roles and bcrypt hashes (salesman_a, salesman_b, admin, supervisor, auditor, owner)
3. Benchmark Parties (Retailer A, Distributor B, Default Agro Suppliers)
4. Items with Tamil names and strict Decimal quantities / integer paisa pricing
5. Immutable Opening Stock entries in stock_ledger (no mutable current_stock column!)
6. Decoupled Base Dough Recipe (BOM-MRK-BASE) and SKU mapping for Murukku 200g

Run directly:
    python backend/seed.py
"""

import sys
from pathlib import Path
from decimal import Decimal
import bcrypt

# Ensure project root is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from backend.database import SessionLocal, init_db
from backend.models import (
    User,
    UserRole,
    Party,
    PartyType,
    Item,
    ItemCategory,
    BOMHeader,
    BOMIngredient,
    BOMSKUMapping,
    StockLedger,
    StockTransactionType,
    SalesOrder,
    SalesOrderItem,
    Invoice,
    InvoiceItem,
    CreditNote,
    Payment,
    ProductionRun,
    ProductionConsumption,
    Purchase,
    AuditLog,
)
from backend.units import paisa_to_rupees, format_rupees
from backend.services.gst_service import set_factory_district


def clean_database(db, verbose: bool = True):
    """
    Purge all transactional test data (orders, invoices, payments, production runs, stock movements).
    Restores the database to pure master data with exact Section 5 opening balances.
    """
    if verbose:
        print(" [*] Purging test orders, invoices, payments, production runs, and stock movements...")

    # Child tables first
    db.query(Payment).delete()
    db.query(CreditNote).delete()
    db.query(InvoiceItem).delete()
    db.query(Invoice).delete()
    db.query(SalesOrderItem).delete()
    db.query(SalesOrder).delete()
    db.query(ProductionConsumption).delete()
    db.query(ProductionRun).delete()
    db.query(Purchase).delete()
    db.query(StockLedger).delete()
    db.query(AuditLog).filter(AuditLog.action != "BENCHMARK_SEED").delete()
    db.commit()
    if verbose:
        print(" [OK] Purged all test orders, invoices, payments, production runs, and stock movements.")


def hash_password(password: str) -> str:
    """Generate secure bcrypt password hash."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def seed_database(verbose: bool = True, clean_transactions: bool = False) -> dict:
    """
    Idempotent seed function for Section 5 Master Data.
    Can be run repeatedly without duplicating or corrupting records.
    When clean_transactions=True, purges all test orders, invoices, payments,
    production runs, and stock movements before seeding pure opening balances.
    """
    # 1. Initialize schema
    init_db()
    set_factory_district("Karur")
    db = SessionLocal()

    if clean_transactions:
        clean_database(db, verbose=verbose)

    stats = {
        "users": 0,
        "parties": 0,
        "items": 0,
        "bom_recipes": 0,
        "stock_entries": 0,
        "total_valuation_paisa": 0,
    }

    try:
        # --- 2. Seed Users ---
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
            user = db.query(User).filter(User.username == username).first()
            if not user:
                user = User(
                    username=username,
                    full_name=full_name,
                    password_hash=hash_password("demo123"),
                    role=role,
                    is_active=True,
                )
                db.add(user)
                db.flush()
                stats["users"] += 1
                if verbose:
                    print(f" [+] Created user: {username} ({role})")
            else:
                if verbose:
                    print(f" [=] User exists: {username} ({role})")
            seeded_users[username] = user

        admin_id = seeded_users["admin"].id

        # --- 3. Seed Parties ---
        parties_data = [
            {
                "name": "Retailer A",
                "party_type": PartyType.RETAILER.value,
                "gstin": "33AABCR1234A1Z5",
                "state": "Tamil Nadu",
                "district": "Tiruchirappalli",
                "address": "12 West Veli Street, Tiruchirappalli, Tamil Nadu 620001",
            },
            {
                "name": "Distributor B",
                "party_type": PartyType.DISTRIBUTOR.value,
                "gstin": "29AABCD5678B1Z9",
                "state": "Karnataka",
                "district": "Bengaluru",
                "address": "45 Industrial Layout, Yeshwanthpur, Bengaluru, Karnataka 560022",
            },
            {
                "name": "Chennai Metro Distributors",
                "party_type": PartyType.DISTRIBUTOR.value,
                "gstin": "33AABCC8765E1Z7",
                "state": "Tamil Nadu",
                "district": "Chennai",
                "address": "108 Anna Salai, Chennai, Tamil Nadu 600002",
            },
            {
                "name": "Default Agro Suppliers",
                "party_type": PartyType.SUPPLIER.value,
                "gstin": "33AABCS9999C1Z1",
                "state": "Tamil Nadu",
                "district": "Karur",
                "address": "55 Kovai Road, Karur, Tamil Nadu 639002",
            },
            {
                "name": "Kerala Spice & Snacks Distributors",
                "party_type": PartyType.DISTRIBUTOR.value,
                "gstin": "32AABCK4321D1Z2",
                "state": "Kerala",
                "district": "Kochi",
                "address": "Marine Drive, Kochi, Kerala 682031",
            },
            {
                "name": "Andhra Coastal Distributors",
                "party_type": PartyType.DISTRIBUTOR.value,
                "gstin": "37AABCA6543F1Z8",
                "state": "Andhra Pradesh",
                "district": "Vijayawada",
                "address": "Besant Road, Governorpet, Vijayawada, Andhra Pradesh 520002",
            },
            {
                "name": "Telangana Metro Distributors",
                "party_type": PartyType.DISTRIBUTOR.value,
                "gstin": "36AABCT9876G1Z4",
                "state": "Telangana",
                "district": "Hyderabad",
                "address": "MG Road, Secunderabad, Hyderabad, Telangana 500003",
            },
        ]

        seeded_parties = {}
        for pdata in parties_data:
            party = db.query(Party).filter(Party.name == pdata["name"]).first()
            if not party:
                party = Party(
                    name=pdata["name"],
                    party_type=pdata["party_type"],
                    gstin=pdata["gstin"],
                    state=pdata["state"],
                    district=pdata.get("district"),
                    address=pdata["address"],
                )
                db.add(party)
                db.flush()
                stats["parties"] += 1
                if verbose:
                    print(f" [+] Created party: {pdata['name']} ({pdata['party_type']} - {pdata['district'] or ''}, {pdata['state']})")
            else:
                party.party_type = pdata["party_type"]
                party.district = pdata.get("district")
                party.state = pdata["state"]
                party.gstin = pdata["gstin"]
                party.address = pdata["address"]
                db.flush()
                if verbose:
                    print(f" [=] Party updated: {pdata['name']} ({party.party_type} - {party.district}, {party.state})")
            seeded_parties[pdata["name"]] = party

        # --- 4. Seed Items & Opening Stock ---
        items_data = [
            {
                "sku_code": "RM-FLOUR-01",
                "name": "Flour",
                "name_ta": "அரிசி மாவு",
                "category": ItemCategory.RAW_MATERIAL.value,
                "base_unit": "kg",
                "pack_weight_grams": None,
                "carton_capacity": None,
                "hsn_code": "110290",
                "gst_rate_bps": 0,
                "selling_price_paisa": 0,
                "reorder_level": Decimal("30.0000"),
                "opening_qty": Decimal("100.0000"),
                "unit_rate_paisa": 4200,  # ₹42.00 / kg
            },
            {
                "sku_code": "RM-OIL-01",
                "name": "Cooking Oil",
                "name_ta": "சமையல் எண்ணெய்",
                "category": ItemCategory.RAW_MATERIAL.value,
                "base_unit": "litre",
                "pack_weight_grams": None,
                "carton_capacity": None,
                "hsn_code": "151219",
                "gst_rate_bps": 500,
                "selling_price_paisa": 0,
                "reorder_level": Decimal("10.0000"),
                "opening_qty": Decimal("30.0000"),
                "unit_rate_paisa": 14000,  # ₹140.00 / L
            },
            {
                "sku_code": "RM-SPICE-01",
                "name": "Salt and Spice Mix",
                "name_ta": "உப்பு மற்றும் மசாலா கலவை",
                "category": ItemCategory.RAW_MATERIAL.value,
                "base_unit": "kg",
                "pack_weight_grams": None,
                "carton_capacity": None,
                "hsn_code": "210390",
                "gst_rate_bps": 500,
                "selling_price_paisa": 0,
                "reorder_level": Decimal("2.0000"),
                "opening_qty": Decimal("5.0000"),
                "unit_rate_paisa": 20000,  # ₹200.00 / kg
            },
            {
                "sku_code": "PKG-POUCH-200G",
                "name": "200g Pouch",
                "name_ta": "200கி பை",
                "category": ItemCategory.PACKAGING.value,
                "base_unit": "piece",
                "pack_weight_grams": None,
                "carton_capacity": None,
                "hsn_code": "392321",
                "gst_rate_bps": 1800,
                "selling_price_paisa": 0,
                "reorder_level": Decimal("100.0000"),
                "opening_qty": Decimal("500.0000"),
                "unit_rate_paisa": 250,  # ₹2.50 / piece
            },
            {
                "sku_code": "PKG-CTN-20",
                "name": "Carton (20-pack)",
                "name_ta": "அட்டைப்பெட்டி (20 பாக்கெட்)",
                "category": ItemCategory.PACKAGING.value,
                "base_unit": "piece",
                "pack_weight_grams": None,
                "carton_capacity": None,
                "hsn_code": "481910",
                "gst_rate_bps": 1200,
                "selling_price_paisa": 0,
                "reorder_level": Decimal("10.0000"),
                "opening_qty": Decimal("30.0000"),
                "unit_rate_paisa": 1500,  # ₹15.00 / carton
            },
            {
                "sku_code": "FG-MUR-200G",
                "name": "Murukku 200g",
                "name_ta": "முறுக்கு 200கி",
                "category": ItemCategory.FINISHED_GOOD.value,
                "base_unit": "packet",
                "pack_weight_grams": Decimal("200.0000"),
                "carton_capacity": 20,
                "hsn_code": "21069099",
                "gst_rate_bps": 500,  # 5%
                "selling_price_paisa": 5000,  # ₹50.00 / packet
                "reorder_level": Decimal("20.0000"),
                "opening_qty": Decimal("50.0000"),
                "unit_rate_paisa": 3000,  # Cost valuation ₹30.00 / packet
            },
            {
                "sku_code": "FG-MIX-250G",
                "name": "Mixture 250g",
                "name_ta": "மிக்சர் 250கி",
                "category": ItemCategory.FINISHED_GOOD.value,
                "base_unit": "packet",
                "pack_weight_grams": Decimal("250.0000"),
                "carton_capacity": 20,
                "hsn_code": "21069099",
                "gst_rate_bps": 500,  # 5%
                "selling_price_paisa": 6000,  # ₹60.00 / packet
                "reorder_level": Decimal("20.0000"),
                "opening_qty": Decimal("40.0000"),
                "unit_rate_paisa": 3500,  # Cost valuation ₹35.00 / packet
            },
            {
                "sku_code": "FG-CHP-200G",
                "name": "Banana Chips 200g",
                "name_ta": "நேந்திரம் சிப்ஸ் 200கி",
                "category": ItemCategory.FINISHED_GOOD.value,
                "base_unit": "packet",
                "pack_weight_grams": Decimal("200.0000"),
                "carton_capacity": 20,
                "hsn_code": "21069099",
                "gst_rate_bps": 500,  # 5%
                "selling_price_paisa": 6500,  # ₹65.00 / packet
                "reorder_level": Decimal("20.0000"),
                "opening_qty": Decimal("35.0000"),
                "unit_rate_paisa": 3800,  # Cost valuation ₹38.00 / packet
            },
            {
                "sku_code": "FG-THT-200G",
                "name": "Thattai 200g",
                "name_ta": "தட்டை 200கி",
                "category": ItemCategory.FINISHED_GOOD.value,
                "base_unit": "packet",
                "pack_weight_grams": Decimal("200.0000"),
                "carton_capacity": 20,
                "hsn_code": "21069099",
                "gst_rate_bps": 500,  # 5%
                "selling_price_paisa": 5500,  # ₹55.00 / packet
                "reorder_level": Decimal("20.0000"),
                "opening_qty": Decimal("45.0000"),
                "unit_rate_paisa": 3200,  # Cost valuation ₹32.00 / packet
            },
        ]

        seeded_items = {}
        for idata in items_data:
            item = db.query(Item).filter(Item.sku_code == idata["sku_code"]).first()
            if not item:
                item = Item(
                    sku_code=idata["sku_code"],
                    name=idata["name"],
                    name_ta=idata["name_ta"],
                    category=idata["category"],
                    base_unit=idata["base_unit"],
                    pack_weight_grams=idata["pack_weight_grams"],
                    carton_capacity=idata["carton_capacity"],
                    hsn_code=idata["hsn_code"],
                    gst_rate_bps=idata["gst_rate_bps"],
                    selling_price_paisa=idata["selling_price_paisa"],
                    reorder_level=idata["reorder_level"],
                )
                db.add(item)
                db.flush()
                stats["items"] += 1
                if verbose:
                    print(f" [+] Created item: {item.sku_code} - {item.name} ({item.name_ta})")
            else:
                if verbose:
                    print(f" [=] Item exists: {item.sku_code} - {item.name}")
            seeded_items[idata["name"]] = item

            # Seed Opening Stock in stock_ledger (Append-only immutable record)
            opening_entry = (
                db.query(StockLedger)
                .filter(
                    StockLedger.item_id == item.id,
                    StockLedger.transaction_type == StockTransactionType.OPENING.value,
                    StockLedger.reference_type == "OPENING_BALANCE",
                )
                .first()
            )

            valuation = int(idata["opening_qty"] * idata["unit_rate_paisa"])
            stats["total_valuation_paisa"] += valuation

            if not opening_entry:
                opening_entry = StockLedger(
                    item_id=item.id,
                    transaction_type=StockTransactionType.OPENING.value,
                    qty_change=idata["opening_qty"],
                    unit_rate_paisa=idata["unit_rate_paisa"],
                    reference_type="OPENING_BALANCE",
                    reference_id=None,
                    notes=f"Benchmark Opening Balance: {idata['opening_qty']} {idata['base_unit']} @ {format_rupees(idata['unit_rate_paisa'])}",
                    created_by=admin_id,
                )
                db.add(opening_entry)
                db.flush()
                stats["stock_entries"] += 1
                if verbose:
                    print(
                        f"     -> Seeded OPENING stock: {idata['opening_qty']} {idata['base_unit']} "
                        f"(@ {format_rupees(idata['unit_rate_paisa'])} = {format_rupees(valuation)})"
                    )
            else:
                if verbose:
                    print(f"     -> OPENING stock entry already present for {item.sku_code}")

        # --- 5. Seed Decoupled BOM Recipe & SKU Mapping ---
        # Base Dough Mix Recipe: Murukku Base Mix - 40kg flour batch
        bom_code = "BOM-MRK-BASE"
        bom = db.query(BOMHeader).filter(BOMHeader.code == bom_code).first()
        if not bom:
            bom = BOMHeader(
                code=bom_code,
                name="Murukku Base Mix - 40kg flour batch",
                name_ta="முறுக்கு மாவு அடிப்படை கலவை - 40கிலோ தொகுதி",
                version=1,
                is_active=True,
            )
            db.add(bom)
            db.flush()
            stats["bom_recipes"] += 1
            if verbose:
                print(f" [+] Created BOM Header: {bom.code} - {bom.name}")

            # Add ingredients for 1 batch of Murukku base dough:
            # Flour: 40 kg, Cooking Oil: 10 litre, Salt & Spice Mix: 1.2 kg
            ingredients_data = [
                (seeded_items["Flour"].id, Decimal("40.0000"), "kg"),
                (seeded_items["Cooking Oil"].id, Decimal("10.0000"), "litre"),
                (seeded_items["Salt and Spice Mix"].id, Decimal("1.2000"), "kg"),
            ]
            for raw_id, std_qty, unit in ingredients_data:
                ing = BOMIngredient(
                    bom_id=bom.id,
                    raw_item_id=raw_id,
                    standard_qty=std_qty,
                    unit=unit,
                )
                db.add(ing)
            db.flush()
            if verbose:
                print("     -> Added standard ingredients: Flour (40kg), Oil (10L), Spices (1.2kg)")

            # Add SKU Mapping for Murukku 200g (Yields 200 packets per batch)
            sku_mapping = BOMSKUMapping(
                bom_id=bom.id,
                finished_item_id=seeded_items["Murukku 200g"].id,
                expected_yield_packets=Decimal("200.0000"),
                pouch_item_id=seeded_items["200g Pouch"].id,
                pouches_per_packet=Decimal("1.0000"),
                carton_item_id=seeded_items["Carton (20-pack)"].id,
                packets_per_carton=20,
            )
            db.add(sku_mapping)
            db.flush()
            if verbose:
                print("     -> Mapped Murukku 200g: 200 pkts yield, 1 pouch/pkt, 20 pkts/carton (10 cartons)")
        else:
            if verbose:
                print(f" [=] BOM Header exists: {bom.code}")

        # Base Dough Mix Recipe: South Indian Mixture Base Mix - 35kg batch
        bom_code_mix = "BOM-MIX-BASE"
        bom_mix = db.query(BOMHeader).filter(BOMHeader.code == bom_code_mix).first()
        if not bom_mix:
            bom_mix = BOMHeader(
                code=bom_code_mix,
                name="South Indian Mixture Base Mix - 35kg batch",
                name_ta="தென்னிந்திய மிக்சர் கலவை - 35கிலோ தொகுதி",
                version=1,
                is_active=True,
            )
            db.add(bom_mix)
            db.flush()
            stats["bom_recipes"] += 1
            if verbose:
                print(f" [+] Created BOM Header: {bom_mix.code} - {bom_mix.name}")

            # Ingredients for 1 batch of Mixture:
            # Flour: 35 kg, Cooking Oil: 12 litre, Salt & Spice Mix: 1.5 kg
            mix_ingredients = [
                (seeded_items["Flour"].id, Decimal("35.0000"), "kg"),
                (seeded_items["Cooking Oil"].id, Decimal("12.0000"), "litre"),
                (seeded_items["Salt and Spice Mix"].id, Decimal("1.5000"), "kg"),
            ]
            for raw_id, std_qty, unit in mix_ingredients:
                db.add(BOMIngredient(bom_id=bom_mix.id, raw_item_id=raw_id, standard_qty=std_qty, unit=unit))
            db.flush()

            # SKU Mapping for Mixture 250g (Yields 160 packets per batch)
            db.add(BOMSKUMapping(
                bom_id=bom_mix.id,
                finished_item_id=seeded_items["Mixture 250g"].id,
                expected_yield_packets=Decimal("160.0000"),
                pouch_item_id=seeded_items["200g Pouch"].id,
                pouches_per_packet=Decimal("1.0000"),
                carton_item_id=seeded_items["Carton (20-pack)"].id,
                packets_per_carton=20,
            ))
            db.flush()
            if verbose:
                print("     -> Mapped Mixture 250g: 160 pkts yield, 1 pouch/pkt, 20 pkts/carton")
        else:
            if verbose:
                print(f" [=] BOM Header exists: {bom_mix.code}")

        # Base Recipe: Banana Chips Base Batch - 30kg batch
        bom_code_chp = "BOM-CHP-BASE"
        bom_chp = db.query(BOMHeader).filter(BOMHeader.code == bom_code_chp).first()
        if not bom_chp:
            bom_chp = BOMHeader(
                code=bom_code_chp,
                name="Banana Chips Base Batch - 30kg batch",
                name_ta="நேந்திரம் சிப்ஸ் தொகுதி - 30கிலோ",
                version=1,
                is_active=True,
            )
            db.add(bom_chp)
            db.flush()
            stats["bom_recipes"] += 1
            if verbose:
                print(f" [+] Created BOM Header: {bom_chp.code} - {bom_chp.name}")

            # Ingredients: Flour: 20 kg, Cooking Oil: 15 litre, Salt & Spice Mix: 1.0 kg
            chp_ingredients = [
                (seeded_items["Flour"].id, Decimal("20.0000"), "kg"),
                (seeded_items["Cooking Oil"].id, Decimal("15.0000"), "litre"),
                (seeded_items["Salt and Spice Mix"].id, Decimal("1.0000"), "kg"),
            ]
            for raw_id, std_qty, unit in chp_ingredients:
                db.add(BOMIngredient(bom_id=bom_chp.id, raw_item_id=raw_id, standard_qty=std_qty, unit=unit))
            db.flush()

            # SKU Mapping for Banana Chips 200g (Yields 150 packets per batch)
            db.add(BOMSKUMapping(
                bom_id=bom_chp.id,
                finished_item_id=seeded_items["Banana Chips 200g"].id,
                expected_yield_packets=Decimal("150.0000"),
                pouch_item_id=seeded_items["200g Pouch"].id,
                pouches_per_packet=Decimal("1.0000"),
                carton_item_id=seeded_items["Carton (20-pack)"].id,
                packets_per_carton=20,
            ))
            db.flush()
            if verbose:
                print("     -> Mapped Banana Chips 200g: 150 pkts yield, 1 pouch/pkt, 20 pkts/carton")
        else:
            if verbose:
                print(f" [=] BOM Header exists: {bom_chp.code}")

        # Base Recipe: Thattai Base Batch - 30kg batch
        bom_code_tht = "BOM-THT-BASE"
        bom_tht = db.query(BOMHeader).filter(BOMHeader.code == bom_code_tht).first()
        if not bom_tht:
            bom_tht = BOMHeader(
                code=bom_code_tht,
                name="Thattai Base Batch - 30kg flour batch",
                name_ta="தட்டை அடிப்படை கலவை - 30கிலோ தொகுதி",
                version=1,
                is_active=True,
            )
            db.add(bom_tht)
            db.flush()
            stats["bom_recipes"] += 1
            if verbose:
                print(f" [+] Created BOM Header: {bom_tht.code} - {bom_tht.name}")

            # Ingredients: 30 kg Flour + 9 L Cooking Oil + 1.0 kg Salt & Spice Mix
            tht_ingredients = [
                (seeded_items["Flour"].id, Decimal("30.0000"), "kg"),
                (seeded_items["Cooking Oil"].id, Decimal("9.0000"), "litre"),
                (seeded_items["Salt and Spice Mix"].id, Decimal("1.0000"), "kg"),
            ]
            for raw_id, std_qty, unit in tht_ingredients:
                db.add(BOMIngredient(bom_id=bom_tht.id, raw_item_id=raw_id, standard_qty=std_qty, unit=unit))
            db.flush()

            # SKU Mapping for Thattai 200g (Yields 180 packets per batch)
            db.add(BOMSKUMapping(
                bom_id=bom_tht.id,
                finished_item_id=seeded_items["Thattai 200g"].id,
                expected_yield_packets=Decimal("180.0000"),
                pouch_item_id=seeded_items["200g Pouch"].id,
                pouches_per_packet=Decimal("1.0000"),
                carton_item_id=seeded_items["Carton (20-pack)"].id,
                packets_per_carton=20,
            ))
            db.flush()
            if verbose:
                print("     -> Mapped Thattai 200g: 180 pkts yield, 1 pouch/pkt, 20 pkts/carton")
        else:
            if verbose:
                print(f" [=] BOM Header exists: {bom_tht.code}")

        # --- 6. Record Audit Log for Initial Seeding ---
        seed_audit = (
            db.query(AuditLog)
            .filter(AuditLog.entity_type == "SYSTEM", AuditLog.action == "BENCHMARK_SEED")
            .first()
        )
        if not seed_audit:
            seed_audit = AuditLog(
                entity_type="SYSTEM",
                entity_id=0,
                action="BENCHMARK_SEED",
                details_json='{"status": "completed", "spec": "Section 5 NIT Tiruchirappalli CDI Benchmark"}',
                performed_by=admin_id,
            )
            db.add(seed_audit)

        db.commit()

        if verbose:
            print("\n=======================================================")
            print(" [OK] Pocket Ledger Section 5 Seed Completed Successfully!")
            print(f" Factory State: Tamil Nadu")
            print(f" Total Opening Stock Valuation: {format_rupees(stats['total_valuation_paisa'])}")
            print("=======================================================\n")

        return stats

    except Exception as exc:
        db.rollback()
        print(f" [ERROR] Seeding failed: {exc}", file=sys.stderr)
        raise exc
    finally:
        db.close()


if __name__ == "__main__":
    clean = "--clean" in sys.argv or "--reset" in sys.argv
    seed_database(verbose=True, clean_transactions=clean)
