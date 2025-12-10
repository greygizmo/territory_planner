# ICP Territory Builder – Implementation Plan & Status

**Last Updated:** 2025-12-09
**Status:** Active Prototype / Alpha

This document outlines the architecture, current status, and roadmap for the **ICP Territory Builder**, an internal interactive tool for optimizing sales territories based on ICP scores and spend data.

---

## 1. Project Overview

**Objective:**
Build a web-based tool to load `icp_scored_accounts.csv`, visualize geographic distribution (State/ZIP), and generate balanced territory assignments using greedy optimization algorithms.

**Constraint Checklist & Confidence Score:**
1. Load `icp_scored_accounts.csv` included in repo? **Yes**.
2. Granularity: State (Supported), ZIP (Data loaded, visualization pending).
3. Optimize for 2-3 scenarios? **Yes** (Primary, Secondary, Dual).
4. Manual assignments & Locks? **Yes**.
5. Seed Selection? **Yes**.
6. Canada Support? **Backend Ready / Frontend Pending**.

---

## 2. Architecture

### 2.1 Backend (`territory_tool/backend`)
- **Framework:** FastAPI
- **Data Engine:** Pandas (in-memory).
- **Key Modules:**
  - `data_loader.py`: Singleton `DataStore`. Loads ~77k accounts (US + Canada). Handles scrubbing and aggregation.
    - **Note:** Default country filter is `["_unitedStates", "_canada"]`.
  - `optimizer.py`: Implements "First Fit Decreasing" greedy algorithms.
    - **Features:** Contiguity checks (BFS), Island handling (AK/HI/PR relaxed), Seed injection.
  - `main.py`: API endpoints (`/config`, `/optimize`, `/evaluate`).

### 2.2 Frontend (`territory_tool/frontend`)
- **Framework:** React + Vite + TypeScript.
- **Styling:** TailwindCSS.
- **Map Engine:** `react-leaflet`.
- **Key Components:**
  - `MapView.tsx`: Renders GeoJSON. **Current Limitation:** Loads `us-atlas` (US States only).
  - `ControlPanel.tsx`: Global settings (K, Granularity, Metrics).
  - `TerritoryList.tsx`: Active Scenario stats, Seed selection UI.
  - `App.tsx`: State management (Manual vs Optimized scenarios).

---

## 3. Current Implementation Status

### ✅ Completed Features
1.  **US + Canada Data Pipeline**: 
    - Backend correctly loads Canadian provinces and normalizes codes (e.g., "Alberta" -> "AB").
    - Adjacency graph updated to link US states with Canadian provinces (e.g., WA <-> BC).
2.  **Optimization Engine**:
    - **Primary/Secondary/Dual Balance**: Works.
    - **Locking**: Users can hard-lock units.
    - **Seed Selection**: Users can pick a "Seed" unit (e.g., "TX" for T1), which creates a soft lock and encourages growth around that point.
    - **Contiguity**: 
        - State-level: Enforced (graph-based).
        - Islands: AK/HI allowed to be non-contiguous.
        - ZIP-level: Disabled (no graph data).
3.  **User Interface**:
    - **Interactive Map**: Click to assign/unassign.
    - **Metrics Display**: Real-time updates of "Spend 12m", "ICP Scores", "Grade Mix".
    - **Seed UI**: explicit "Set Seed" mode implemented in `TerritoryList`.

### ⚠️ Known Issues / Gaps
-   **Missing Map Geometry for Canada**: The backend has the data (`AB`, `BC`, etc.), but the frontend map uses `us-atlas`, so Canadian provinces **do not appear on the map**.
-   **ZIP Level Visualization**: Selecting "ZIP" granularity loads the data, but the map currently has no layer to display ZIPs (needs centroids or polygon tiles).
-   **ZIP Contiguity**: The optimizer will scatter ZIPs randomly because we lack a ZIP adjacency graph or lat/lon coordinates for geometric clustering.

---

## 4. Roadmap & Next Steps

### Phase 1: Geography Fixes (Immediate Priority)
1.  **Update Map Source**: Switch `MapView.tsx` to use a North America GeoJSON (combining US + Canada) instead of `us-atlas`.
    -   *Candidate source*: `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json` (filtering for US/CA) or a combined North America topojson.
2.  **Verify Canada Interaction**: Ensure clicking invisible/newly visible Canadian polygons correctly sends state codes (`AB`, `ON`) to the API.

### Phase 2: ZIP Granularity Maturation
To support the goal of "Breaking up large states (e.g., CA/TX)":
1.  **Acquire ZIP Geometry**: Download a ZIP Code Tabulation Area (ZCTA) GeoJSON or Centroid list.
    -   *Strategy*: Use centroids for performance (rendering 30k polygons is heavy). Render as circles/dots.
2.  **Implement ZIP Adjacency**: 
    -   Use `scipy.spatial.Delaunay` or `k-NN` on centroids to build a runtime adjacency graph in Python.
    -   Enable contiguity checks for ZIPs in `optimizer.py`.

### Phase 3: Advanced Features
-   **Sub-State Regions**: Instead of raw ZIPs, group ZIPs into "Metro Areas" or "Counties" for easier balancing.
-   **Export**: functionality to export assignments to CSV/Excel.
-   **Persistence**: Save/Load scenarios to disk/database.

---

## 5. Developer Guide

### Running Locally
1.  **Backend**:
    ```bash
    cd territory_tool/backend
    # Optional: set TERRITORY_COUNTRIES="_unitedStates,_canada"
    python main.py
    ```
    *Runs on http://localhost:8000*

2.  **Frontend**:
    ```bash
    cd territory_tool/frontend
    npm run dev
    ```
    *Runs on http://localhost:5173*

### Critical Files
-   `territory_tool/backend/data_loader.py`: Adjust `VALID_STATES` or `STATE_ADJACENCY` here.
-   `territory_tool/frontend/src/components/MapView.tsx`: Controls GeoJSON loading and rendering style.
