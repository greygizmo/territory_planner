# ICP Territory Builder – Implementation Plan for Opus 4.5

This document is an instruction set and implementation plan for building an internal, prototype **web-based ICP territory builder** that operates on `icp_scored_accounts.csv` from the `cust_seg` repository (root level).

The tool is **for your personal / internal use only**, not production-grade, and should prioritize **clarity, explainability, and interactive exploration** over perfect optimization.

---

## 1. Goals & Constraints

**Objective**

Build an interactive *territory builder* that lets you:

- Load `icp_scored_accounts.csv` (root-level file in the repo).
- Choose **granularity**: State or ZIP.
- Set **number of territories (k)**.
- Choose **two metrics** to balance / optimize.
- Manually assign states/ZIPs (click or brush on the map).
- **Lock** those manual assignments.
- Hit **Optimize** to get **2–3 alternative balanced scenarios** that respect locks.
- See, per territory:
  - Key ICP and spend metrics.
  - Letter grade mix (divisional ICP grades, account priority tiers).
  - “Major spend dynamics” (size, growth, trend, risk/opportunity).

**Constraints & tone**

- Internal-use prototype; **no auth**, no hardening required.
- Keep architecture simple: **FastAPI backend + React/Leaflet frontend** is fine.
- Optimization should be **fast & understandable**, not mathematically perfect.
- UI is **information-heavy** but should avoid overwhelming the user with noise.

---

## 2. Data & Metrics from `icp_scored_accounts.csv`

`icp_scored_accounts.csv` will live at the **repo root**, generated from your Power BI / Power Query pipeline. The Power Query M, DAX measures, and measures text files describe what’s inside:

- `icp_scored_accounts_powerquery.m`
- `powerbi_measures.txt`
- `icp_overview_help_complete.dax`

Use those to understand columns and semantics, but the **source of truth** for the tool is the CSV itself.

### 2.1. Core Columns to Expect

From the Power BI model and queries, you should expect at least the following *types* of fields in `icp_scored_accounts.csv`:

**Identifiers & geography**

- `Customer ID` – primary key.
- `Company Name`.
- `ShippingState` (or similar) – **use as State granularity**.
- `ShippingZip` (or similar) – **use as ZIP granularity**.
- `ShippingCity`, `ShippingCountry` (context only).
- Existing sales fields like `AM_Territory`, `AM_Sales_Rep` (optional context).

**Division-specific ICP scores & grades**

- `Hardware_ICP_Score`, `Hardware_ICP_Grade`.
- `CRE_ICP_Score`, `CRE_ICP_Grade`.
- `CPE_ICP_Score`, `CPE_ICP_Grade`.

Grades are typically `A/B/C/D/F` plus blanks.

**ICP percentile / composite metrics**

- Fields like `Hardware_ICP_pctl_all`, `Hardware_ICP_pctl_activity`, etc.
- These are helpful but not required in the core UI.

**Spend & profitability**

- Overall:
  - `spend_12m`, `spend_13w`, `spend_24m`, `spend_36m`.
  - `delta_13w`, `delta_13w_pct` – 13-week changes.
  - `yoy_13w_pct` – 13-week YoY change.
  - `delta_12m`, `delta_12m_pct` – annual changes.
  - `volatility_13w`, `seasonality_factor_13w`.
  - `GP_T4Q_Total`, `GP_Since_2023_Total` – profitability.

- By division (hardware, CRE, CPE):
  - `spend_12m_hw`, `spend_13w_hw`, `delta_13w_pct_hw`, `yoy_13w_pct_hw`, etc.
  - `spend_12m_cre`, `spend_13w_cre`, `delta_13w_pct_cre`, `yoy_13w_pct_cre`, etc.
  - `spend_12m_cpe`, `spend_13w_cpe`, etc.

**Engagement, risk, and opportunity scores**

From your Power BI measures and help docs, you’ll see composites such as:

