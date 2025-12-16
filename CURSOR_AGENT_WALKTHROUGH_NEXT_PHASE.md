# Territory Planner – Cursor Agent Walkthrough (Next Phase)

> **Audience:** Cursor coding agent working inside `greygizmo/territory_planner`  
> **Product posture:** internal prototype; prioritize usability + correctness over “production hardening”  
> **Scope posture:** we are **staying at State granularity** for this phase; ZIP remains **out of scope** (don’t delete ZIP support—just don’t surface it).  
> **Key data source:** `icp_scored_accounts.csv` at repo root.

---

## 0) North Star for this phase

The MVP already proves the concept. This next phase should make the tool feel like a *serious* territory workbench:

1) **Manual territory building gets fast**  
   - Brush/paint states on the map (and erase) without the app lagging.  
   - A **Reset** button clears the map/session without reloading.

2) **Metrics become “sales-planner useful”** (without UI clutter)  
   - Replace “Spend” with **GP** terminology everywhere in the UI.  
   - Drop short-term/13-week and T4Q concepts from the UI.  
   - Add **12/24/36 month GP** by division and overall.  
   - Add **Division Assets** (HW / CRE / CPE) per territory.  
   - Add **HighTouchWeighted** and High Touch count (workload fairness).  
   - Make divisional **ICP grade mix** easy to see (counts/percentages).

3) **Optimization gets smarter (but stays simple)**  
   - Keep scenarios: **Manual**, **Primary**, **Secondary** (remove “Dual” for now).  
   - Manual assignments remain **locked**; optimizer fills only unassigned units.  
   - Improve the optimizer’s results slightly via a light refinement pass (local border swaps) and a small cross-metric “guardrail” weight.

---

## 1) Repo orientation (what exists today)

### Backend (`territory_tool/backend`)
- `main.py` – FastAPI app + endpoints `/config`, `/optimize`, `/evaluate`
- `data_loader.py` – loads `icp_scored_accounts.csv`, coerces numeric cols, builds per-unit aggregates
- `optimizer.py` – state adjacency + assignment generator (`geographic_balanced`, scenario generation)
- `metrics.py` – computes territory stats + fairness metrics (Gini/Theil/etc)
- `models.py` – request/response models
- `tests/optimizer_test.py` – basic optimizer tests

### Frontend (`territory_tool/frontend`)
- React + Tailwind (Vite)
- `App.tsx` – app state (manual assignments, seeds, scenarios)
- `components/MapView.tsx` – leaflet map + click assignment
- `components/ControlPanel.tsx` – controls: k, granularity, metrics, filters, optimize
- `components/TerritoryList.tsx` – per-territory summary cards
- `components/InsightsDrawer.tsx` – scenario overview, fairness metrics, comparison table
- `components/ScenarioTabs.tsx` – Manual/Primary/Secondary/Dual + “Use as Manual”

---

## 2) Hard requirements for this phase

### In-scope
- **UI terminology:** replace “Spend” with **GP**
- **Drop from usage:** 13-week and T4Q (don’t display; don’t default to them)
- Add divisional GP windows:
  - `spend_12m_[hw|cre|cpe]`
  - `spend_24m_[hw|cre|cpe]`
  - `spend_36m_[hw|cre|cpe]`
- Keep overall GP windows:
  - `spend_12m`, `spend_24m`, `spend_36m`
- Use already-derived columns where available:
  - `spend_12m_prior` (prior_12m)
  - `delta_12m` (yoy_delta_12m)
  - `delta_12m_pct` (yoy_delta_12m_pct)
- Add division assets:
  - **CPE Assets** = `seats_CPE`
  - **CRE Assets** = `cre_adoption_assets`
  - **HW Assets** = `Qty_Scanners + Qty_Printers`
- Add **HighTouchWeighted** (and High Touch count) as workload fairness metrics
  - Implement robustly: if the high-touch flag column is missing, treat as 0.
- Manual map editing:
  - Add **Brush/Paint** and **Erase** interaction on map
  - Add **Reset/Clear** button (no reload)
  - **Debounce** backend `/evaluate` calls so brushing doesn’t hammer the server
- Scenarios:
  - Keep: Manual, Primary, Secondary
  - Remove/disable: Dual
- Don’t surface ZIP in UI yet (no dropdown option, no zip map loading path)

