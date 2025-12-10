"""
Fairness metrics and territory statistics computation.
Implements Gini, Theil, Equity Score, and territory aggregation.
"""
from collections import defaultdict
import numpy as np

from models import (
    Scenario,
    TerritoryStats,
    FairnessMetrics,
    SpendDynamics,
)


# ============================================================================
# Fairness Metrics
# ============================================================================

def gini(values: np.ndarray | list) -> float:
    """
    Compute Gini coefficient for a set of values.
    
    Gini = 0 means perfect equality (all territories have same value)
    Gini = 1 means perfect inequality (one territory has everything)
    
    Args:
        values: Array of per-territory metric values
        
    Returns:
        Gini coefficient between 0 and 1
    """
    x = np.asarray(values, dtype=float)
    x = x[x >= 0]  # Filter non-negative values
    
    if x.size == 0:
        return 0.0
    
    mean = x.mean()
    if mean == 0:
        return 0.0
    
    # Gini formula: sum of all pairwise absolute differences / (2 * n^2 * mean)
    diff_sum = np.abs(x[:, None] - x[None, :]).sum()
    n = x.size
    
    return float(diff_sum / (2.0 * n * n * mean))


def theil(values: np.ndarray | list) -> float:
    """
    Compute Theil index (entropy-based inequality measure).
    
    Theil = 0 means perfect equality
    Higher values indicate more inequality
    
    Args:
        values: Array of per-territory metric values
        
    Returns:
        Theil index (non-negative)
    """
    x = np.asarray(values, dtype=float)
    x = x[x > 0]  # Filter positive values only
    
    if x.size == 0:
        return 0.0
    
    mean = x.mean()
    if mean == 0:
        return 0.0
    
    # Theil-T index: (1/n) * sum((x_i/mean) * ln(x_i/mean))
    ratios = x / mean
    return float((ratios * np.log(ratios)).sum() / x.size)


def equity_score_from_gini(g: float) -> int:
    """
    Convert Gini coefficient to human-friendly equity score (0-100).
    
    Equity = 100 means perfect equality (Gini = 0)
    Equity = 0 means extreme inequality (Gini = 1)
    
    Args:
        g: Gini coefficient
        
    Returns:
        Equity score between 0 and 100
    """
    # Clamp Gini to [0, 1] range
    g = max(0.0, min(g, 1.0))
    score = int(round((1.0 - g) * 100))
    return max(0, min(score, 100))


def max_min_ratio(values: np.ndarray | list) -> float:
    """
    Compute ratio of maximum to minimum value.
    
    Args:
        values: Array of per-territory metric values
        
    Returns:
        Max/min ratio (1.0 if all equal, higher means more spread)
    """
    x = np.asarray(values, dtype=float)
    x = x[x > 0]  # Filter positive values
    
    if x.size == 0:
        return 1.0
    
    min_val = x.min()
    max_val = x.max()
    
    if min_val == 0:
        return float("inf") if max_val > 0 else 1.0
    
    return float(max_val / min_val)


def compute_fairness_metrics(territory_values: dict[str, float]) -> FairnessMetrics:
    """
    Compute all fairness metrics for a set of territory values.
    
    Args:
        territory_values: Dict mapping territory_id -> metric value
        
    Returns:
        FairnessMetrics object with gini, theil, max_min_ratio, and equity_score
    """
    values = np.array(list(territory_values.values()))
    
    g = gini(values)
    t = theil(values)
    mmr = max_min_ratio(values)
    eq = equity_score_from_gini(g)
    
    return FairnessMetrics(
        gini=round(g, 4),
        theil=round(t, 4),
        max_min_ratio=round(mmr, 2),
        equity_score=eq,
    )


# ============================================================================
# Grade Distribution Computation
# ============================================================================

def compute_grade_distribution(grades_list: list[str]) -> dict[str, int]:
    """
    Compute counts of each grade from a list of grades.
    
    Args:
        grades_list: List of grade values (A, B, C, D, F, or blanks)
        
    Returns:
        Dict with counts for each grade category
    """
    counts = defaultdict(int)
    
    for grade in grades_list:
        grade_str = str(grade).strip().upper() if grade else ""
        
        if grade_str in ("A", "A - STRATEGIC"):
            counts["A"] += 1
        elif grade_str in ("B", "B - GROWTH"):
            counts["B"] += 1
        elif grade_str in ("C", "C - MAINTAIN"):
            counts["C"] += 1
        elif grade_str in ("D", "D - MONITOR"):
            counts["D"] += 1
        elif grade_str == "F":
            counts["F"] += 1
        else:
            counts["Blank"] += 1
    
    return dict(counts)


