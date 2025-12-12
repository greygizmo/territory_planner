"""
FastAPI application for ICP Territory Builder.
Provides endpoints for territory optimization and evaluation.
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from data_loader import (
    load_csv_data,
    get_data_store,
    BALANCING_METRICS,
    METRIC_DISPLAY_NAMES,
    GRADE_FIELDS,
    get_adjacency_list,
)
from models import (
    HealthResponse,
    ConfigResponse,
    OptimizeRequest,
    OptimizeResponse,
    EvaluateRequest,
    EvaluateResponse,
)


# ============================================================================
# Application Lifecycle
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load data on startup."""
    # Find CSV path - check environment variable first, then default location
    csv_path = os.environ.get("ICP_CSV_PATH")
    if csv_path:
        csv_path = Path(csv_path)
    else:
        # Default: CSV in project root (two levels up from backend)
        backend_dir = Path(__file__).parent
        project_root = backend_dir.parent.parent
        csv_path = project_root / "icp_scored_accounts.csv"
    
    print(f"Looking for CSV at: {csv_path}")
    
    if csv_path.exists():
        load_csv_data(csv_path)
    else:
        print(f"WARNING: CSV file not found at {csv_path}")
        print("API will start but data endpoints will fail until data is loaded.")
    
    yield


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="ICP Territory Builder API",
    description="Backend API for interactive territory planning and optimization",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health Check
# ============================================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Simple health check endpoint."""
    return HealthResponse(status="ok")


# ============================================================================
# Configuration
# ============================================================================

@app.get("/config", response_model=ConfigResponse)
async def get_config():
    """
    Get application configuration including available metrics, grade fields,
    industries, and data counts.
    """
    store = get_data_store()
    
    if not store.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="Data not loaded. Please ensure icp_scored_accounts.csv is available."
        )
    
    # Only expose the metrics we actually want users to pick from in the UI.
    # (The backend may still compute additional metrics for reporting.)
    ui_metrics = [
        # ICP
        "Weighted_ICP_Value",
        "Combined_ICP_Score",
        "Hardware_ICP_Score",
        "CRE_ICP_Score",
        "CPE_ICP_Score",
        # GP
        "GP_12M_Total",
        "GP_24M_Total",
        "GP_36M_Total",
        # Assets (requested set)
        "Total_Assets",
        "HW_Assets",
        "CRE_Assets",
        "CPE_Assets",
        # A/B counts
        "Hardware_AB_Count",
        "CRE_AB_Count",
        "CPE_AB_Count",
        "Combined_AB_Count",
        "Account_Count",
        # Attention load (weighted)
        "HighTouchWeighted_Combined",
    ]

    metric_display_names = {k: v for k, v in METRIC_DISPLAY_NAMES.items() if k in ui_metrics}

    return ConfigResponse(
        granularities=["state", "zip"],
        default_granularity="state",
        numeric_metrics=ui_metrics,
        metric_display_names=metric_display_names,
        default_primary_metric="Weighted_ICP_Value",
        default_secondary_metric="GP_12M_Total",  # Changed to GP as primary financial metric
        grade_fields=GRADE_FIELDS,
        industries=store.get_unique_industries(),
        industry_counts=store.get_industry_counts(),
        row_count=store.row_count,
        state_count=store.state_count,
        zip_count=store.zip_count,
    )


# ============================================================================
# Geography Helpers
# ============================================================================

@app.get("/zip_to_state")
async def get_zip_to_state_mapping() -> dict[str, str]:
    """
    Return mapping of ZIP/postal code -> state/province code.

    Used by the frontend to provide a workable ZIP mode even when the map
    visualization is state/province-level (e.g. color states by dominant ZIP assignment).
    """
    store = get_data_store()
    if not store.is_loaded:
        raise HTTPException(status_code=503, detail="Data not loaded.")
    return store.get_zip_to_state_mapping()


# ============================================================================
# Optimization Endpoint (to be implemented in Phase 3)
# ============================================================================