### Explicitly out-of-scope
- Playbook logic / plays UI (use `pov_primary` later, but **not now**)
- ZIP territories (leave code, hide UI)
- Production auth, perf hardening, multi-user, DB, etc.

---

## 3) Backend work plan (step-by-step)

### Step 3.1 – Update metric inventory and terminology (DataStore constants)

**File:** `territory_tool/backend/data_loader.py`

1) Update/extend the **divisional GP** columns list (remove 13w, add 24m/36m):
   - Ensure these exist in the CSV and are numeric-coerced.
   - Suggested constants:
     - `DIVISION_GP_COLUMNS = ["spend_12m_hw", "spend_24m_hw", "spend_36m_hw", ...]`
     - Keep `spend_12m`/`spend_24m`/`spend_36m` in overall spend/GP columns.

2) Remove **T4Q** and “since 2023” from the balancing/visible metrics list:
   - Drop `GP_T4Q_Total`, `GP_Since_2023_Total` from:
     - `BALANCING_METRICS`
     - `METRIC_DISPLAY_NAMES`
     - any SpendDynamics aggregation used for UI

3) Add `spend_24m` and `spend_36m` to `BALANCING_METRICS` so they can be selected as optimization metrics.

4) Add **assets** and **high-touch** metrics (see derived columns section below) to `BALANCING_METRICS` so they’re selectable and aggregatable.

5) Update `METRIC_DISPLAY_NAMES` to use **GP** wording:
   - Examples:
     - `spend_12m` → `"GP (12m)"`
     - `spend_24m` → `"GP (24m)"`
     - `spend_36m` → `"GP (36m)"`
     - `spend_12m_hw` → `"HW GP (12m)"`
     - `spend_24m_cre` → `"CRE GP (24m)"`
     - `spend_36m_cpe` → `"CPE GP (36m)"`
   - Keep keys as-is; only the display names change.

**Acceptance criteria**
- `/config` returns a metrics list including new GP windows + assets + high-touch metrics.
- No mention of “Spend” in display names returned by `/config`.

---

### Step 3.2 – Add derived columns: divisional opportunity, assets, high-touch

**File:** `territory_tool/backend/data_loader.py`

In `DataStore._compute_derived_metrics()` (or equivalent derived-metrics method):

1) **Divisional opportunity metrics** (division-specific ICP × log1p(GP_12m_division)):
   - Add (names are suggestions; consistent naming matters more than exact strings):
     - `Opportunity_HW = Hardware_ICP_Score * log1p(spend_12m_hw)`
     - `Opportunity_CRE = CRE_ICP_Score * log1p(spend_12m_cre)`
     - `Opportunity_CPE = CPE_ICP_Score * log1p(spend_12m_cpe)`
   - Keep existing combined `Weighted_ICP_Value` as “Opportunity (Combined)”.

2) **Assets**:
   - Create a derived HW assets column:
     - `HW_Assets = Qty_Scanners + Qty_Printers` (treat NaN as 0)
   - Alias/normalize:
     - `CRE_Assets = cre_adoption_assets`
     - `CPE_Assets = seats_CPE`

3) **High touch**:
   - We don’t have a guaranteed column name. Implement a robust detector:
     - Try common candidates in order (adjust as soon as you see the real column name in CSV):
       - `HighTouch`, `High_Touch`, `high_touch`, `high_touch_flag`, `is_high_touch`, `HighTouchFlag`
   - Create:
     - `HighTouch_Count` as 1/0 per account (bool/int), aggregated as sum
     - `HighTouchWeighted` as `HighTouch_Count * Weighted_ICP_Value` (or `* spend_12m` if you prefer)
   - If no candidate column exists, set both to 0 for all rows.

4) Add these derived columns to numeric coercion if needed (or compute after coercion using `.fillna(0)` and `pd.to_numeric`).

5) Add display names:
   - `Opportunity_HW` → `"HW Opportunity"`
   - `Opportunity_CRE` → `"CRE Opportunity"`
   - `Opportunity_CPE` → `"CPE Opportunity"`
   - `HW_Assets` → `"HW Assets"`
   - `CRE_Assets` → `"CRE Assets"`
   - `CPE_Assets` → `"CPE Assets"`
   - `HighTouch_Count` → `"High Touch (Count)"`
   - `HighTouchWeighted` → `"High Touch (Weighted)"`

