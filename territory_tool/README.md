# ICP Territory Builder

Interactive territory planning tool for ICP-scored accounts. Enables balanced assignment of geographic units (states or ZIP codes) to territories while optimizing for multiple metrics.

## Features

- **Interactive Map**: Click states/ZIPs to manually assign to territories
- **Optimization Scenarios**: Primary-balanced and Secondary-balanced
- **Fairness Metrics**: Gini coefficient, Theil index, Equity score, Max/Min ratio
- **Comprehensive Statistics**: Account counts, ICP grades, GP dynamics per territory
- **CSV Export**: Export assignments + key metrics for Excel
- **Flexible Granularity**: State supported; ZIP is experimental

## Architecture

```
territory_tool/
  backend/                # Python FastAPI backend
    main.py               # API entry point
    data_loader.py        # CSV loading & preprocessing
    metrics.py            # Fairness calculations
    optimizer.py          # Territory assignment algorithms
    models.py             # Pydantic schemas
  frontend/               # React TypeScript frontend
    src/
      App.tsx             # Main application
      components/         # UI components
      api/                # API client
      types/              # TypeScript definitions
  icp_scored_accounts.csv # Data file (place in project root)
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm

### Backend Setup

```bash
cd territory_tool/backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run the server
python main.py
# Or: uvicorn main:app --reload --port 8000
```

Backend will be available at http://localhost:8000

### Frontend Setup

```bash
cd territory_tool/frontend

npm install
npm run dev
```

Frontend will be available at http://localhost:5174

Tip: From the repo root you can run `scripts/dev.ps1` to restart both servers and open the site.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Application configuration |
| `/optimize` | POST | Generate optimized territory scenarios |
| `/evaluate` | POST | Evaluate manual territory assignments |
| `/export/csv` | POST | Export assignments + metrics as CSV |

## Usage

1. Start both servers (backend on 8000, frontend on 5174)
2. Select settings: number of territories, granularity, primary/secondary metrics
3. Manual assignment: click states on the map to assign them to the active territory
4. Optimize: click "Optimize" to generate balanced scenarios
5. Compare: switch between Manual/Primary/Secondary tabs
6. View insights: open the drawer to see detailed metrics
7. Export: click "Export CSV" to download a unit-level export for Excel

## Export CSV

Exports one row per unit (State/ZIP) including the assigned territory plus key planning metrics such as GP windows, assets, attention load (grade-weighted), and A/B counts.

## Metrics

- **Combined_ICP_Score**: Average of non-zero division ICP scores
- **Weighted_ICP_Value**: Combined opportunity score derived from ICP + financial scale
- **Gini Coefficient**: Inequality measure (0 = perfect equality)
- **Equity Score**: (1 - Gini) * 100 for a human-friendly display

## License

Internal use only.

