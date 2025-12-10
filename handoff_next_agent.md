# Handoff to Next Agent

**Date:** 2025-12-10
**Status:** Functioning Prototype (US + Canada fully supported with map visualization + Industry Filtering)

## 1. System State
-   **Backend**: Running on `http://localhost:8000`. 
    -   **Data**: Loads **~77,401** accounts (US + Canada). 
    -   **Geography**: 65 State/Province units (50 US + DC + 13 Canada provinces/territories), ~28,339 ZIP codes.
    -   **Metrics**: 13 balancing metrics including **A+B Account Counts** (Hardware, CRE, CPE, Combined, Total).
    -   **Process**: Running in a background terminal.
-   **Frontend**: Running on `http://localhost:5173`.
    -   **Map**: ✅ Visualizes **both US states AND Canadian provinces**.
    -   **Features**: Manual assignments, Seed Selection, Scenario Optimization, **Country Filter Toggle**, **Industry Filter**.

## 2. Recent Changes (Latest Session)

### Session 4 (Dec 10, 2025)
1.  **A+B Account Metrics (COMPLETED)**:
    -   Added 5 new balancing metrics: `Hardware_AB_Count`, `CRE_AB_Count`, `CPE_AB_Count`, `Combined_AB_Count`, `Total_Accounts`.
    -   These count accounts with ICP grades A or B in each division.
    -   Modified `data_loader.py` to compute these in `_compute_derived_metrics()` and aggregate in `_build_unit_aggregates()`.
    -   Updated `ControlPanel.tsx` with human-readable labels for all metrics.

2.  **Industry Filter (COMPLETED)**:
    -   **Backend**: Added `get_unique_industries()` method to `DataStore` class.
    -   **Backend**: `/config` endpoint now returns list of all 20 industries with account counts.
    -   **Backend**: `/optimize` and `/evaluate` endpoints accept `selected_industries` parameter.
    -   **Frontend**: Added collapsible "Industry Filter" panel in `ControlPanel.tsx`.
    -   **Frontend**: "Include All" / "Exclude All" buttons for quick selection.
    -   **Frontend**: Badge shows count of excluded industries (e.g., "20 excluded").
    -   Industry filtering applies at optimization time, not just visualization.

### Session 3 (Dec 9, 2025)
1.  **Map Shading Fix (COMPLETED)**:
    -   Modified `MapView.tsx` to show **no fill** for unassigned states/provinces.
    -   Unassigned regions now display with only subtle borders (`fillColor: 'transparent'`).
    -   Assigned territories show full color shading.

2.  **Geographic Region-Growing Algorithm (COMPLETED)**:
    -   Completely rewrote `geographic_balanced` function in `optimizer.py`.
    -   Uses Voronoi-like priority queue BFS approach for strict contiguity.
    -   Auto-selects k geographically distributed seed states:
        -   2 territories: East/West
        -   3 territories: East/Central/West
        -   4 territories: Quadrants (NE/SE/NW/SW based on latitude + longitude)
        -   5+ territories: Evenly distributed by longitude
    -   Guarantees contiguous territories (except AK, HI, PR which are assigned to least-loaded territory).

3.  **ZIP Code Optimization Fix (COMPLETED)**:
    -   ZIP granularity was broken because no adjacency graph exists for ZIPs.
    -   Implemented two-pass approach in `zip_state_based_balanced()`:
        1.  Aggregate ZIP metrics to state level
        2.  Run `geographic_balanced` on state aggregates
        3.  Assign each ZIP to its parent state's territory
    -   Added `get_zip_to_state_map()` method to `DataStore` class.
    -   Modified `/optimize` endpoint to route to appropriate algorithm based on granularity.

4.  **Right Sidebar Scrolling Fix (COMPLETED)**:
    -   Modified `App.tsx` root div from `min-h-screen` to `h-screen overflow-hidden`.
    -   Added `flex-1 min-h-0 overflow-y-auto` wrapper around `TerritoryList`.
    -   Right sidebar now scrolls independently from the map.

### Previous Session (Dec 9, 2025)
1.  **Canada Map Visualization (COMPLETED)**:
    -   `MapView.tsx` now loads both US states and Canadian provinces from TopoJSON/GeoJSON.
    -   Map bounds auto-adjust to North America.

2.  **Country Filter Toggle (COMPLETED)**:
    -   Region toggle in `ControlPanel.tsx` with US+CA, US Only, CA Only options.
    -   Filter is passed to `MapView` which filters features and adjusts bounds.

## 3. Immediate Next Steps (Updated To-Do List)
1.  ~~**Frontend Map Geometry**~~ ✅ **COMPLETED**
2.  ~~**Map Shading**~~ ✅ **COMPLETED** (no fill until assigned)
3.  ~~**Geographic Territory Optimization**~~ ✅ **COMPLETED** (E/W, E/C/W, quadrants)
4.  ~~**Right Sidebar Scrolling**~~ ✅ **COMPLETED**
5.  ~~**ZIP Code Optimization**~~ ✅ **COMPLETED** (via state-based assignment)
6.  ~~**A+B Account Metrics**~~ ✅ **COMPLETED** (Hardware, CRE, CPE, Combined, Total)
7.  ~~**Industry Filter**~~ ✅ **COMPLETED** (UI + Backend integration)
8.  **ZIP Granularity Visualization** (Lower Priority):
    -   Backend supports ZIPs (~28k units) but rendering them as polygons is slow.
    -   Consider centroids (dots) or clustering for visualization.
