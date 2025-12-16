// ============================================================================
// Configuration Types
// ============================================================================

export interface ConfigResponse {
  granularities: string[];
  default_granularity: string;
  numeric_metrics: string[];
  metric_display_names: Record<string, string>;
  default_primary_metric: string;
  default_secondary_metric: string;
  grade_fields: string[];
  industries: string[];
  industry_counts: Record<string, number>;
  row_count: number;
  state_count: number;
  zip_count: number;
}

// ============================================================================
// Financial Dynamics (formerly Spend Dynamics)
// ============================================================================

export interface FinancialDynamics {
  // GP (Gross Profit) time windows
  gp_12m: number;
  gp_24m: number;
  gp_36m: number;
  gp_t4q: number;
  gp_since_2023: number;
  // Legacy spend field (deprecated)
  spend_12m: number;
  gp_12m_prior: number;
  yoy_delta_12m: number;
  yoy_delta_12m_pct: number;
  // Assets
  total_assets: number;
  sw_assets: number;
  hw_assets: number;
  // High-touch weighted counts (grade weighted)
  high_touch_hw: number;
  high_touch_cre: number;
  high_touch_cpe: number;
  high_touch_combined: number;
  // Engagement scores
  trend_score: number;
  recency_score: number;
  momentum_score: number;
  engagement_health_score: number;
}

// Backwards compatibility alias
export type SpendDynamics = FinancialDynamics;

// ============================================================================
// Territory Statistics
// ============================================================================

export interface GradeDistribution {
  [grade: string]: number;
}

export interface TerritoryStats {
  territory_id: string;
  primary_sum: number;
  secondary_sum: number;
  account_count: number;
  grades: Record<string, GradeDistribution>;
  // Flexible metric sums for any balancing metric
  metric_sums: Record<string, number>;
  // Financial dynamics (GP, assets, high-touch)
  financial_dynamics: FinancialDynamics;
  // Backwards compatibility alias
  spend_dynamics?: SpendDynamics;
}

// ============================================================================
// Fairness Metrics
// ============================================================================

export interface FairnessMetrics {
  gini: number;
  theil: number;
  max_min_ratio: number;
  equity_score: number;
}

// ============================================================================
// Scenario
// ============================================================================

export interface Scenario {
  id: string;
  label: string;
  description: string;
  assignments: Record<string, string>; // unit_id -> territory_id
  territory_stats: Record<string, TerritoryStats>;
  fairness_primary: FairnessMetrics;
  fairness_secondary: FairnessMetrics;
  unassigned_units: string[];
  contiguity_checked: boolean;
  contiguity_ok: boolean;
  non_contiguous_territories: string[];
}

// ============================================================================
// API Request Types
// ============================================================================

export interface OptimizeRequest {
  k: number;
  granularity: string;
  primary_metric: string;
  secondary_metric: string;
  locked_assignments: Record<string, string>;
  seed_assignments?: Record<string, string>;
  excluded_industries?: string[];
  country_filter?: 'us' | 'ca' | 'all' | null;
  require_contiguity?: boolean;
  force_contiguity?: boolean;
}

export interface EvaluateRequest {
  k: number;
  granularity: string;
  primary_metric: string;
  secondary_metric: string;
  assignments: Record<string, string>;
  excluded_industries?: string[];
  country_filter?: 'us' | 'ca' | 'all' | null;
}

export interface ExportCsvRequest {
  granularity: string;
  primary_metric: string;
  secondary_metric: string;
  assignments: Record<string, string>;
  scenario_id: string;
  scenario_label?: string | null;
  excluded_industries?: string[];
  country_filter?: 'us' | 'ca' | 'all' | null;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface OptimizeResponse {
  scenarios: Scenario[];
  warnings?: string[];
}

export interface EvaluateResponse {
  scenario: Scenario;
}

export interface HealthResponse {
  status: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export type ScenarioId = 'manual' | 'primary' | 'secondary';

export interface AppState {
  config: ConfigResponse | null;
  k: number;
  granularity: string;
  primaryMetric: string;
  secondaryMetric: string;
  scenarios: Record<ScenarioId, Scenario | null>;
  activeScenarioId: ScenarioId;
  activeTerritoryId: string | null;
  isLoading: boolean;
  error: string | null;
}

// ============================================================================
// Territory Colors
// ============================================================================

export const TERRITORY_COLORS: Record<string, string> = {
  T1: '#3B82F6',  // Blue
  T2: '#10B981',  // Emerald
  T3: '#F59E0B',  // Amber
  T4: '#EF4444',  // Red
  T5: '#8B5CF6',  // Violet
  T6: '#EC4899',  // Pink
  T7: '#06B6D4',  // Cyan
  T8: '#84CC16',  // Lime
  T9: '#F97316',  // Orange
  T10: '#6366F1', // Indigo
  T11: '#14B8A6', // Teal
  T12: '#A855F7', // Purple
  T13: '#F43F5E', // Rose
  T14: '#22C55E', // Green
  T15: '#0EA5E9', // Sky
  unassigned: '#94A3B8', // Gray
};

export function getTerritoryColor(territoryId: string | null | undefined): string {
  if (!territoryId) return TERRITORY_COLORS.unassigned;
  return TERRITORY_COLORS[territoryId] || TERRITORY_COLORS.unassigned;
}