@app.post("/optimize", response_model=OptimizeResponse)
async def optimize_territories(request: OptimizeRequest):
    """
    Generate optimized territory assignments.
    Returns two scenarios: primary-balanced and secondary-balanced.
    """
    # Import here to avoid circular imports
    from optimizer import generate_scenarios, generate_zip_scenarios_via_states, check_assignments_contiguity
    from metrics import compute_scenario_stats
    
    store = get_data_store()
    if not store.is_loaded:
        raise HTTPException(status_code=503, detail="Data not loaded.")
    
    # Validate metrics
    if request.primary_metric not in BALANCING_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid primary_metric. Must be one of: {BALANCING_METRICS}"
        )
    if request.secondary_metric not in BALANCING_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid secondary_metric. Must be one of: {BALANCING_METRICS}"
        )
    
    # Get unit aggregates for the selected granularity (with optional filtering)
    needs_filtering = request.excluded_industries or request.country_filter
    if needs_filtering:
        aggregates = store.get_filtered_aggregates(
            request.granularity, 
            excluded_industries=request.excluded_industries,
            country_filter=request.country_filter,
        )
        filter_msgs = []
        if request.excluded_industries:
            filter_msgs.append(f"industries={request.excluded_industries}")
        if request.country_filter:
            filter_msgs.append(f"country={request.country_filter}")
        print(f"[optimize] Filtering: {', '.join(filter_msgs)}")
    else:
        aggregates = store.get_aggregates(request.granularity)
    
    if not aggregates:
        raise HTTPException(
            status_code=400,
            detail=f"No data available for granularity: {request.granularity}"
        )

    # In ZIP mode, the map UI still uses state/province polygons. To support that,
    # we allow users to send state/province codes in locked/seed assignments and
    # expand them to ZIP-level assignments here.
    if request.granularity == "zip":
        zip_to_state = store.get_zip_to_state_mapping()
        # Build inverse mapping once (state -> [zip...]) for fast expansion.
        state_to_zips: dict[str, list[str]] = {}
        for z, st in zip_to_state.items():
            state_to_zips.setdefault(str(st).strip().upper(), []).append(str(z).strip())

        state_keys = {str(s).strip().upper() for s in (store.get_aggregates("state") or {}).keys()}

        def expand_state_assignments(assignments: dict[str, str]) -> dict[str, str]:
            expanded: dict[str, str] = {}
            for key, tid in (assignments or {}).items():
                k_norm = str(key).strip().upper()
                if k_norm in state_keys:
                    for z in state_to_zips.get(k_norm, []):
                        expanded[z] = tid
                else:
                    # Assume it is already a ZIP/postal code
                    expanded[str(key).strip()] = tid
            return expanded

        request.locked_assignments = expand_state_assignments(request.locked_assignments)
        request.seed_assignments = expand_state_assignments(request.seed_assignments)

    adjacency = get_adjacency_list(request.granularity)
    # Normalize adjacency keys to uppercase strings
    adjacency = {
        str(k).strip().upper(): {str(n).strip().upper() for n in v}
        for k, v in adjacency.items()
    }
    contiguity_available = bool(adjacency)
    warnings: list[str] = []
    if request.require_contiguity and not contiguity_available:
        warnings.append(f"Contiguity not enforced for granularity '{request.granularity}' (adjacency unavailable).")
    # Check for units that lack adjacency entries
    normalized_units = {str(uid).strip().upper() for uid in aggregates.keys()}
    missing_adjacency: list[str] = []
    if contiguity_available:
        adjacency_keys = set(adjacency.keys())
        missing_adjacency = sorted(normalized_units - adjacency_keys)
        if missing_adjacency:
            sample = ", ".join(missing_adjacency[:5])
            warnings.append(f"{len(missing_adjacency)} units missing adjacency entries (sample: {sample})")
    print(f"[optimize] granularity={request.granularity} units={len(normalized_units)} adjacency_entries={len(adjacency)} contiguity_required={request.require_contiguity} missing_adjacency={len(missing_adjacency)}")
    
    # Validate locked assignments
    valid_territory_ids = {f"T{i+1}" for i in range(request.k)}
    for unit_id, territory_id in request.locked_assignments.items():
        if unit_id not in aggregates:
            # Skip invalid unit IDs silently
            continue
        if territory_id not in valid_territory_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid territory_id '{territory_id}' in locked_assignments. Must be T1-T{request.k}"
            )

    # Validate seed assignments
    for unit_id, territory_id in request.seed_assignments.items():
        if unit_id not in aggregates:
            continue
        if territory_id not in valid_territory_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid territory_id '{territory_id}' in seed_assignments. Must be T1-T{request.k}"
            )
    
    # Generate three optimization scenarios
    try:
        if request.granularity == "zip":
            # For ZIP granularity, use state-based assignment for efficiency and contiguity
            # Apply same filtering to state aggregates if filtering is active
            if needs_filtering:
                state_aggregates = store.get_filtered_aggregates(
                    "state", 
                    excluded_industries=request.excluded_industries,
                    country_filter=request.country_filter,
                )
            else:
                state_aggregates = store.get_aggregates("state")
            zip_to_state = store.get_zip_to_state_mapping()
            scenarios = generate_zip_scenarios_via_states(
                zip_aggregates=aggregates,
                state_aggregates=state_aggregates,
                zip_to_state=zip_to_state,
                k=request.k,
                primary_metric=request.primary_metric,
                secondary_metric=request.secondary_metric,
                locked_assignments=request.locked_assignments,
                seed_assignments=request.seed_assignments,
            )
        else:
            # For state granularity, use direct geographic optimization
            scenarios = generate_scenarios(
                aggregates=aggregates,
                k=request.k,
                primary_metric=request.primary_metric,
                secondary_metric=request.secondary_metric,
                locked_assignments=request.locked_assignments,
                seed_assignments=request.seed_assignments,
                adjacency=adjacency,
                require_contiguity=request.require_contiguity and contiguity_available,
            )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Contiguity constraint failure: {exc}",
        ) from exc
    
    # Compute stats for each scenario
    scenarios_with_stats = []
    for scenario in scenarios:
        contiguity_info = check_assignments_contiguity(
            assignments=scenario["assignments"],
            adjacency=adjacency,
        )
        if contiguity_info["checked"] and not contiguity_info["ok"]:
            failing = ", ".join(sorted(contiguity_info["non_contiguous"]))
            warnings.append(f"Scenario '{scenario['id']}' has non-contiguous territories: {failing}")
            if request.force_contiguity:
                raise HTTPException(
                    status_code=422,
                    detail=f"Contiguity violation in scenario '{scenario['id']}': {failing}"
                )
        scenario_with_stats = compute_scenario_stats(
            scenario=scenario,
            aggregates=aggregates,
            k=request.k,
            primary_metric=request.primary_metric,
            secondary_metric=request.secondary_metric,
            contiguity_info=contiguity_info,
        )
        scenarios_with_stats.append(scenario_with_stats)
    
    return OptimizeResponse(scenarios=scenarios_with_stats, warnings=warnings)


