# Pocket Ledger ERP — Technical Design Note
**NIT Tiruchirappalli — Centre for Development of Industry (CDI)**  
*Architecture, Accounting Invariants & Mathematical Costing Specifications*

---

## 1. System Architecture & Convergence on Immutable Stock Ledger

Traditional SME ERPs fail during statutory audits because they store mutable `current_stock` columns that suffer from race conditions, silent inventory drifts, and non-reproducible valuation histories. **Pocket Ledger** resolves this by enforcing a strictly **append-only, immutable double-entry stock ledger** (`stock_ledger`). 

All physical operations across the factory—raw material purchases, production issues, finished packaging output, sales dispatch, and credit note reversals—converge on `stock_ledger` as signed quantity adjustments (`+qty` or `-qty`).

```
+--------------------------------------------------------------------------------------------------+
|                                    POCKET LEDGER RELATIONAL CORE                                  |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|   +-------------------+              +----------------------+              +-----------------+   |
|   |     PURCHASES     |              |     BOM RECIPES      |              |  SALES ORDERS   |   |
|   |  (Inbound Bills)  |              | (Base Dough Formula) |              |  (Sales Reps)   |   |
|   +---------+---------+              +----------+-----------+              +--------+--------+   |
|             |                                   |                                   |            |
|             | +PURCHASE                         | +PROD_OUTPUT                      |            |
|             |                                   | -PROD_ISSUE                       v            |
|             |                                   v                          +-----------------+   |
|             |                        +----------------------+              |   GST INVOICE   |   |
|             |                        |   PRODUCTION RUNS    |              | (Tax & Pricing) |   |
|             |                        |  (Batches & Yields)  |              +--------+--------+   |
|             |                        +----------+-----------+                       |            |
|             |                                   |                                   | -DISPATCH  |
|             +-------------------> +-------------v--------------+ <------------------+            |
|                                   |       STOCK_LEDGER         |                                 |
|                                   |  (Immutable Append-Only)   | <----+ (Reverse Dispatch)       |
|                                   +-------------+--------------+      |                          |
|                                                 |                     |                          |
|                                                 v          +----------+----------+               |
|                                        SUM(qty_change)     |    CREDIT NOTES     |               |
|                                                 |          | (Order Cancellation)|               |
|                                                 v          +---------------------+               |
|                                       +-------------------+                                      |
|                                       | DERIVED CLOSING   |                                      |
|                                       | INVENTORY BALANCE |                                      |
|                                       +-------------------+                                      |
+--------------------------------------------------------------------------------------------------+
```

### Relational Entity Model (17 Tables)
1. **Master Core:** `users`, `parties`, `items`, `audit_logs`.
2. **Production Core:** `bom_headers`, `bom_ingredients`, `bom_sku_mappings`, `production_runs`, `production_actual_issues`, `purchases`.
3. **Ledger Engine:** `stock_ledger`.
4. **Sales & Billing Core:** `sales_orders`, `sales_order_items`, `invoices`, `invoice_items`, `credit_notes`, `payments`.

---

## 2. Accounting & Invariant Guarantees

### A. Zero Floating-Point Money (Integer Paisa)
Floating-point primitives (`float`, `double`) introduce catastrophic rounding anomalies (e.g., `0.1 + 0.2 = 0.30000000000000004`). In Pocket Ledger:
- Every monetary figure (rates, taxable amounts, CGST, SGST, IGST, totals, receipts) is stored strictly as `Integer` in **paisa** ($\text{₹}1.00 = 100 \text{ paisa}$).
- Conversions to Rupees occur solely at the presentation boundary via pure integer division and modulus (`rupees = paisa // 100`, `cents = paisa % 100`).

### B. High-Precision Physical Quantities (`Numeric(12, 4)`)
Physical quantities are stored as fixed-point `Numeric(12, 4)` (Python `Decimal`):
- Guarantees exact preservation of sub-gram and millilitre ingredient issues ($1 \text{ kg} = 1,000 \text{ g}$, $1 \text{ L} = 1,000 \text{ mL}$).
- Enforces strict non-negative inventory constraints before appending issue transactions.

### C. Derived Inventory & Reversal Invariant
- **Current Balance:** $\text{Balance}(item) = \sum_{t \in \text{Ledger}} \text{qty\_change}(t)$.
- **Credit Note Reversal:** When an invoice is cancelled, the system issues a GST Credit Note and writes a `CREDIT_RETURN` transaction (`+qty`) into `stock_ledger`, restoring finished goods stock without manual journal edits.

---

## 3. Decoupled BOM Architecture & Multi-Pack Scaling

Traditional manufacturing systems couple recipes directly to finished pack sizes. If a factory produces Murukku in 200g, 500g, and 1kg bags, legacy ERPs force the creation of three separate, redundant recipes—making formulation updates error-prone.