- `trend_score`, `recency_score`, `magnitude_score`, `cadence_score`.
- `momentum_score`.
- `churn_risk_score`, `expansion_opportunity_score`.
- `engagement_health_score`.

Treat these as *per-account scores* you can average/weight at territory level.

**Priority / classification**

- `Account_Priority_Tier` – text like:
  - `"A - Strategic"`
  - `"B - Growth"`
  - `"C - Maintain"`
  - `"D - Monitor"`
- `Next_Best_Action` – text signal (optional to show in UI).

**Provenance**

- `as_of_date`, `run_ts_utc` – not used in UI but good for debugging.

> **Agent note:** When loading the CSV, explicitly coerce numeric vs text columns, using your Power Query TypeMap as guidance, so there are no surprises at runtime.

---

### 2.2. Metrics to Expose in the Territory Builder

We want a **short, curated list** of metrics to keep the UI focused.

#### 2.2.1. Balancing Metrics (Primary & Secondary)

Expose these as **selectable metrics** for the balancing / fairness engine:

**ICP-based**

- `Hardware_ICP_Score`
- `CRE_ICP_Score`
- `CPE_ICP_Score`
- `Combined_ICP_Score` (derived; see below).

**Spend / value**

- `spend_12m` – 12-month spend (core measure of account value).
- `GP_T4Q_Total` – trailing 4 quarters gross profit.
- `GP_Since_2023_Total` – long-window gross profit.

**Composite / priority**

- `Account_Priority_Tier` – mapped to numeric for fairness:
  - `A -> 4`, `B -> 3`, `C -> 2`, `D -> 1`.
- `Weighted_ICP_Value` – **derived metric**:
  - `Weighted_ICP_Value = Combined_ICP_Score * log1p(spend_12m)`

> **Recommended defaults**
>
> - **Primary metric**: `Weighted_ICP_Value`
> - **Secondary metric**: `spend_12m`

#### 2.2.2. `Combined_ICP_Score` (Derived)

Implement this in Python based on the same logic as your DAX measure:

```python
import numpy as np

hw  = df["Hardware_ICP_Score"].fillna(0)
cre = df["CRE_ICP_Score"].fillna(0)
cpe = df["CPE_ICP_Score"].fillna(0)

div_count = (hw > 0).astype(int) + (cre > 0).astype(int) + (cpe > 0).astype(int)
df["Combined_ICP_Score"] = np.where(
    div_count > 0,
    (hw + cre + cpe) / div_count,
    0.0,
)
```

Then:

```python
df["Weighted_ICP_Value"] = df["Combined_ICP_Score"] * np.log1p(df["spend_12m"].fillna(0))
```

#### 2.2.3. Letter Grades per Territory

We care about:

- `Hardware_ICP_Grade`
- `CRE_ICP_Grade`
- `CPE_ICP_Grade`
- `Account_Priority_Tier`

Per territory, compute **counts** and **percentages** for:

- Each letter grade: `A, B, C, D, F, Blank`.
- Priority tiers: `A - Strategic`, `B - Growth`, `C - Maintain`, `D - Monitor`.

Store per territory as:

```json
"grades": {
  "Hardware_ICP_Grade": { "A": 10, "B": 40, "C": 20, "D": 5, "F": 2, "Blank": 3 },
  "CRE_ICP_Grade":      { ... },
  "CPE_ICP_Grade":      { ... },
  "Account_Priority_Tier": {
    "A - Strategic": 4,
    "B - Growth": 15,
    "C - Maintain": 20,
    "D - Monitor": 10
  }
}
```

Percentages are computed client-side (counts / total accounts).

#### 2.2.4. “Major Spend Dynamics”

From the many metrics available, pick a **small set** that is most intuitive:

Per territory, aggregate:

- **Size**
  - `spend_12m` (sum).
  - `spend_13w` (sum).
  - `GP_T4Q_Total` (sum).
  - `GP_Since_2023_Total` (sum).