# ============================================================================
# Evaluation Endpoint (to be implemented in Phase 2)
# ============================================================================

@app.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_assignments(request: EvaluateRequest):
    """
    Evaluate a manual territory assignment and compute statistics.
    """
    # Import here to avoid circular imports
    from metrics import compute_scenario_stats
    from models import Scenario
    
    store = get_data_store()
    if not store.is_loaded:
        raise HTTPException(status_code=503, detail="Data not loaded.")
    
    # Validate metrics
    if request.primary_metric not in BALANCING_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid primary_metric. Must be one of: {BALANCING_METRICS}"
        )
    if request.secondary_metric not in BALANCING_METRICS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid secondary_metric. Must be one of: {BALANCING_METRICS}"
        )
    
    # Get unit aggregates (with optional filtering)
    needs_filtering = request.excluded_industries or request.country_filter
    if needs_filtering:
        aggregates = store.get_filtered_aggregates(
            request.granularity,
            excluded_industries=request.excluded_industries,
            country_filter=request.country_filter,
        )
    else:
        aggregates = store.get_aggregates(request.granularity)
    
    if not aggregates:
        raise HTTPException(
            status_code=400,
            detail=f"No data available for granularity: {request.granularity}"
        )

    # Same ZIP-mode expansion as /optimize so manual painting on the state map works.
    if request.granularity == "zip":
        zip_to_state = store.get_zip_to_state_mapping()
        state_to_zips: dict[str, list[str]] = {}
        for z, st in zip_to_state.items():
            state_to_zips.setdefault(str(st).strip().upper(), []).append(str(z).strip())
        state_keys = {str(s).strip().upper() for s in (store.get_aggregates("state") or {}).keys()}

        expanded: dict[str, str] = {}
        for key, tid in (request.assignments or {}).items():
            k_norm = str(key).strip().upper()
            if k_norm in state_keys:
                for z in state_to_zips.get(k_norm, []):
                    expanded[z] = tid
            else:
                expanded[str(key).strip()] = tid
        request.assignments = expanded

    adjacency = get_adjacency_list(request.granularity)
    
    # Create a manual scenario from the assignments
    manual_scenario = {
        "id": "manual",
        "label": "Manual",
        "description": "User-defined territory assignments.",
        "assignments": request.assignments,
    }
    
    # Compute stats
    from optimizer import check_assignments_contiguity

    contiguity_info = check_assignments_contiguity(
        assignments=request.assignments,
        adjacency=adjacency,
    )

    scenario_with_stats = compute_scenario_stats(
        scenario=manual_scenario,
        aggregates=aggregates,
        k=request.k,
        primary_metric=request.primary_metric,
        secondary_metric=request.secondary_metric,
        contiguity_info=contiguity_info,
    )
    
    return EvaluateResponse(scenario=scenario_with_stats)


# ============================================================================
# Entry Point
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