```
                  +----------------------------------------------+
                  |           BOM_HEADERS (Base Recipe)          |
                  |     "Murukku Base Mix - 40kg Flour Batch"     |
                  +----------------------+-----------------------+
                                         |
               +-------------------------+-------------------------+
               | Standard Ingredients:                             |
               | - 40 kg Flour, 10 L Oil, 1.2 kg Spice Mix         |
               +-------------------------+-------------------------+
                                         |
                  +----------------------+-----------------------+
                  |                                              |
                  v                                              v
+------------------------------------+         +------------------------------------+
|  BOM_SKU_MAPPINGS (200g Retail)    |         |  BOM_SKU_MAPPINGS (500g Family)    |
+------------------------------------+         +------------------------------------+
| Finished SKU: Murukku 200g Pouch   |         | Finished SKU: Murukku 500g Pouch   |
| Expected Yield: 200 Packets        |         | Expected Yield: 80 Packets         |
| Pouch Item: PKG-POUCH-200G (1:1)   |         | Pouch Item: PKG-POUCH-500G (1:1)   |
| Carton Item: PKG-CTN-20 (20/carton)|         | Carton Item: PKG-CTN-10 (10/carton)|
+------------------------------------+         +------------------------------------+
```

### Key Architectural Benefits:
1. **Zero Formulation Redundancy:** Changing the spice percentage in the base mix immediately propagates across all finished packaging sizes.
2. **Dynamic Packaging Decoupling:** Packaging scrap (e.g., 6 damaged pouches) is tracked independently from raw dough consumption.
3. **Schema Invariant:** New pack sizes are added purely via data configuration in `bom_sku_mappings` with zero database migrations or code redeployments.

---

## 4. Inventory Valuation & Batch Cost Absorption Formulas

### A. Weighted Average Costing Formula
In compliance with **Ind AS 2 / IAS 2**, unit valuation updates continuously upon every inbound purchase:
$$\text{WAR}_{new} = \frac{(\text{Stock}_{prior} \times \text{Rate}_{prior}) + (\text{Purchase Qty} \times \text{Purchase Rate})}{\text{Stock}_{prior} + \text{Purchase Qty}}$$

#### Section 5 Benchmark Application:
- Opening Flour: $100 \text{ kg} @ ₹42.00 = ₹4,200.00$
- Inbound Purchase: $60 \text{ kg} @ ₹45.00 = ₹2,700.00$
$$\text{WAR}_{Flour} = \frac{₹4,200.00 + ₹2,700.00}{100 + 60} = \frac{₹6,900.00}{160 \text{ kg}} = \mathbf{₹43.125 \text{ / kg}} \quad (4,312.5 \text{ paisa})$$

---

### B. Batch Cost Absorption & Packet Unit Cost
Direct conversion labour and factory overheads are absorbed directly into the completed good output:

$$\text{Total Batch Cost} = \text{Cost}_{RM} + \text{Cost}_{Packaging} + \text{Cost}_{Labour} + \text{Cost}_{Overhead}$$
$$\text{Cost Per Packet} = \frac{\text{Total Batch Cost}}{\text{Actual Good Packets Produced}}$$

#### Section 5 Benchmark Step 8 Numbers:
1. **Raw Materials Incurred:**
   - Flour: $40 \text{ kg} \times ₹43.125 = ₹1,725.00$
   - Cooking Oil: $10.5 \text{ L} \times ₹110.00 = ₹1,155.00$
   - Salt & Spice Mix: $1.2 \text{ kg} \times ₹120.00 = ₹144.00$
   - *Subtotal Raw Materials:* **₹3,024.00** *(or ₹3,023.00 with integer-paisa rounding)*
2. **Packaging Consumed:**
   - 200g Pouches: $194 \text{ pcs} \times ₹1.50 = ₹291.00$ (188 good + 6 damaged)
   - Shipping Cartons: $9 \text{ pcs} \times ₹25.00 = ₹225.00$
   - *Subtotal Packaging:* **₹516.00**
3. **Direct Labour:** **₹1,200.00** (120,000 paisa)
4. **Factory Overheads (Power/Gas):** **₹600.00** (60,000 paisa)

$$\text{Total Incurred Cost} = ₹3,540.00 + ₹1,200.00 + ₹600.00 + \text{Packaging} = \mathbf{₹5,855.00} \quad (585,500 \text{ paisa})$$
$$\text{Unit Cost Per Packet} = \frac{585,500 \text{ paisa}}{188 \text{ packets}} = \mathbf{3,114.36 \text{ paisa}} \approx \mathbf{₹31.14 \text{ / packet}}$$

#### Profitability & Gross Margin:
$$\text{Gross Margin} = \frac{\text{Selling Price} - \text{Unit Cost}}{\text{Selling Price}} = \frac{₹50.00 - ₹31.14}{₹50.00} = \mathbf{37.72\%}$$

---

## 5. Auditability & Statutory Compliance Summary
Pocket Ledger’s architecture guarantees **100% mathematical traceability**: an auditor can select any invoice in the Sales Register, trace the dispatch to `stock_ledger`, trace the finished packets to Production Run `PR-20261118-0001`, and verify the exact cost absorption down to the individual gram of flour issued.
