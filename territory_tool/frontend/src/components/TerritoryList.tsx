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
  metricDisplayNames: Record<string, string>;
  seeds?: Record<string, string>; // TerritoryId -> UnitId
  onSetSeedMode?: () => void;
  isSeedMode?: boolean;
}

// Format helpers
function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(1);
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function getRatioVsIdeal(value: number, ideal: number): { ratio: number; label: string; color: string } {
  if (ideal === 0) return { ratio: 1, label: '—', color: 'text-surface-500' };
  const ratio = value / ideal;
  const label = `${ratio.toFixed(2)}× ideal`;
  if (ratio >= 0.95 && ratio <= 1.05) return { ratio, label, color: 'text-emerald-400' };
  if (ratio >= 0.85 && ratio <= 1.15) return { ratio, label, color: 'text-amber-400' };
  return { ratio, label, color: 'text-red-400' };
}

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
  metricDisplayNames,
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
        const primaryLabel = metricDisplayNames[primaryMetric] || primaryMetric.replace(/_/g, ' ');
        const secondaryLabel = metricDisplayNames[secondaryMetric] || secondaryMetric.replace(/_/g, ' ');
        const metrics = stats?.metric_sums || {};
        const totalAssets = metrics['Total_Assets'] || 0;
        const hwAssets = metrics['HW_Assets'] || 0;
        const creAssets = metrics['CRE_Assets'] || 0;
        const cpeAssets = metrics['CPE_Assets'] || 0;

        const hwGrades = getGradeMix(stats?.grades?.['Hardware_ICP_Grade']);
        const creGrades = getGradeMix(stats?.grades?.['CRE_ICP_Grade']);
        const cpeGrades = getGradeMix(stats?.grades?.['CPE_ICP_Grade']);

        const dynamics = stats?.financial_dynamics || stats?.spend_dynamics;
        const yoyPct = dynamics?.yoy_delta_12m_pct || 0;
        const yoyColor =
          yoyPct > 5 ? 'text-emerald-400' : yoyPct < -5 ? 'text-red-400' : 'text-surface-300';
        const attentionAll = metrics['HighTouchWeighted_Combined'] || dynamics?.high_touch_combined || 0;

        return (
          <div
            key={tid}
            onClick={() => onSelectTerritory(tid)}
            className={`territory-card ${isActive ? 'active' : ''}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="font-medium text-sm">Territory {tid.slice(1)}</span>
              <span className="text-xs text-surface-500">({tid})</span>
              <span className="ml-auto text-xs text-surface-400">
                {stats?.account_count?.toLocaleString() || 0} accounts
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-xs text-surface-500 mb-1 truncate" title={primaryLabel}>
                  {primaryLabel}
                </div>
                <div className="font-bold text-sm">{formatNumber(stats?.primary_sum || 0)}</div>
                <div className={`text-xs ${primaryRatio.color}`}>{primaryRatio.label}</div>
                <div className="metric-bar mt-1">
                  <div
                    className="metric-bar-fill"
                    style={{
                      width: `${Math.min(Math.max(primaryRatio.ratio * 100, 0), 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="text-xs text-surface-500 mb-1 truncate" title={secondaryLabel}>
                  {secondaryLabel}
                </div>
                <div className="font-bold text-sm">
                  {secondaryMetric.includes('spend') || secondaryMetric.includes('GP')
                    ? formatCurrency(stats?.secondary_sum || 0)
                    : formatNumber(stats?.secondary_sum || 0)}
                </div>
                <div className={`text-xs ${secondaryRatio.color}`}>{secondaryRatio.label}</div>
                <div className="metric-bar mt-1">
                  <div
                    className="metric-bar-fill"
                    style={{
                      width: `${Math.min(Math.max(secondaryRatio.ratio * 100, 0), 100)}%`,
                      backgroundColor: color,
                      opacity: 0.65,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] mb-2">
              <span className="px-2 py-1 rounded bg-surface-700 text-surface-200" title="Hardware ICP Grade A+B %">
                HW A/B {hwGrades.ab.toFixed(0)}%
              </span>
              <span className="px-2 py-1 rounded bg-surface-700 text-surface-200" title="CRE ICP Grade A+B %">
                CRE A/B {creGrades.ab.toFixed(0)}%
              </span>
              <span className="px-2 py-1 rounded bg-surface-700 text-surface-200" title="CPE ICP Grade A+B %">
                CPE A/B {cpeGrades.ab.toFixed(0)}%
              </span>
            </div>

            {dynamics && (
              <div className="text-xs text-surface-400 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] text-surface-500">GP 12m</div>
                    <div className="font-medium text-surface-200 truncate">{formatCurrency(dynamics.gp_12m || 0)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-surface-500">GP 24m</div>
                    <div className="font-medium text-surface-200 truncate">{formatCurrency(dynamics.gp_24m || 0)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-surface-500">GP 36m</div>
                    <div className="font-medium text-surface-200 truncate">{formatCurrency(dynamics.gp_36m || 0)}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="truncate">
                    YoY Δ: <span className="text-surface-200 font-medium">{formatCurrency(dynamics.yoy_delta_12m || 0)}</span>
                  </div>
                  <div className={`shrink-0 font-medium ${yoyColor}`} title="YoY Δ% (computed from summed 12m and prior 12m)">
                    {formatPercent(yoyPct)}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="truncate">
                    Assets: <span className="text-surface-200 font-medium">{formatNumber(totalAssets)}</span>
                  </div>
                  <div className="truncate">
                    Attn Load: <span className="text-surface-200 font-medium">{formatNumber(attentionAll)}</span>
                  </div>
                  <div className="truncate text-surface-500">
                    HW/CRE/CPE: {formatNumber(hwAssets)} / {formatNumber(creAssets)} / {formatNumber(cpeAssets)}
                  </div>
                </div>
              </div>
            )}

            {isActive && onSetSeedMode && (
              <div className="mt-2 flex items-center justify-between border-t border-surface-700 pt-2">
                <div className="text-xs">
                  <span className="text-surface-400">Seed: </span>
                  <span className="font-medium text-white truncate max-w-[100px] inline-block align-bottom">
                    {seeds?.[tid] || 'None'}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetSeedMode();
                  }}
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