- **Short-term movement**
  - `delta_13w_pct` – weighted average.
  - `yoy_13w_pct` – weighted average.
  - Weight by `max(spend_13w, 1)` to emphasize bigger accounts.

- **Engagement composite**
  - `trend_score` – average or weighted average.
  - `recency_score` – average.
  - `momentum_score` – average.
  - `engagement_health_score` – average.

Backend representation:

```json
"spend_dynamics": {
  "spend_12m": 1234567.89,
  "spend_13w": 12345.6,
  "delta_13w_pct": 0.12,
  "yoy_13w_pct": 0.08,
  "gp_t4q_total": 654321.0,
  "gp_since_2023_total": 765432.1,
  "trend_score": 0.78,
  "recency_score": 0.66,
  "momentum_score": 72.0,
  "engagement_health_score": 81.0
}
```

---

## 3. Backend – Architecture & Endpoints

### 3.1. Stack & Structure

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **Libs**: `pandas`, `numpy`
- Optional later: `networkx` or `pulp` for more advanced optimization.

Suggested layout:

```text
territory_tool/
  backend/
    main.py             # FastAPI app (entry)
    data_loader.py      # CSV loading & preprocessing
    metrics.py          # fairness + derived metrics
    optimizer.py        # greedy balancing & scenario generation
    models.py           # Pydantic models for API IO
  frontend/
    ...                 # React app
icp_scored_accounts.csv # CSV from cust_seg root
```

### 3.2. Backend Responsibilities

1. **Load & preprocess data at startup**
   - Read `icp_scored_accounts.csv` from repo root.
   - Normalize column names (strip whitespace, but keep case).
   - Coerce types using information from your Power Query script.
   - Compute `Combined_ICP_Score` and `Weighted_ICP_Value`.

2. **Expose configuration**
   - Available numeric metrics (the curated list above).
   - Default primary/secondary metrics.
   - Grade fields.
   - Row counts, unique state count, unique ZIP count.

3. **Aggregate by unit (state/ZIP)** for optimization and stats.
   - For `granularity == "state"`: use `ShippingState`.
   - For `granularity == "zip"`: use `ShippingZip`.
   - For each unit:
     - Sum of numeric metrics.
     - Lists for grades.
     - Components needed to compute spend dynamics.

4. **Provide optimization and evaluation APIs**.

---

### 3.3. Data Aggregation by Unit

Implement a function:

```python
def build_unit_aggregates(df: pd.DataFrame, granularity: str) -> dict[str, dict]:
    # granularity: "state" or "zip"
    ...
```

For each unit (e.g., `"CA"` or `"94103"`), store:

```python
unit_values[unit_id] = {
    "accounts": account_ids_list_or_count,
    "primary_base": value,     # will be recomputed based on chosen metric
    "secondary_base": value,   # same
    "spend_12m": sum,
    "spend_13w": sum,
    "GP_T4Q_Total": sum,
    "GP_Since_2023_Total": sum,
    "delta_13w_pct_components": { ... },   # e.g., sums for weighted average
    "yoy_13w_pct_components": { ... },
    "trend_score_components": { ... },
    "grades": {
        "Hardware_ICP_Grade": [...list of grades per account...],
        "CRE_ICP_Grade": [...],
        "CPE_ICP_Grade": [...],
        "Account_Priority_Tier": [...]
    },
    # Optionally, raw arrays of primary/secondary metric per account
}
```

However, to keep it simple:

- For **optimization**, you only need `primary` and `secondary` aggregated per unit.
- For **territory stats**, you need grade lists and spend dynamics components.
- You can compute `primary` & `secondary` on the fly from the accounts as needed, but pre-aggregation improves performance.

---

### 3.4. API Endpoints

Implement at least:

- `GET /health`
- `GET /config`
- `POST /optimize`
- `POST /evaluate`

