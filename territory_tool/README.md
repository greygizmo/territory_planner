# ICP Territory Builder — Technical Reference

This is the core application directory for the ICP Territory Builder. For full documentation, see the [root README](../README.md).

---

## 📁 Directory Structure

```
territory_tool/
├── README.md            # This file
├── backend/             # Python FastAPI backend
│   ├── main.py          # API entry point & endpoints
│   ├── data_loader.py   # CSV loading, preprocessing, aggregation
│   ├── metrics.py       # Fairness metrics & territory statistics
│   ├── optimizer.py     # Optimization algorithms (3 strategies)
│   ├── models.py        # Pydantic request/response schemas
│   ├── requirements.txt # Python dependencies
│   └── tests/           # Backend tests
└── frontend/            # React TypeScript frontend (Vite)
    ├── src/
    │   ├── App.tsx            # Main application component
    │   ├── api/client.ts      # API client wrapper
    │   ├── components/        # React components
    │   │   ├── ControlPanel.tsx   # Settings sidebar
    │   │   ├── MapView.tsx        # Leaflet map
    │   │   ├── TerritoryList.tsx  # Territory cards
    │   │   ├── ScenarioTabs.tsx   # Scenario switcher
    │   │   └── InsightsDrawer.tsx # Metrics drawer
    │   └── types/index.ts     # TypeScript type definitions
    ├── package.json           # Node dependencies
    └── vite.config.ts         # Vite configuration
```

---

## 🚀 Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# Server runs at http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Dev server runs at http://localhost:5174
```

### Using the Dev Script (from repo root)

```powershell
..\scripts\dev.ps1   # Start both servers
..\scripts\stop-dev.ps1  # Stop both servers
```

---

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Application configuration |
| `/optimize` | POST | Generate optimized territory scenarios |
| `/evaluate` | POST | Evaluate manual assignments |
| `/export/csv` | POST | Export assignments as CSV |
| `/zip_to_state` | GET | ZIP-to-state mapping |

---

## 🎯 Optimization Strategies

### Primary-Balanced (`primary`)
Greedy first-fit-decreasing on the primary metric.

### Secondary-Balanced (`secondary`)
Greedy first-fit-decreasing on the secondary metric.

### Geographic-Balanced (`geographic`)
Voronoi-like region-growing that ensures contiguity and balances both metrics.

---

## 📊 Key Metrics

### Balancing Metrics (selectable in UI)

**ICP Scores:**
- `Combined_ICP_Score` — Average of non-zero division scores
- `Weighted_ICP_Value` — ICP × log1p(GP_12M)
- `Hardware_ICP_Score`, `CRE_ICP_Score`, `CPE_ICP_Score`

**Financial:**
- `GP_12M_Total`, `GP_24M_Total`, `GP_36M_Total`

**Assets:**
- `Total_Assets`, `HW_Assets`, `CRE_Assets`, `CPE_Assets`

**Attention Load:**
- `HighTouchWeighted_Combined` — Grade-weighted attention requirement

**Counts:**
- `Account_Count`, `Combined_AB_Count`

### Fairness Metrics

| Metric | Description | Ideal Value |
|--------|-------------|-------------|
| `Equity Score` | Human-friendly balance indicator (0-100) | 100 |
| `Gini Coefficient` | Statistical inequality measure (0-1) | 0 |
| `Theil Index` | Entropy-based inequality | 0 |
| `Max/Min Ratio` | Largest ÷ smallest territory | 1.0 |

---

## 🔧 Backend Modules

### `data_loader.py`

- **`DataStore`** — Singleton data store for loaded CSV
- **`load_csv_data()`** — Load and preprocess CSV
- **`get_aggregates(granularity)`** — Get precomputed unit aggregates
- **`get_filtered_aggregates(...)`** — Filter by industry/country
- **State normalization** — Maps state names to 2-letter codes
- **Adjacency graph** — US + Canada state/province adjacency

### `metrics.py`

- **`gini(values)`** — Compute Gini coefficient
- **`theil(values)`** — Compute Theil index
- **`equity_score_from_gini(g)`** — Convert Gini to 0-100 score
- **`compute_territory_stats(...)`** — Aggregate stats for a territory
- **`compute_scenario_stats(...)`** — Full scenario statistics

### `optimizer.py`

- **`primary_balanced(...)`** — Balance on primary metric
- **`secondary_balanced(...)`** — Balance on secondary metric
- **`geographic_balanced(...)`** — Region-growing with contiguity
- **`select_geographic_seeds(...)`** — Value-weighted seed selection
- **`is_territory_contiguous(...)`** — Check territory connectivity
- **`STATE_CENTROIDS`** — Lat/lng centroids for all states/provinces

### `models.py`

Pydantic models for all API request/response schemas:
- `ConfigResponse`, `OptimizeRequest`, `EvaluateRequest`
- `Scenario`, `TerritoryStats`, `FairnessMetrics`
- `FinancialDynamics`, `GradeDistribution`

---

## 🎨 Frontend Components

### `App.tsx`
Main React component managing:
- Configuration loading
- Scenario state (manual, primary, secondary, geographic)
- Active territory selection
- API calls for optimization and evaluation

### `MapView.tsx`
Interactive Leaflet map with:
- TopoJSON rendering of US states + Canadian provinces
- Click-to-assign functionality
- Color-coded territory visualization
- Country/region bounding and filtering

### `ControlPanel.tsx`
Settings sidebar with:
- Territory count (k) slider
- Granularity toggle (State/ZIP)
- Primary/secondary metric dropdowns
- Country filter (US/Canada/All)
- Industry exclusion multi-select

### `TerritoryList.tsx`
Territory cards showing:
- Primary/secondary metric values with ideal comparison
- Account count
- Lock toggle
- Grade distribution summaries

### `ScenarioTabs.tsx`
Tab navigation between:
- Manual — User-defined assignments
- Primary — Primary-optimized scenario
- Secondary — Secondary-optimized scenario
- Geographic — Region-growing scenario

### `InsightsDrawer.tsx`
Expandable drawer with:
- Global totals and ideals
- Fairness metrics comparison
- Territory comparison table
- Contiguity warnings

---

## 🧪 Testing

```bash
# Backend tests
cd backend
pytest tests/

# Frontend linting
cd frontend
npm run lint
```

---

## 📝 Notes

- **Data file location**: `../icp_scored_accounts.csv` (relative to `territory_tool/`)
- **Port configuration**: Backend on 8000, Frontend on 5174
- **CORS**: Configured for localhost development
- **State normalization**: Handles full names, abbreviations, and common variations

---

## 📜 License

Internal use only — GoEngineer Inc.