9.  **User Seed Selection for Territories**:
    -   The "Set Seed" button exists but full seed-based territory growing isn't fully tested.
    -   The `user_seeds` parameter is passed through the algorithm.
10. **Backend Country Filter** (Nice-to-have):
    -   Country toggle is visual-only. Backend still processes all accounts.

## 4. Technical Details
-   **Backend Command**: `python main.py` (in `territory_tool/backend`).
-   **Frontend Command**: `npm run dev` (in `territory_tool/frontend`).
-   **Ports**: API `8000`, UI `5173`.
-   **Data File**: `icp_scored_accounts.csv` in project root.

### Key Files Modified (This Session - Dec 10):
-   `territory_tool/backend/data_loader.py` - A+B metrics, `get_unique_industries()`, industry filtering
-   `territory_tool/backend/models.py` - `industries` in ConfigResponse, `selected_industries` in requests
-   `territory_tool/backend/main.py` - Industry filtering in `/optimize` and `/evaluate`
-   `territory_tool/frontend/src/components/ControlPanel.tsx` - Industry filter UI, metric labels
-   `territory_tool/frontend/src/App.tsx` - Industry state management, filter passing
-   `territory_tool/frontend/src/types/index.ts` - Industry and metric type updates

### Key Files Modified (Previous Session - Dec 9):
-   `territory_tool/frontend/src/components/MapView.tsx` - No-fill for unassigned regions
-   `territory_tool/frontend/src/App.tsx` - Sidebar scrolling fix
-   `territory_tool/backend/optimizer.py` - New geographic region-growing algorithm + ZIP fallback
-   `territory_tool/backend/data_loader.py` - `get_zip_to_state_map()` method
-   `territory_tool/backend/main.py` - ZIP granularity routing

## 5. Algorithm Details

### Geographic Region-Growing Algorithm
```python
# In optimizer.py: geographic_balanced()
# 1. Select k seed states based on longitude distribution
# 2. Initialize priority queue with seed neighbors
# 3. Pop territory with lowest metric load
# 4. Assign neighbor unit to that territory
# 5. Add new neighbors to priority queue
# 6. Repeat until all mainland units assigned
# 7. Assign island states (AK, HI, PR) to least-loaded territory
```

### ZIP Optimization Algorithm
```python
# In optimizer.py: zip_state_based_balanced()
# 1. Aggregate all ZIP metrics to their parent state
# 2. Run geographic_balanced() on state aggregates
# 3. Each ZIP inherits its parent state's territory assignment
```

## 6. Known Issues
-   **ZIP Contiguity Warning**: Shows "Contiguity not enforced for granularity 'zip'" - this is expected since ZIPs are assigned via their parent states.
-   **Country Filter is Visual-Only**: The toggle filters map display but doesn't filter backend data.
-   **Territory Balance for ZIPs**: Since ZIPs are assigned by state, some imbalance occurs when large states have many accounts.
-   **Industry Filter Re-optimization**: When industries are toggled, the user must click "Optimize Territories" again to see updated results. There's no auto-refresh.

## 7. Available Metrics
The system supports the following balancing metrics:
| Metric Key | Display Name | Description |
|------------|--------------|-------------|
| `Combined_ICP_Score` | Combined ICP Score | Weighted combination of all ICP scores |
| `Hardware_ICP` | Hardware ICP | Hardware division ICP score |
| `CRE_ICP` | CRE ICP | CRE division ICP score |
| `CPE_ICP` | CPE ICP | CPE division ICP score |
| `Spend_12m` | Spend (12mo) | 12-month spending |
| `GP_T4Q` | GP (T4Q) | Gross profit trailing 4 quarters |
| `GP_Since2023` | GP (Since 2023) | Gross profit since 2023 |
| `Weighted_ICP_Value` | Weighted ICP Value | ICP score weighted by spending potential |
| `Hardware_AB_Count` | Hardware A+B Accounts | Count of accounts with Hardware ICP grade A or B |
| `CRE_AB_Count` | CRE A+B Accounts | Count of accounts with CRE ICP grade A or B |
| `CPE_AB_Count` | CPE A+B Accounts | Count of accounts with CPE ICP grade A or B |
| `Combined_AB_Count` | All A+B Accounts | Count of accounts with Combined ICP tier A or B |
| `Total_Accounts` | Total Accounts | Total count of accounts |

## 8. Industry List
The system tracks 20 industries (as of current dataset):
- Aerospace & Defense (4,544)
- Automotive & Transportation (3,340)
- Building & Construction (3,525)
- Chemicals & Related Products (294)
- Consumer Goods (2,485)
- Dental (137)
- Education & Research (1,530)
- Electromagnetic (1)
- Energy (1,297)
- Health Care (1)
- Heavy Equip & Ind. Components (2,771)
- High Tech (5,728)
- Industrial Machinery (4,635)
- Manufactured Products (1,828)
- Materials (1)
- Medical Devices & Life Sciences (3,671)
- Mold, Tool & Die (1,457)
- Packaging (86)
- Plant & Process (394)
- Services (6,923)

---
**Agent Note**: Both backend and frontend are currently running in background terminals. To restart:
- Backend: Find PID via `netstat -ano | findstr 8000` and kill it, then run `python main.py` in `territory_tool/backend`.
- Frontend: Find PID via `netstat -ano | findstr 5173` and kill it, then run `npm run dev` in `territory_tool/frontend`.