#### 3.4.1. `GET /health`

Simple healthcheck:

```json
{ "status": "ok" }
```

#### 3.4.2. `GET /config`

Returns configuration used by the frontend:

```json
{
  "granularities": ["state", "zip"],
  "default_granularity": "state",
  "numeric_metrics": [
    "Combined_ICP_Score",
    "Hardware_ICP_Score",
    "CRE_ICP_Score",
    "CPE_ICP_Score",
    "spend_12m",
    "GP_T4Q_Total",
    "GP_Since_2023_Total",
    "Weighted_ICP_Value"
  ],
  "default_primary_metric": "Weighted_ICP_Value",
  "default_secondary_metric": "spend_12m",
  "grade_fields": [
    "Hardware_ICP_Grade",
    "CRE_ICP_Grade",
    "CPE_ICP_Grade",
    "Account_Priority_Tier"
  ],
  "row_count": 12345,
  "state_count": 50,
  "zip_count": 5000
}
```

#### 3.4.3. `POST /optimize`

**Request:**

```json
{
  "k": 8,
  "granularity": "state",
  "primary_metric": "Weighted_ICP_Value",
  "secondary_metric": "spend_12m",
  "locked_assignments": {
    "CA": "T1",
    "NV": "T1",
    "NY": "T2"
  }
}
```

**Behavior:**

- Validate inputs.
- Use `build_unit_aggregates` for the selected granularity.
- Compute per-unit `primary` & `secondary` values based on chosen metrics.
- Apply `locked_assignments` as hard constraints.
- Generate **3 scenarios** (see Section 4):
  - `primary` – primary-balanced.
  - `secondary` – secondary-balanced.
  - `dual` – both metrics balanced.
- For each scenario, compute territory stats, fairness metrics, and unassigned units.

**Response shape:**

```json
{
  "scenarios": [
    {
      "id": "primary",
      "label": "Primary-balanced",
      "description": "Greedy balance on primary metric.",
      "assignments": {
        "CA": "T1",
        "OR": "T1",
        "WA": "T1",
        "...": "..."
      },
      "territory_stats": {
        "T1": {
          "territory_id": "T1",
          "primary_sum": 123456.7,
          "secondary_sum": 987654.3,
          "account_count": 321,
          "grades": { ... },
          "spend_dynamics": { ... }
        },
        "T2": {
          "...": "..."
        }
      },
      "fairness_primary": {
        "gini": 0.07,
        "theil": 0.03,
        "max_min_ratio": 1.23,
        "equity_score": 93
      },
      "fairness_secondary": {
        "gini": 0.10,
        "theil": 0.04,
        "max_min_ratio": 1.30,
        "equity_score": 90
      },
      "unassigned_units": ["AK", "HI"]
    },
    {
      "id": "secondary",
      "...": "..."
    },
    {
      "id": "dual",
      "...": "..."
    }
  ]
}
```

#### 3.4.4. `POST /evaluate`

Used to evaluate a **manual** assignment (e.g., after clicking states on the map).

**Request:**

```json
{
  "k": 8,
  "granularity": "state",
  "primary_metric": "Weighted_ICP_Value",
  "secondary_metric": "spend_12m",
  "assignments": {
    "CA": "T1",
    "NV": "T1",
    "OR": "T2",
    "...": "..."
  }
}
```

**Response:**

Single `scenario` object with the same shape as those in `/optimize`, but with `id = "manual"` and `label = "Manual"`.

---

## 4. Optimization & Fairness Logic

The optimizer works **at the unit level** (state or ZIP), not per account.

The guiding principles:

- Users can **lock** units into specific territories.
- The optimizer **never moves locked units**.
- Unassigned units are greedily assigned to territories to improve balance.

### 4.1. Fairness Metrics

Fairness is evaluated **per metric** (primary and secondary), based on per-territory totals.

