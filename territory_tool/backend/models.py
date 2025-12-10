"""
Pydantic models for API request/response schemas.
"""
from typing import Optional
from pydantic import BaseModel, Field


# ============================================================================
# Configuration Response
# ============================================================================

class ConfigResponse(BaseModel):
    """Response model for GET /config endpoint."""
    granularities: list[str] = Field(default=["state", "zip"])
    default_granularity: str = Field(default="state")
    numeric_metrics: list[str]
    metric_display_names: dict[str, str] = Field(default_factory=dict)
    default_primary_metric: str = Field(default="Weighted_ICP_Value")
    default_secondary_metric: str = Field(default="spend_12m")
    grade_fields: list[str]
    industries: list[str] = Field(default_factory=list)
    industry_counts: dict[str, int] = Field(default_factory=dict)
    row_count: int
    state_count: int
    zip_count: int


# ============================================================================
# Grade Distribution
# ============================================================================

class GradeDistribution(BaseModel):
    """Distribution of grades for a single grade field."""
    A: int = 0
    B: int = 0
    C: int = 0
    D: int = 0
    F: int = 0
    Blank: int = 0


class PriorityTierDistribution(BaseModel):
    """Distribution of account priority tiers."""
    A_Strategic: int = Field(default=0, alias="A - Strategic")
    B_Growth: int = Field(default=0, alias="B - Growth")
    C_Maintain: int = Field(default=0, alias="C - Maintain")
    D_Monitor: int = Field(default=0, alias="D - Monitor")
    Blank: int = 0

    class Config:
        populate_by_name = True


# ============================================================================
# Spend Dynamics
# ============================================================================

class SpendDynamics(BaseModel):
    """Spend and engagement metrics for a territory."""
    spend_12m: float = 0.0
    spend_13w: float = 0.0
    delta_13w_pct: float = 0.0
    yoy_13w_pct: float = 0.0
    gp_t4q_total: float = 0.0
    gp_since_2023_total: float = 0.0
    trend_score: float = 0.0
    recency_score: float = 0.0
    momentum_score: float = 0.0
    engagement_health_score: float = 0.0


# ============================================================================
# Territory Statistics
# ============================================================================

class TerritoryStats(BaseModel):
    """Statistics for a single territory."""
    territory_id: str
    primary_sum: float = 0.0
    secondary_sum: float = 0.0
    account_count: int = 0
    grades: dict[str, dict[str, int]] = Field(default_factory=dict)
    spend_dynamics: SpendDynamics = Field(default_factory=SpendDynamics)


# ============================================================================
# Fairness Metrics
# ============================================================================

class FairnessMetrics(BaseModel):
    """Fairness metrics for evaluating territory balance."""
    gini: float = 0.0
    theil: float = 0.0
    max_min_ratio: float = 0.0
    equity_score: int = 100


# ============================================================================
# Scenario
# ============================================================================

class Scenario(BaseModel):
    """A complete territory assignment scenario with stats."""
    id: str
    label: str
    description: str
    assignments: dict[str, str]  # unit_id -> territory_id
    territory_stats: dict[str, TerritoryStats]  # territory_id -> stats
    fairness_primary: FairnessMetrics
    fairness_secondary: FairnessMetrics
    unassigned_units: list[str] = Field(default_factory=list)
    contiguity_checked: bool = False
    contiguity_ok: bool = True
    non_contiguous_territories: list[str] = Field(default_factory=list)


# ============================================================================
# API Requests
# ============================================================================

class OptimizeRequest(BaseModel):
    """Request body for POST /optimize endpoint."""
    k: int = Field(ge=2, le=50, description="Number of territories")
    granularity: str = Field(default="state", pattern="^(state|zip)$")
    primary_metric: str = Field(default="Weighted_ICP_Value")
    secondary_metric: str = Field(default="spend_12m")
    locked_assignments: dict[str, str] = Field(
        default_factory=dict,
        description="Pre-locked unit assignments (unit_id -> territory_id)"
    )
    seed_assignments: dict[str, str] = Field(
        default_factory=dict,
        description="Starting seeds for territories (unit_id -> territory_id)"
    )
    excluded_industries: list[str] = Field(
        default_factory=list,
        description="List of industries to exclude from optimization"
    )
    require_contiguity: bool = Field(
        default=True,
        description="Attempt to enforce contiguity when adjacency is available",
    )
    force_contiguity: bool = Field(
        default=False,
        description="If True, fail the request when contiguity is violated",
    )


class EvaluateRequest(BaseModel):
    """Request body for POST /evaluate endpoint."""
    k: int = Field(ge=2, le=50, description="Number of territories")
    granularity: str = Field(default="state", pattern="^(state|zip)$")
    primary_metric: str = Field(default="Weighted_ICP_Value")
    secondary_metric: str = Field(default="spend_12m")
    assignments: dict[str, str] = Field(
        default_factory=dict,
        description="Current unit assignments (unit_id -> territory_id)"
    )
    excluded_industries: list[str] = Field(
        default_factory=list,
        description="List of industries to exclude from evaluation"
    )


# ============================================================================
# API Responses
# ============================================================================

class OptimizeResponse(BaseModel):
    """Response for POST /optimize endpoint."""
    scenarios: list[Scenario]
    warnings: list[str] = Field(default_factory=list)


class EvaluateResponse(BaseModel):
    """Response for POST /evaluate endpoint."""
    scenario: Scenario


class HealthResponse(BaseModel):
    """Response for GET /health endpoint."""
    status: str = "ok"

