import type { Scenario } from '../types';
import { getTerritoryColor } from '../types';

interface TerritoryListProps {
  k: number;
  scenario: Scenario | null;
  activeTerritoryId: string | null;
  onSelectTerritory: (id: string) => void;
  idealPrimary: number;
  idealSecondary: number;
  primaryMetric: string;
  secondaryMetric: string;
  seeds?: Record<string, string>; // TerritoryId -> UnitId
  onSetSeedMode?: () => void;
  isSeedMode?: boolean;
}

// Format large numbers compactly
function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(1);
}

// Format currency
function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toFixed(0)}`;
}

// Format percentage (value is already in percentage form, e.g., 5.5 means 5.5%)
function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Get ratio vs ideal
function getRatioVsIdeal(value: number, ideal: number): { ratio: number; label: string; color: string } {
  if (ideal === 0) return { ratio: 1, label: '—', color: 'text-surface-500' };

  const ratio = value / ideal;
  const label = `${ratio.toFixed(2)}× ideal`;

  if (ratio >= 0.95 && ratio <= 1.05) {
    return { ratio, label, color: 'text-emerald-400' };
  }
  if (ratio >= 0.85 && ratio <= 1.15) {
    return { ratio, label, color: 'text-amber-400' };
  }
  return { ratio, label, color: 'text-red-400' };
}

// Calculate grade mix percentages
function getGradeMix(grades: Record<string, number> | undefined): { ab: number; cdf: number } {
  if (!grades) return { ab: 0, cdf: 0 };

  const a = grades['A'] || grades['A - Strategic'] || 0;
  const b = grades['B'] || grades['B - Growth'] || 0;
  const c = grades['C'] || grades['C - Maintain'] || 0;
  const d = grades['D'] || grades['D - Monitor'] || 0;
  const f = grades['F'] || 0;
  const blank = grades['Blank'] || 0;

  const total = a + b + c + d + f + blank;
  if (total === 0) return { ab: 0, cdf: 0 };

  const ab = ((a + b) / total) * 100;
  const cdf = ((c + d + f) / total) * 100;

  return { ab, cdf };
}

export default function TerritoryList({
  k,
  scenario,
  activeTerritoryId,
  onSelectTerritory,
  idealPrimary,
  idealSecondary,
  primaryMetric,
  secondaryMetric,
  seeds,
  onSetSeedMode,
  isSeedMode,
}: TerritoryListProps) {
  const territoryIds = Array.from({ length: k }, (_, i) => `T${i + 1}`);

  return (
    <div className="p-3 space-y-2">
      <h3 className="text-xs font-medium text-surface-500 uppercase tracking-wider px-1 mb-2">
        Territories
      </h3>

      {territoryIds.map((tid) => {
        const stats = scenario?.territory_stats[tid];
        const isActive = tid === activeTerritoryId;
        const color = getTerritoryColor(tid);

        const primaryRatio = getRatioVsIdeal(stats?.primary_sum || 0, idealPrimary);
        const secondaryRatio = getRatioVsIdeal(stats?.secondary_sum || 0, idealSecondary);

        // Grade mixes
        const hwGrades = getGradeMix(stats?.grades?.['Hardware_ICP_Grade']);
        const creGrades = getGradeMix(stats?.grades?.['CRE_ICP_Grade']);
        const priorityGrades = getGradeMix(stats?.grades?.['Computed_Priority_Tier']);

        // Spend dynamics
        const dynamics = stats?.spend_dynamics;

        return (
          <div
            key={tid}
            onClick={() => onSelectTerritory(tid)}
            className={`territory-card ${isActive ? 'active' : ''}`}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-4 h-4 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-medium text-sm">Territory {tid.slice(1)}</span>
              <span className="text-xs text-surface-500">({tid})</span>
              <span className="ml-auto text-xs text-surface-400">
                {stats?.account_count?.toLocaleString() || 0} accounts
              </span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              {/* Primary Metric */}
              <div>
                <div className="text-xs text-surface-500 mb-1 truncate" title={primaryMetric}>
                  {primaryMetric.replace(/_/g, ' ')}
                </div>
                <div className="font-bold text-sm">
                  {formatNumber(stats?.primary_sum || 0)}
                </div>
                <div className={`text-xs ${primaryRatio.color}`}>
                  {primaryRatio.label}
                </div>
                {/* Mini bar */}
                <div className="metric-bar mt-1">
                  <div
                    className="metric-bar-fill"
                    style={{
                      width: `${Math.min(primaryRatio.ratio * 100, 150)}%`,
                      backgroundColor: color,
                      maxWidth: '100%',
                    }}
                  />
                </div>
              </div>

              {/* Secondary Metric */}
              <div>
                <div className="text-xs text-surface-500 mb-1 truncate" title={secondaryMetric}>
                  {secondaryMetric.replace(/_/g, ' ')}
                </div>
                <div className="font-bold text-sm">
                  {secondaryMetric.includes('spend') || secondaryMetric.includes('GP')
                    ? formatCurrency(stats?.secondary_sum || 0)
                    : formatNumber(stats?.secondary_sum || 0)}
                </div>
                <div className={`text-xs ${secondaryRatio.color}`}>
                  {secondaryRatio.label}
                </div>
                <div className="metric-bar mt-1">
                  <div
                    className="metric-bar-fill bg-surface-500"
                    style={{
                      width: `${Math.min(secondaryRatio.ratio * 100, 150)}%`,
                      maxWidth: '100%',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Grade Mix - Compact */}
            <div className="text-xs space-y-1 mb-2">
              <div className="flex justify-between text-surface-400">
                <span title="Hardware ICP Grade A+B %">HW A/B: {hwGrades.ab.toFixed(0)}%</span>
                <span title="CRE ICP Grade A+B %">CRE A/B: {creGrades.ab.toFixed(0)}%</span>
                <span title="Combined ICP Priority Tier A+B %">ICP A/B: {priorityGrades.ab.toFixed(0)}%</span>
              </div>
            </div>

            {/* Spend Dynamics - One line */}
            {dynamics && (
              <div className="text-xs text-surface-500 truncate">
                12m: {formatCurrency(dynamics.spend_12m)} •
                Δ13w: {formatPercent(dynamics.delta_13w_pct)} •
                YoY: {formatPercent(dynamics.yoy_13w_pct)}
              </div>
            )}

            {/* Seed Selection */}
            {isActive && onSetSeedMode && (
              <div className="mt-2 flex items-center justify-between border-t border-surface-700 pt-2">
                <div className="text-xs">
                  <span className="text-surface-400">Seed: </span>
                  <span className="font-medium text-white truncate max-w-[100px] inline-block align-bottom">
                    {seeds?.[tid] || 'None'}
                  </span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onSetSeedMode(); }}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${isSeedMode
                    ? 'bg-amber-500/20 text-amber-300 animate-pulse border border-amber-500/50'
                    : 'bg-surface-700 hover:bg-surface-600 text-surface-200'
                    }`}
                >
                  {isSeedMode ? 'Click Map...' : 'Set Seed'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