Let `y_t` be the per-territory value for territory `t` (e.g., total primary metric).

#### 4.1.1. Gini Coefficient

```python
import numpy as np

def gini(values: np.ndarray) -> float:
    x = np.asarray(values, dtype=float)
    x = x[x >= 0]
    if x.size == 0:
        return 0.0
    mean = x.mean()
    if mean == 0:
        return 0.0
    diff_sum = np.abs(x[:, None] - x[None, :]).sum()
    n = x.size
    return float(diff_sum / (2.0 * n * n * mean))
```

#### 4.1.2. Theil Index

```python
def theil(values: np.ndarray) -> float:
    x = np.asarray(values, dtype=float)
    x = x[x > 0]
    if x.size == 0:
        return 0.0
    mean = x.mean()
    if mean == 0:
        return 0.0
    ratios = x / mean
    return float((ratios * np.log(ratios)).sum() / x.size)
```

#### 4.1.3. Equity Score (Human-friendly)

```python
def equity_score_from_gini(g: float) -> int:
    score = int(round((1.0 - max(0.0, min(g, 1.0))) * 100))
    return max(0, min(score, 100))
```

Also compute:

- `max_min_ratio = max(y_t) / min(y_t)` (over non-zero values).

Expose all of these per scenario and per metric.

### 4.2. Greedy Optimizer with Locks & 3 Scenarios

We work with:

```python
unit_values[unit_id] = {
  "primary": float,
  "secondary": float,
  "count": int,
  # plus extra fields for stats
}
```

**Inputs:**

- `unit_values`
- `k`
- `locked_assignments` – `unit_id -> territory_id`.

**Territory IDs:**

- Use `"T1"`, `"T2"`, …, `"Tk"`.

#### 4.2.1. Applying Locks

1. Initialize:

   ```python
   territory_ids = [f"T{i+1}" for i in range(k)]
   assignments = {}
   load_primary = {tid: 0.0 for tid in territory_ids}
   load_secondary = {tid: 0.0 for tid in territory_ids}
   ```

2. For each `(unit, tid)` in `locked_assignments`:
   - If `unit` not in `unit_values`, skip.
   - If `tid` not in `territory_ids`, skip.
   - Assign `assignments[unit] = tid`.
   - Accumulate loads.

3. Remaining units are those **not** in `assignments`.

#### 4.2.2. Scenario A – Primary-Balanced

Greedy “first fit decreasing” by primary value.

Algorithm:

1. Get `remaining_units = sorted(units, key=lambda u: unit_values[u]["primary"], reverse=True)`.
2. For each `u` in `remaining_units`:
   - Choose territory `tid` with minimum `load_primary[tid]`.
   - Assign `assignments[u] = tid`.
   - Update loads.

Return `assignments` for scenario `"primary"`.

#### 4.2.3. Scenario B – Secondary-Balanced

Same as scenario A, but:

- Sort units by `secondary` descending.
- At each step, assign to territory with **minimum** `load_secondary`.

Scenario id: `"secondary"`.

#### 4.2.4. Scenario C – Dual-Balanced

Balance both metrics against targets.

1. Compute:

   ```python
   total_p = sum(v["primary"] for v in unit_values.values())
   total_s = sum(v["secondary"] for v in unit_values.values())
   target_p = total_p / k if k > 0 else 0.0
   target_s = total_s / k if k > 0 else 0.0
   ```

2. Build `remaining_units` sorted descending by a weighted size:

   ```python
   w_primary, w_secondary = 0.7, 0.3

   remaining_units = sorted(
       remaining_units,
       key=lambda u: (
           w_primary * unit_values[u]["primary"]
           + w_secondary * unit_values[u]["secondary"]
       ),
       reverse=True,
   )
   ```

