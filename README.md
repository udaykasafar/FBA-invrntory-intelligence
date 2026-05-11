# FBA Inventory Intelligence Dashboard

A local, web-based tool to **detect excess inventory** being sent to Amazon FBA by analyzing
shipments, last-45-days sales, and current FBA stock.

Built with **Flask + Pandas** on the backend and **Tailwind + Chart.js** on the frontend.

---

## Project structure

```
FBA_TOOL/
├── app.py                     # Flask backend + calculation engine
├── requirements.txt           # Python dependencies
├── templates/
│   └── index.html             # Main UI
├── static/
│   ├── css/style.css          # Custom styles
│   ├── js/script.js           # Frontend logic
│   └── uploads/               # Reserved (not used currently)
└── outputs/                   # Generated Excel exports
```

---

## Quick start (VS Code)

### 1. Install Python 3.9+

Check you have Python:
```bash
python --version
```

### 2. Open the project in VS Code

```bash
code FBA_TOOL
```

### 3. Create a virtual environment (recommended)

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Start the Flask server

```bash
python app.py
```

You should see:
```
 * Running on http://127.0.0.1:5000
```

### 6. Open the dashboard

In your browser: **http://127.0.0.1:5000**

---

## Using the dashboard

1. **Upload three files** (`.xlsx` or `.csv`):
   - **Shipment File** — columns: `Loading Date, Appointment ID, Shipment ID, SKU, Qty`
   - **45 Days Sales File** — columns: `ASIN, SKU, FNSKU, Qty`
   - **FBA Stock Report** — columns: `SKU, ASIN, FNSKU, Qty`
2. **Adjust settings** if needed:
   - Transit Days (default `10`)
   - GRN Days (default `7`)
   - Target FBA Days (default `45`)
3. Click **Run Analysis**.
4. Review KPIs, charts, and the SKU table.
5. **Download** any of three Excel reports:
   - Final Output (all SKUs)
   - Excess Inventory (only SKUs with `Excess Qty > 0`)
   - Dead Stock (only SKUs with zero sales)

---

## Calculation logic

| Metric | Formula |
|---|---|
| Lead Time | `Transit Days + GRN Days` |
| Daily Sales | `45 Days Sales Qty / 45` (2-decimal precision) |
| Shipment Arrival Date | `Loading Date + Lead Time` |
| Consumption Before Arrival | `Daily Sales x days from today to Shipment Arrival Date` |
| Stock Before Arrival | `MAX(0, Current FBA Stock - Consumption Before Arrival)` |
| Projected Stock | `ROUND(Stock Before Arrival + Incoming Shipment Qty)` |
| Required Qty | `CEIL(Daily Sales × Target FBA Days)` |
| Days Cover | `Projected Stock / Daily Sales` (`999` if sales = 0) |
| Excess Qty | `MAX(0, Projected Stock - Required Qty)` only when `Days Cover > Target FBA Days` |
| Recommended Shipment Qty | `MAX(0, Required Qty - Stock Before Arrival)` |

### Status thresholds

| Days Cover | Status |
|---|---|
| `Daily Sales = 0` | Dead Stock |
| `< 10` | Critical |
| `10 – 19.9` | Low Stock |
| `20 – 45` | Healthy |
| `45.1 – 60` | Overstock |
| `> 60` | Excess Inventory |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ModuleNotFoundError: flask` | Activate the venv, then `pip install -r requirements.txt` |
| `Address already in use` | Another app is on port 5000. Edit the last line of `app.py` to use port `5050`. |
| "Missing required columns" | Header names in the file don't match exactly — open the file and rename headers to match the spec above. |
| Excel won't read | The file may be password-protected or `.xls`. Save as `.xlsx` first. |

---

## Notes

- All processing is **local** — no data leaves your machine.
- Results are stored in memory only; restarting the server clears them.
- For very large files (>100k rows), the page may take 5–10 seconds to render the table.
