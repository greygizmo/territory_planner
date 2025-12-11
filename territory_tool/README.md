# ICP Territory Builder

Interactive territory planning tool for ICP-scored accounts. Enables balanced assignment of geographic units (states or ZIP codes) to territories while optimizing for multiple metrics.

## Features

- **Interactive Map**: Click states/ZIPs to manually assign to territories
- **Three Optimization Scenarios**: Primary-balanced, Secondary-balanced, and Dual-balanced
- **Fairness Metrics**: Gini coefficient, Theil index, Equity score, Max/Min ratio
- **Comprehensive Statistics**: Account counts, ICP grades, spend dynamics per territory
- **Flexible Granularity**: Switch between State and ZIP level planning

## Architecture

```
territory_tool/
├── backend/               # Python FastAPI backend
│   ├── main.py           # API entry point
│   ├── data_loader.py    # CSV loading & preprocessing
│   ├── metrics.py        # Fairness calculations
│   ├── optimizer.py      # Greedy balancing algorithms
│   └── models.py         # Pydantic schemas
├── frontend/             # React TypeScript frontend
│   ├── src/
│   │   ├── App.tsx       # Main application
│   │   ├── components/   # UI components
│   │   ├── api/          # API client
│   │   └── types/        # TypeScript definitions
│   └── ...
└── icp_scored_accounts.csv  # Data file (place in project root)
```

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

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

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will be available at http://localhost:5173

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/config` | GET | Application configuration |
| `/optimize` | POST | Generate optimized territory scenarios |
| `/evaluate` | POST | Evaluate manual territory assignments |

## Usage

1. **Start both servers** (backend on 8000, frontend on 5173)
2. **Select settings**: Number of territories, granularity, primary/secondary metrics
3. **Manual assignment**: Click states on the map to assign them to the active territory
4. **Optimize**: Click "Optimize Territories" to generate balanced scenarios
5. **Compare**: Switch between Manual/Primary/Secondary/Dual tabs to compare
6. **View insights**: Click the drawer handle at bottom to see detailed metrics

## Optimization Algorithms

### Primary-Balanced
Greedy first-fit-decreasing on primary metric. Sorts units by primary value (descending) and assigns each to the territory with minimum current primary load.

### Secondary-Balanced  
Same algorithm but optimizes for secondary metric.

### Dual-Balanced
Weighted penalty function balancing both metrics:
- 70% weight on primary metric deviation
- 30% weight on secondary metric deviation

## Metrics

- **Combined_ICP_Score**: Average of non-zero division ICP scores
- **Weighted_ICP_Value**: Combined_ICP_Score × log1p(spend_12m)
- **Gini Coefficient**: Inequality measure (0 = perfect equality)
- **Equity Score**: (1 - Gini) × 100 for human-friendly display

## License

Internal use only.