3. For each `u` in `remaining_units`:
   - For each territory `tid`, compute penalty if `u` were assigned there:

     ```python
     new_p = load_primary[tid] + unit_values[u]["primary"]
     new_s = load_secondary[tid] + unit_values[u]["secondary"]

     score_p = abs(new_p - target_p) / (target_p + 1e-9)
     score_s = abs(new_s - target_s) / (target_s + 1e-9)
     score = w_primary * score_p + w_secondary * score_s
     ```

   - Assign `u` to `tid` with **lowest** `score`.

Scenario id: `"dual"`.

These heuristics are:

- Fast (greedy, no heavy optimization).
- Easy to explain to a leader (“this scenario keeps primary metric as even as possible,” etc.).

### 4.3. Locking Semantics

- Locked units **must** stay in their specified territories for `/optimize`.
- `locked_assignments` are created from your **current manual map** state.
- Unassigned units are free to move among territories in the optimizer.
- `/evaluate` always treats the provided `assignments` as “ground truth” and only computes stats; it does **not** perform optimization.

---

## 5. Frontend / UI Implementation

The UI is a single-page web app where the **map is the star**.

### 5.1. Stack

- Framework: **React** (TypeScript preferred).
- Map: **React-Leaflet** with **Leaflet**.
- Charts: simple library like Recharts or just basic SVG / HTML, but charts can be minimal for MVP.

Folder structure (inside `frontend/`):

```text
frontend/
  src/
    App.tsx
    components/
      MapView.tsx
      ControlPanel.tsx
      TerritoryList.tsx
      ScenarioTabs.tsx
      InsightsDrawer.tsx
    data/
      us_states.geojson   # polygons with STUSPS codes
```

### 5.2. Layout Overview

- **Top bar**: title + dataset stats + global status (loading, error).
- **Main area**:
  - Left: **Map** (full height).
  - Right: **Control panel** + territory list.
- **Bottom**: **Insights drawer** (global stats, fairness, territory comparison).

### 5.3. Map Behavior

**State mode**:

- Load a GeoJSON of US states.
- Assume each feature has a 2-letter code property (`STUSPS`, `STUSPS10`, or similar).
- For each state:
  - Determine which territory it belongs to based on the **current scenario**’s `assignments`.
  - Fill color from that territory’s color.
  - Light grey outline for borders.

**ZIP mode**:

- Initially, you can stub this out or:
  - Use a lightweight ZIP centroid set and draw circles.
  - Later, add ZIP polygons if needed.

**Interactions**:

- Right panel territory list: click a territory → **sets active territory**.
- Map click on a unit (state/ZIP):
  - If in **manual mode**:
    - If the unit is already assigned to active territory → unassign it.
    - Else → assign to active territory.
  - After mutation:
    - Update local `manual.assignments` in state.
    - Call `/evaluate` to recalc stats.

Optional later: brush selection (lasso or rectangle) to assign multiple units at once.

### 5.4. Scenario Tabs & Manual Workflow

Scenarios:

- `manual` – user’s current hand-edited assignments.
- `primary` – primary-balanced suggestion.
- `secondary` – secondary-balanced.
- `dual` – dual-balanced.

The UI behavior:

1. On load, fetch `/config`, set defaults.
2. Call `/evaluate` with an empty `assignments` → baseline manual scenario.
3. When user changes:
   - `k`
   - `granularity`
   - `primaryMetric`/`secondaryMetric`
   - or manual assignments
   → re-call `/evaluate` to update manual scenario.

4. When user clicks **Optimize territories**:
   - Build `locked_assignments` from the **manual scenario assignments**.
   - POST `/optimize` with current config + locks.
   - Store returned scenarios in local state.
   - Highlight the first optimized scenario (e.g., `primary`) as active.

5. The map always reflects the **active** scenario.
6. Button: **“Use this scenario as Manual”**:
   - Copies that scenario’s `assignments` into `manual` and calls `/evaluate`.
   - Sets active tab back to `manual` (so further map edits are on the manual scenario).