def compute_priority_tier_distribution(tiers_list: list[str]) -> dict[str, int]:
    """
    Compute counts of each priority tier (computed from Combined ICP Score).
    
    Args:
        tiers_list: List of priority tier values (A, B, C, D, F)
        
    Returns:
        Dict with counts for each tier
    """
    counts = defaultdict(int)
    
    for tier in tiers_list:
        tier_str = str(tier).strip().upper() if tier else ""
        
        if tier_str == "A":
            counts["A"] += 1
        elif tier_str == "B":
            counts["B"] += 1
        elif tier_str == "C":
            counts["C"] += 1
        elif tier_str == "D":
            counts["D"] += 1
        elif tier_str == "F":
            counts["F"] += 1
        else:
            counts["Blank"] += 1
    
    return dict(counts)


# ============================================================================
# Territory Statistics Computation
# ============================================================================

def compute_territory_stats(
    territory_id: str,
    unit_ids: list[str],
    aggregates: dict[str, dict],
    primary_metric: str,
    secondary_metric: str,
) -> TerritoryStats:
    """
    Compute statistics for a single territory from its assigned units.
    
    Args:
        territory_id: ID of the territory (e.g., "T1")
        unit_ids: List of unit IDs assigned to this territory
        aggregates: Unit aggregates from data_loader
        primary_metric: Name of primary balancing metric
        secondary_metric: Name of secondary balancing metric
        
    Returns:
        TerritoryStats object with all metrics
    """
    if not unit_ids:
        return TerritoryStats(
            territory_id=territory_id,
            primary_sum=0.0,
            secondary_sum=0.0,
            account_count=0,
            grades={},
            spend_dynamics=SpendDynamics(),
        )
    
    # Aggregate metrics across all units in this territory
    primary_sum = 0.0
    secondary_sum = 0.0
    account_count = 0
    
    # For grades, collect all grades from all units
    all_grades: dict[str, list] = defaultdict(list)
    
    # For spend dynamics, accumulate components
    spend_12m_sum = 0.0
    spend_13w_sum = 0.0
    gp_t4q_sum = 0.0
    gp_2023_sum = 0.0
    delta_13w_weighted_sum = 0.0
    yoy_13w_weighted_sum = 0.0
    weight_sum = 0.0
    trend_score_sum = 0.0
    recency_score_sum = 0.0
    momentum_score_sum = 0.0
    engagement_sum = 0.0
    
    for unit_id in unit_ids:
        if unit_id not in aggregates:
            continue
        
        unit = aggregates[unit_id]
        
        # Metrics
        metric_sums = unit.get("metric_sums", {})
        primary_sum += metric_sums.get(primary_metric, 0.0)
        secondary_sum += metric_sums.get(secondary_metric, 0.0)
        
        # Account count
        account_count += unit.get("account_count", 0)
        
        # Grades
        unit_grades = unit.get("grades", {})
        for field, grades_list in unit_grades.items():
            all_grades[field].extend(grades_list)
        
        # Spend dynamics components
        sd = unit.get("spend_dynamics", {})
        spend_12m_sum += sd.get("spend_12m", 0.0)
        spend_13w_sum += sd.get("spend_13w", 0.0)
        gp_t4q_sum += sd.get("GP_T4Q_Total", 0.0)
        gp_2023_sum += sd.get("GP_Since_2023_Total", 0.0)
        delta_13w_weighted_sum += sd.get("delta_13w_pct_weighted_sum", 0.0)
        yoy_13w_weighted_sum += sd.get("yoy_13w_pct_weighted_sum", 0.0)
        weight_sum += sd.get("weight_sum", 0.0)
        trend_score_sum += sd.get("trend_score_sum", 0.0)
        recency_score_sum += sd.get("recency_score_sum", 0.0)
        momentum_score_sum += sd.get("momentum_score_sum", 0.0)
        engagement_sum += sd.get("engagement_health_score_sum", 0.0)
    
    # Compute grade distributions
    grades_result = {}
    for field, grades_list in all_grades.items():
        if field == "Computed_Priority_Tier":
            grades_result[field] = compute_priority_tier_distribution(grades_list)
        else:
            grades_result[field] = compute_grade_distribution(grades_list)
    
    # Compute weighted averages for percentages
    delta_13w_pct = delta_13w_weighted_sum / weight_sum if weight_sum > 0 else 0.0
    yoy_13w_pct = yoy_13w_weighted_sum / weight_sum if weight_sum > 0 else 0.0
    
    # Compute simple averages for engagement scores
    trend_score = trend_score_sum / account_count if account_count > 0 else 0.0
    recency_score = recency_score_sum / account_count if account_count > 0 else 0.0
    momentum_score = momentum_score_sum / account_count if account_count > 0 else 0.0
    engagement_health = engagement_sum / account_count if account_count > 0 else 0.0
    
    spend_dynamics = SpendDynamics(
        spend_12m=round(spend_12m_sum, 2),
        spend_13w=round(spend_13w_sum, 2),
        delta_13w_pct=round(delta_13w_pct, 4),
        yoy_13w_pct=round(yoy_13w_pct, 4),
        gp_t4q_total=round(gp_t4q_sum, 2),
        gp_since_2023_total=round(gp_2023_sum, 2),
        trend_score=round(trend_score, 2),
        recency_score=round(recency_score, 2),
        momentum_score=round(momentum_score, 2),
        engagement_health_score=round(engagement_health, 2),
    )
    
    return TerritoryStats(
        territory_id=territory_id,
        primary_sum=round(primary_sum, 2),
        secondary_sum=round(secondary_sum, 2),
        account_count=account_count,
        grades=grades_result,
        spend_dynamics=spend_dynamics,
    )


