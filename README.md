# 🗺️ ICP Territory Builder

> **Interactive territory planning tool for ICP-scored accounts** — enabling balanced assignment of geographic units to territories while optimizing for multiple business metrics.

![Internal Tool](https://img.shields.io/badge/status-internal-blue)
![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue)
![Node.js 18+](https://img.shields.io/badge/node-18+-green)
![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688)
![React](https://img.shields.io/badge/frontend-React-61DAFB)

---

## 📖 Overview

The ICP Territory Builder is a web-based planning tool that allows you to:

- **Visualize** account data on an interactive map (US states + Canadian provinces)
- **Manually assign** geographic units to territories by clicking on the map
- **Optimize** territory assignments using multiple balancing strategies
- **Compare** scenarios side-by-side with fairness metrics
- **Export** assignments and metrics to CSV for further analysis

This is an **internal prototype** designed for clarity, explainability, and interactive exploration rather than production-grade robustness.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🗺️ **Interactive Map** | Click states/provinces to assign them to territories |
| ⚖️ **Optimization Scenarios** | Primary-balanced, Secondary-balanced, and Geographic-balanced strategies |
| 📊 **Fairness Metrics** | Gini coefficient, Theil index, Equity score, Max/Min ratio |
| 📈 **Comprehensive Stats** | Account counts, ICP grades, GP dynamics, asset totals per territory |
| 🔒 **Lock Assignments** | Lock specific units to territories before optimization |
| 🌱 **Seed Selection** | Designate seed units to anchor territory growth |
| 🌍 **Country Filtering** | Filter by US only, Canada only, or both |
| 🏭 **Industry Exclusion** | Exclude specific industries from planning |
| 📤 **CSV Export** | Export unit-level assignments with key metrics for Excel |
| 🔗 **Contiguity Enforcement** | Ensure territories form connected regions |

---

## 🏗️ Architecture

```
Territory Planner/
├── README.md                    # This file
├── icp_scored_accounts.csv      # Data file (gitignored)
├── icp_territory_builder_plan.md # Implementation specification
├── scripts/
│   ├── dev.ps1                  # Start both servers (Windows)
│   └── stop-dev.ps1             # Stop both servers (Windows)
└── territory_tool/
    ├── README.md                # Tool-specific documentation
    ├── backend/                 # Python FastAPI backend
    │   ├── main.py              # API entry point
    │   ├── data_loader.py       # CSV loading & preprocessing
    │   ├── metrics.py           # Fairness calculations
    │   ├── optimizer.py         # Territory assignment algorithms
    │   ├── models.py            # Pydantic schemas
    │   └── requirements.txt     # Python dependencies
    └── frontend/                # React TypeScript frontend
        ├── src/
        │   ├── App.tsx          # Main application
        │   ├── api/             # API client
        │   ├── components/      # UI components
        │   └── types/           # TypeScript definitions
        └── package.json         # Node dependencies
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.11+** with pip
- **Node.js 18+** with npm
- **PowerShell** (for convenience scripts on Windows)

### Option 1: Use the Dev Script (Recommended)

From the repository root, run:

```powershell
.\scripts\dev.ps1
```

This script will:
1. Stop any existing servers on ports 8000/5174
2. Start the backend server
3. Start the frontend dev server
4. Wait for both to be ready
5. Open your browser to http://localhost:5174

To stop both servers:

```powershell
.\scripts\stop-dev.ps1
```

### Option 2: Manual Setup

#### Backend Setup

```bash
cd territory_tool/backend

# Create virtual environment (recommended)
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
# Or: uvicorn main:app --reload --port 8000
```

Backend will be available at **http://localhost:8000**

#### Frontend Setup

```bash
cd territory_tool/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend will be available at **http://localhost:5174**

---

## 📊 Data Requirements

Place `icp_scored_accounts.csv` in the **repository root** (same level as this README). The file is gitignored by default.

### Required Columns

| Column | Description |
|--------|-------------|
| `Customer ID` | Primary key for accounts |
| `ShippingState` | State/province code for geographic grouping |
| `ShippingZip` | ZIP/postal code (optional, for ZIP granularity) |
| `ShippingCountry` | Country code (`_unitedStates` or `_canada`) |
| `Hardware_ICP_Score` | ICP score for Hardware division (0-100) |
| `CRE_ICP_Score` | ICP score for CRE division (0-100) |
| `CPE_ICP_Score` | ICP score for CPE division (0-100) |
| `GP_12M_Total` | Gross profit last 12 months |
| `GP_24M_Total` | Gross profit last 24 months |
| `GP_36M_Total` | Gross profit last 36 months |

### Derived Metrics (Computed Automatically)

- **Combined_ICP_Score**: Average of non-zero division ICP scores
- **Weighted_ICP_Value**: `Combined_ICP_Score × log1p(GP_12M_Total)`
- **Total_Assets**: Sum of HW + CRE + CPE assets
- **Combined_AB_Count**: Count of accounts with A or B grades across divisions

---

## 🎯 Usage

### Basic Workflow

1. **Start both servers** (backend on 8000, frontend on 5174)
2. **Configure settings** in the Control Panel:
   - Number of territories (k)
   - Granularity (State or ZIP)
   - Primary metric (e.g., Weighted ICP Value)
   - Secondary metric (e.g., GP 12 Month)
   - Country filter (US, Canada, or All)
3. **Manual assignment**: Click states on the map to assign them to the active territory
4. **Lock assignments** (optional): Toggle locks on territories to preserve them during optimization
5. **Optimize**: Click "Optimize Territories" to generate balanced scenarios
6. **Compare**: Switch between Manual/Primary/Secondary/Geographic tabs
7. **View insights**: Open the drawer to see detailed metrics and fairness scores
8. **Export**: Click "Export CSV" to download assignments for Excel

### Territory Colors

Territories are assigned distinct colors for easy visual identification:
- T1: Red, T2: Blue, T3: Green, T4: Orange, T5: Purple, etc.
- Unassigned units appear in light gray

### Understanding Fairness Metrics

| Metric | Perfect Score | Meaning |
|--------|---------------|---------|
| **Equity Score** | 100 | Higher is better (100 = perfect equality) |
| **Gini Coefficient** | 0 | Lower is better (0 = perfect equality) |
| **Theil Index** | 0 | Lower is better (entropy-based inequality) |
| **Max/Min Ratio** | 1.0 | Lower is better (ratio of largest to smallest territory) |

---

## 🔌 API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (returns `{"status": "ok"}`) |
| `/config` | GET | Application configuration (metrics, industries, counts) |
| `/optimize` | POST | Generate optimized territory scenarios |
| `/evaluate` | POST | Evaluate manual territory assignments |
| `/export/csv` | POST | Export assignments + metrics as CSV |
| `/zip_to_state` | GET | ZIP-to-state mapping for ZIP granularity |

### Example: Optimize Request

```json
POST /optimize
{
  "k": 8,
  "granularity": "state",
  "primary_metric": "Weighted_ICP_Value",
  "secondary_metric": "GP_12M_Total",
  "locked_assignments": {"CA": "T1", "NV": "T1"},
  "seed_assignments": {"TX": "T2"},
  "require_contiguity": true,
  "country_filter": "us"
}
```

### Example: Response Structure

```json
{
  "scenarios": [
    {
      "id": "primary",
      "label": "Primary-Balanced",
      "assignments": {"CA": "T1", "OR": "T1", ...},
      "territory_stats": {...},
      "fairness_primary": {"gini": 0.07, "equity_score": 93, ...},
      "fairness_secondary": {...}
    },
    ...
  ],
  "warnings": []
}
```

---

## ⚙️ Optimization Algorithms

### 1. Primary-Balanced
Greedy first-fit-decreasing on the primary metric. Assigns largest units first to the territory with the smallest current load.

### 2. Secondary-Balanced
Same algorithm as primary-balanced but optimizes for the secondary metric.

### 3. Geographic-Balanced
Voronoi-like region-growing that prioritizes:
- Geographic contiguity (territories must be connected)
- Value balance across both metrics
- Compact, intuitive shapes

### Contiguity Constraint
When `require_contiguity` is enabled, the optimizer ensures each territory forms a connected region. This uses a hardcoded US + Canada state/province adjacency graph.

---

## 📁 Key Files

### Backend

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, endpoints, CORS configuration |
| `data_loader.py` | CSV loading, type coercion, derived metrics, aggregation |
| `metrics.py` | Gini, Theil, Equity Score, territory stats computation |
| `optimizer.py` | Primary, secondary, and geographic balancing algorithms |
| `models.py` | Pydantic request/response schemas |

### Frontend

| File | Purpose |
|------|---------|
| `App.tsx` | Main React component, state management |
| `MapView.tsx` | Leaflet map with TopoJSON rendering |
| `ControlPanel.tsx` | Settings: k, granularity, metrics, country filter |
| `TerritoryList.tsx` | Territory cards with stats and lock controls |
| `ScenarioTabs.tsx` | Tabs for switching between optimization scenarios |
| `InsightsDrawer.tsx` | Detailed metrics, fairness comparison, territory table |

---

## 🔧 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ICP_CSV_PATH` | `../../icp_scored_accounts.csv` | Path to the data file |

### Vite Dev Server

The frontend runs on port **5174** by default. The backend runs on port **8000**. CORS is configured to allow requests from both `localhost:5173` and `localhost:5174`.

---

## 🧪 Development

### Backend Testing

```bash
cd territory_tool/backend
pytest tests/
```

### Frontend Linting

```bash
cd territory_tool/frontend
npm run lint
```

### Production Build

```bash
cd territory_tool/frontend
npm run build
```

Output will be in `territory_tool/frontend/dist/`.

---

## 📝 Documentation

- **`README.md`** (this file): Overview, setup, and usage
- **`territory_tool/README.md`**: Tool-specific quick reference
- **`icp_territory_builder_plan.md`**: Detailed implementation specification

---

## 🚧 Known Limitations

1. **ZIP granularity is experimental** — state-level is more reliable
2. **No authentication** — this is an internal prototype
3. **Data file required** — the app will start but endpoints fail without the CSV
4. **Windows scripts only** — `dev.ps1` and `stop-dev.ps1` are PowerShell scripts

---

## 📜 License

**Internal use only** — GoEngineer Inc.

---

## 🙋 Support

For questions or issues, contact the Data & Analytics team.