**Acceptance criteria**
- A unit aggregate contains non-zero assets where expected.
- A unit aggregate contains non-zero HighTouch metrics if the column exists in the CSV.
- Opportunity_* metrics exist and can be selected in the UI.

---

### Step 3.3 – Refresh unit aggregates to include new metric sums and new GP dynamics

**Files:**  
- `territory_tool/backend/data_loader.py` (unit aggregates)  
- `territory_tool/backend/models.py` (SpendDynamics schema)  
- `territory_tool/backend/metrics.py` (territory stats rollup)

#### 3.3.a Update SpendDynamics model
**File:** `models.py`

Replace the short-term fields with a longer-horizon shape. Suggested:
- `gp_12m`
- `gp_24m`
- `gp_36m`
- `gp_12m_prior`
- `yoy_delta_12m`
- `yoy_delta_12m_pct`
- Keep engagement scores (trend/recency/momentum/engagement health) if currently present; they’re still useful.

#### 3.3.b Track metric sums per territory
To support a richer “Active Territory Details” panel, add a `metric_sums: dict[str, float]` to `TerritoryStats`.

**Why:** then the frontend can display divisional GP, assets, high-touch metrics, etc. without new endpoints or recomputation.

#### 3.3.c Update compute_territory_stats
**File:** `metrics.py`

- While iterating unit IDs:
  - Sum:
    - gp_12m = sum(unit.spend_dynamics.gp_12m) OR sum(unit.metric_sums["spend_12m"])
    - gp_24m, gp_36m similarly
    - gp_12m_prior = sum(unit.metric_sums["spend_12m_prior"])
    - yoy_delta_12m = sum(unit.metric_sums["delta_12m"])
    - yoy_delta_12m_pct = yoy_delta_12m / max(gp_12m_prior, epsilon)
- Build `SpendDynamics` from those totals.
- Build `metric_sums` by summing `unit.metric_sums` across all included units.

**Acceptance criteria**
- Territory cards can show “GP (12m)” and “YoY Δ (12m)” without referencing 13w.
- Frontend can display divisional GP/Assets via `territory.metric_sums`.

---

### Step 3.4 – Make country filter real (backend filtering)

**Files:**  
- `territory_tool/backend/models.py`  
- `territory_tool/backend/main.py`  
- `territory_tool/backend/data_loader.py`

Currently the UI has US/CA filter, but backend evaluation/optimization doesn’t respect it (it’s just map visual). Fix that.

1) Add to request models:
- `OptimizeRequest.country_filter: Literal["all","us","ca"] = "all"`
- `EvaluateRequest.country_filter: Literal["all","us","ca"] = "all"`

2) Extend `DataStore.get_filtered_aggregates(...)` to accept a list of countries (or the `country_filter` string):
- Map:
  - `all` → `["_unitedStates","_canada"]`
  - `us` → `["_unitedStates"]`
  - `ca` → `["_canada"]`
- Filter `self.df` by `ShippingCountry` before aggregating (just like `excluded_industries` filter).

3) In `/optimize` and `/evaluate`, pass `country_filter` through to the data store filter.

**Acceptance criteria**
- Switching the country filter changes account counts and metric totals (not just map visibility).

---

### Step 3.5 – Scenario generation: remove Dual, lightly improve results

**File:** `territory_tool/backend/optimizer.py`

#### Remove Dual
- Update `generate_scenarios(...)` to return only:
  - `primary` scenario optimized on primary metric
  - `secondary` scenario optimized on secondary metric

#### Light improvement: cross-metric guardrail weights
Because we removed “Dual”, don’t let a scenario completely ignore the other metric.

Suggested approach:
- For **Primary** scenario, optimize an internal combined score:
  - `score = primary + 0.25 * normalized_secondary`
- For **Secondary** scenario:
  - `score = secondary + 0.25 * normalized_primary`

Implementation detail:
- Normalize metrics at unit level to reduce scale issues:
  - `norm(x) = x / (mean(x) + eps)` or `x / (p95(x) + eps)`
- Keep it simple—this is a prototype.

#### Light improvement: local refinement pass (border swaps)
After `geographic_balanced(...)` returns an assignment, add a quick improvement loop:

- Compute territory sums + objective = variance from ideal (squared error) on the primary metric
- Identify border units (a unit with at least one neighbor in another territory)
- Try moving a border unit to a neighboring territory if:
  - unit not locked
  - contiguity remains OK (use existing contiguity checks)
  - objective improves
- Run for a capped number of iterations (e.g., 200 attempts) to avoid slowdowns

**Acceptance criteria**
- Optimized scenarios have visibly tighter per-territory bars (primary/secondary) in the UI compared to before.
- Locked states remain fixed.

---

### Step 3.6 – Backend tests update

**File:** `territory_tool/backend/tests/optimizer_test.py`

Update tests to reflect:
- No dual scenario (if any tests assert its presence)
- Add at least one test that:
  - Locked assignments remain fixed after optimization
  - Contiguity check is invoked and non-contiguous territories are reported (if enabled)

Optional: Add a tiny unit test for `compute_fairness_metrics` stability for edge cases (all zeros, single territory, etc.).

---

## 4) Frontend work plan (step-by-step)

### Step 4.1 – Update TS types + remove Dual scenario

**File:** `territory_tool/frontend/src/types/index.ts`

1) Remove `'dual'` from `ScenarioId` and all UI logic that assumes it exists.
2) Update `SpendDynamics` interface to match backend’s new fields:
   - Replace 13w/T4Q fields with:
     - `gp_12m`, `gp_24m`, `gp_36m`, `gp_12m_prior`, `yoy_delta_12m`, `yoy_delta_12m_pct`
3) Add `metric_sums?: Record<string, number>` to `TerritoryStats` if added backend-side.
4) Update request shapes for `/optimize` and `/evaluate` to include `country_filter`.

**Acceptance criteria**
- `npm run build` / `npm run typecheck` succeeds.
- Scenario tabs show only Manual/Primary/Secondary.

---

### Step 4.2 – API client: pass country filter, handle updated schemas

**File:** `territory_tool/frontend/src/api/client.ts`

- Include `country_filter` in both `optimize(...)` and `evaluate(...)` payloads.
- Keep the payload names aligned with backend (`country_filter`, not `countryFilter`).

---

### Step 4.3 – Control panel cleanup: GP wording, hide ZIP, add Reset

**File:** `territory_tool/frontend/src/components/ControlPanel.tsx`

1) Replace label text “Spend” → “GP” in UI strings.
2) Hide ZIP option:
   - Remove the zip `<option>` or disable it with “(coming soon)”.
3) Add a **Reset / Clear** button:
   - Triggers a callback passed from `App.tsx` that resets:
     - manual assignments
     - seeds
     - optimized scenarios
     - warnings
     - active scenario back to Manual
4) Improve metric dropdown usability (avoid clutter):
   - Use `<optgroup>` for grouping:
     - ICP Scores
     - Opportunity
     - GP
     - Grade Mix
     - Workload
     - Assets
   - Build groups in the frontend by pattern-matching metric keys.

**Acceptance criteria**
- User can clear the map without reloading.
- Metric selects remain usable even with many metrics.

---

### Step 4.4 – Brush/Paint + Erase on the map (fast manual editing)

**Files:**  
- `territory_tool/frontend/src/App.tsx`  
- `territory_tool/frontend/src/components/MapView.tsx`  
- (Optional new) `territory_tool/frontend/src/components/TerritoryDetails.tsx`

#### 4.4.a Add assignment “tools” state in App
In `App.tsx` add:
- `editMode: "click" | "brush"` (default click)
- `brushTool: "paint" | "erase"` (default paint)

Add handlers:
- `applyUnitAssignment(unitId, mode)`:
  - **paint:** set `manualAssignments[unitId] = activeTerritory` (always assign; do not toggle)
  - **erase:** delete `manualAssignments[unitId]` (unassign)
  - keep existing click toggle behavior for normal clicks

#### 4.4.b Debounce `/evaluate` calls
Brushing can generate dozens of updates quickly.

Implement a debounce around `evaluateManual()`:
- Trigger when:
  - `manualAssignments` changes
  - `primaryMetric`, `secondaryMetric`, `k`, excluded industries, country filter changes
- Wait ~250–400ms after last change before calling backend

#### 4.4.c MapView brush behavior
In `MapView.tsx`:
- Add props:
  - `editMode`, `brushTool`, `onUnitPaint(unitId)`, `onUnitErase(unitId)`