# ============================================================================
# Scenario Statistics Computation
# ============================================================================

def compute_scenario_stats(
    scenario: dict,
    aggregates: dict[str, dict],
    k: int,
    primary_metric: str,
    secondary_metric: str,
    contiguity_info: dict | None = None,
) -> Scenario:
    """
    Compute full statistics for a scenario.
    
    Args:
        scenario: Dict with id, label, description, and assignments
        aggregates: Unit aggregates from data_loader
        k: Number of territories
        primary_metric: Name of primary balancing metric
        secondary_metric: Name of secondary balancing metric
        
    Returns:
        Complete Scenario object with stats and fairness metrics
    """
    assignments = scenario.get("assignments", {})
    
    # Group units by territory
    territory_units: dict[str, list[str]] = defaultdict(list)
    assigned_units = set()
    
    for unit_id, territory_id in assignments.items():
        if unit_id in aggregates:
            territory_units[territory_id].append(unit_id)
            assigned_units.add(unit_id)
    
    # Find unassigned units
    all_units = set(aggregates.keys())
    unassigned_units = list(all_units - assigned_units)
    
    # Compute stats for each territory
    territory_ids = [f"T{i+1}" for i in range(k)]
    territory_stats = {}
    
    primary_values = {}
    secondary_values = {}
    
    for tid in territory_ids:
        unit_ids = territory_units.get(tid, [])
        stats = compute_territory_stats(
            territory_id=tid,
            unit_ids=unit_ids,
            aggregates=aggregates,
            primary_metric=primary_metric,
            secondary_metric=secondary_metric,
        )
        territory_stats[tid] = stats
        primary_values[tid] = stats.primary_sum
        secondary_values[tid] = stats.secondary_sum
    
    # Compute fairness metrics
    fairness_primary = compute_fairness_metrics(primary_values)
    fairness_secondary = compute_fairness_metrics(secondary_values)
    
    contiguity_checked = False
    contiguity_ok = True
    non_contiguous = []
    if contiguity_info:
        contiguity_checked = bool(contiguity_info.get("checked", False))
        contiguity_ok = bool(contiguity_info.get("ok", True))
        non_contiguous = contiguity_info.get("non_contiguous", [])
    
    return Scenario(
        id=scenario.get("id", "unknown"),
        label=scenario.get("label", "Unknown"),
        description=scenario.get("description", ""),
        assignments=assignments,
        territory_stats=territory_stats,
        fairness_primary=fairness_primary,
        fairness_secondary=fairness_secondary,
        unassigned_units=sorted(unassigned_units),
        contiguity_checked=contiguity_checked,
        contiguity_ok=contiguity_ok,
        non_contiguous_territories=non_contiguous,
    )