### 5.5. Territory List UI (Side Panel)

For each territory `T1...Tk`:

- Header:
  - Color dot.
  - Territory name (`Territory 1 (T1)`), optionally editable.
  - Account count (from `territory_stats[t].account_count`).

- Primary & secondary metrics:
  - Show **values** (`primary_sum`, `secondary_sum`) with 1 decimal or compact formatting.
  - Compute **ideal** loads:
    - `ideal_primary = total_primary / k`
    - `ideal_secondary = total_secondary / k`
  - Show a mini bar vs ideal and a simple ratio, e.g., `1.08× ideal`.
  - Color the bar gently (no loud red/green yet).

- Grade mix:
  - Show **percentages** collapsed into A/B vs C/D/F for each division to avoid clutter:
    - HW: `A/B 45% • C–F 55%`
    - CRE: `A/B 30% • C–F 70%`
    - Priority: `A+B 25% • C+D 75%`
  - Optionally show details on hover/tooltip.

- Spend dynamics (one line):
  - Example:
    - `12m: $3.4M • 13w: $210k • Δ13w: +12% • YoY: +8%`

All this should be stacked compactly so territory rows are short and scannable.

### 5.6. Insights Drawer (Bottom)

The goal is to give the territory planner **confidence** in the scenario without flooding them.

Sections:

**1. Global metrics**

- Primary & secondary total and ideal per territory.
- Count of unassigned units.
- Possibly a small note if many units are still unassigned.

**2. Fairness**

For **current scenario**:

- Primary metric:
  - Equity score (big number).
  - Gini, Theil, Max/Min ratio (small numbers).
- Secondary metric:
  - Same set.

Optionally show a mini **bar chart** of primary per territory vs ideal (even with plain HTML/CSS).

**3. Scenario comparison**

Small table layout:

| Scenario   | Equity (primary) | Gini (primary) | Max/Min (primary) | Equity (secondary) |
|-----------|------------------|----------------|--------------------|--------------------|
| Manual    | 87               | 0.11           | 1.30×              | 90                 |
| Primary   | 93               | 0.07           | 1.20×              | 88                 |
| Secondary | 89               | 0.09           | 1.25×              | 95                 |
| Dual      | 91               | 0.08           | 1.22×              | 92                 |

**4. Territory comparison table**

Columns:

- Territory
- Primary value + vs ideal ratio
- Secondary value + vs ideal ratio
- Accounts
- `% HW A/B` (or HW grade mix)
- `% CRE A/B`
- `% CPE A/B`
- `% Priority A+B`

Keep this scrollable inside the drawer.

---

## 6. Work Plan / Checklist for the Coding Agent

### Phase 1 – Backend Data & Skeleton

1. Create `territory_tool/backend` and initialize FastAPI app in `main.py`.
2. Install dependencies: `fastapi`, `uvicorn[standard]`, `pandas`, `numpy`.
3. Implement `data_loader.py`:
   - Load `icp_scored_accounts.csv` from repo root.
   - Trim column name whitespace.
   - Coerce numeric columns based on known fields (ICP scores, spend, GP, scores).
   - Compute `Combined_ICP_Score` and `Weighted_ICP_Value`.
4. Implement `build_unit_aggregates(df, granularity)`:
   - Group by `ShippingState` or `ShippingZip`.
   - For each unit id, compute:
     - `account_count`.
     - Sum of relevant numeric metrics.
     - Grade lists for each grade field.
     - Components for spend dynamics (per-unit sums/averages).

5. Implement `GET /config` to expose:
   - Metric options, default metrics, grade fields, counts.

### Phase 2 – Metrics & Evaluation

6. Implement `metrics.py`:
   - `gini(values)`, `theil(values)`, `equity_score_from_gini(g)`.
   - Helper to compute `territory_stats` from:
     - `assignments`, `unit_values`, `k`.
   - Logic to aggregate grades & spend dynamics into the `territory_stats` structure used by the API.