- When `editMode === "brush"`:
  - Track `isBrushing` (mousedown→true, mouseup→false)
  - Disable Leaflet dragging while brushing to prevent the map panning instead of painting
  - On polygon `mouseover`, if `isBrushing`:
    - call paint/erase callback
    - keep a `visited Set` for the active brush gesture to avoid repeat calls on the same unit

#### 4.4.d Minimal UX controls
Add to the right panel (near territory list):
- Toggle: “Brush” (on/off)
- Toggle: “Paint / Erase”

Keyboard niceties (optional):
- Hold `Shift` temporarily switches to erase while brushing.

**Acceptance criteria**
- User can paint multiple states quickly.
- Metrics update smoothly without UI freezing.
- Map doesn’t fight the user by panning while in brush mode.

---

### Step 4.5 – Reduce clutter: move “heavy” stats to a Territory Details panel

**Goal:** keep the territory list readable, but still provide “information-heavy” decision confidence.

**New component suggestion:** `TerritoryDetails.tsx`  
(Place it under the TerritoryList in the right panel.)

Inputs:
- `scenario` (active scenario object)
- `activeTerritoryId`
- `metricDisplayNames` map

Render (for the active territory):
1) **Primary + secondary totals**
2) **Divisional grade distributions**
   - For each division grade field:
     - show counts A/B/C/D/F
     - show AB% (and optionally A%)
3) **GP breakdown**
   - total GP 12/24/36
   - per division GP 12/24/36 (from `metric_sums`)
4) **Assets**
   - HW Assets, CRE Assets, CPE Assets
5) **Workload**
   - High Touch count, HighTouchWeighted

Keep it visually compact:
- small tables, badges, or a simple stacked bar (CSS flex) for grade distributions

**Acceptance criteria**
- User can select a territory and immediately see grade + GP + assets breakdown without cluttering the list.

---

### Step 4.6 – Territory list + insights drawer updates

**Files:**  
- `TerritoryList.tsx`  
- `InsightsDrawer.tsx`  
- `ScenarioTabs.tsx`

#### TerritoryList
- Replace “Spend (12m)” label with “GP (12m)”
- Remove any 13w/T4Q display
- Replace priority tier display with divisional grade AB% (HW/CRE/CPE), or remove it entirely
- Keep per-territory primary/secondary sums as the “always visible” fairness core

#### ScenarioTabs
- Remove Dual tab
- Ensure “Use as Manual” works for primary/secondary

#### InsightsDrawer
- Update its summary line items to GP terminology
- Update comparison table columns:
  - show HW/CRE/CPE AB% (and optionally Combined AB%)
  - remove priority tier if it’s not aligned with your planning workflow

---

## 5) QA checklist (do this before shipping the phase)

### Backend quick checks
- `uvicorn territory_tool.backend.main:app --reload` works
- `/health` returns ok
- `/config` returns:
  - only `["state"]` granularity (for UI)
  - updated metric display names (“GP”)
  - new metrics present (24/36 divisional GP, assets, HighTouchWeighted)
- `/evaluate` on a small manual assignment returns:
  - territory stats with new GP dynamics
  - grade distributions
  - `metric_sums` populated (if implemented)

### Frontend quick checks
- `npm install && npm run dev` works
- Can:
  - optimize and see Primary + Secondary
  - “Use as Manual” copies scenario
  - Brush paint and brush erase work
  - Reset clears state without reload
  - Country filter impacts totals (backend + map)

### Human sanity checks
- A territory with more states should usually have more accounts/GP (unless filtered)
- If you pick “GP (12m)” as primary metric, scenarios should balance GP roughly evenly
- If you lock several states manually then optimize, those locked states never move

---

## 6) Notes & design guardrails

- **Don’t overwhelm the user:** keep the territory list light; put rich breakdowns in the details panel/drawer.
- **Be robust to missing columns:** assets and high touch columns may vary—fail gracefully.
- **Minimize API chatter:** debouncing evaluate is critical once brushing exists.
- **Keep ZIP dormant:** don’t delete it; just don’t expose it.

---

## 7) Suggested commit strategy

1) Backend metrics + schema changes (data_loader/models/metrics)  
2) Frontend types + API client (compile again)  
3) UI wording + ZIP hidden + reset button  
4) Brush mode + debounce evaluate  
5) Territory details panel  
6) Optimizer improvements + tests

Each commit should keep the app running.