7. Implement `POST /evaluate`:
   - Accept `k`, `granularity`, `primary_metric`, `secondary_metric`, `assignments`.
   - Reuse `build_unit_aggregates` and metric mapping to compute per-unit primary/secondary.
   - Aggregate stats per territory.
   - Compute fairness metrics.
   - Return a `scenario` object (`id = "manual"`).

### Phase 3 – Optimizer & Scenarios

8. Implement `optimizer.py`:

   - Functions:

     ```python
     def primary_balanced(unit_values, k, locked):
         ...

     def secondary_balanced(unit_values, k, locked):
         ...

     def dual_balanced(unit_values, k, locked, w_primary=0.7, w_secondary=0.3):
         ...
     ```

   - Each returns `assignments: dict[unit_id, territory_id]`.

9. Implement `POST /optimize`:
   - Validate request.
   - Call `build_unit_aggregates` & compute per-unit metrics.
   - Apply locks from `locked_assignments`.
   - Generate three assignment sets via optimizer functions.
   - For each, compute `territory_stats` and fairness.
   - Return as `OptimizeResponse` with `scenarios: List[Scenario]`.

### Phase 4 – Frontend / Map & UI

10. Initialize React (Vite + TS) in `frontend/`.
11. Install `react-leaflet` and `leaflet`.
12. Add a US states GeoJSON with `STUSPS` property to `src/data/us_states.geojson`.
13. Implement `<App />`:
    - Fetch `/config` on mount.
    - Maintain:
      - `k`, `granularity`, `primaryMetric`, `secondaryMetric`.
      - `scenarios` dictionary (`manual`, `primary`, `secondary`, `dual`).
      - `currentScenarioId`.
      - `activeTerritoryId`.
    - On config or metric change, call `/evaluate` for current manual assignments.

14. Implement `<MapView>` inside `App` or as a child component:
    - Render Leaflet map, TileLayer, and GeoJSON states.
    - For each feature:
      - Determine `unitId` (`STUSPS` state code).
      - Lookup territory from active scenario’s `assignments`.
      - Apply fill color and hover tooltip.
      - On click, call handler to patch manual assignments and then `/evaluate`.

15. Implement **Control Panel**:
    - Input for `k` (number of territories).
    - Toggle for granularity (`state` / `zip`).
    - Dropdowns for primary & secondary metrics.
    - **“Optimize territories”** button → calls `/optimize` with locks from manual scenario.
    - Territory list with mini bars, grade mix, and spend text summary.
    - Scenario tabs with equity summary and “Use this scenario as Manual” button.

16. Implement **Insights Drawer**:
    - Global metrics card.
    - Fairness cards for primary & secondary.
    - Scenario comparison table.
    - Territory comparison table.

### Phase 5 – Optional Enhancements

These are **not required** for the initial prototype but are natural follow-ups:

- Add **ZIP mode** with geometry or centroids.
- Add a **brush tool** (rectangular or lasso) for multi-state/ZIP selection.
- Add ability to **rename territories** and assign existing reps to them.
- Add a simple **export** endpoint (`/export`) to download assignments as CSV/JSON:
  - `unit_id, territory_id, primary_metric, secondary_metric, Hardware_ICP_Grade, ...`.
- Add **travel / rep home** support in the optimizer (distance-based penalties).

---

## 7. Usage Notes

- This tool is meant to help **plan and defend territory designs**:
  - “Here are three options; you can see how fair each is by ICP-weighted value and pure spend.”
- Gini/Theil are used mainly to compute an **Equity score (0–100)** that is easy to explain.
- Grade and spend dynamics views give confidence that territories are not only “balanced” but also have a reasonable mix of strategic vs maintenance accounts and healthy vs at-risk spend patterns.

You can hand this markdown file directly to the Antigravity / Opus 4.5 agent as a specification to implement the prototype.
