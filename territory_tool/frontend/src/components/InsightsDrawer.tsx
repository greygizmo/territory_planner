import type { Scenario, ScenarioId } from '../types';
import { getTerritoryColor } from '../types';

interface InsightsDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  scenario: Scenario | null;
  scenarios: Record<ScenarioId, Scenario | null>;
  k: number;
  idealPrimary: number;
  idealSecondary: number;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(1);
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export default function InsightsDrawer({
  isOpen,
  onToggle,
  scenario,
  scenarios,
  k,
  idealPrimary,
  idealSecondary,
}: InsightsDrawerProps) {
  const drawerHeight = isOpen ? 'h-80' : 'h-0';
  const territoryIds = Array.from({ length: k }, (_, i) => `T${i + 1}`);

  // Calculate grade percentages
  const getGradePercent = (grades: Record<string, number> | undefined, target: string[]): number => {
    if (!grades) return 0;
    const total = Object.values(grades).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    const targetSum = target.reduce((sum, key) => sum + (grades[key] || 0), 0);
    return (targetSum / total) * 100;
  };

  return (
    <div className={`drawer ${drawerHeight} transition-all duration-300`}>
      {/* Drawer Handle */}
      <button
        onClick={onToggle}
        className="drawer-handle"
        aria-label={isOpen ? 'Close insights' : 'Open insights'}
      >
        <svg
          className={`w-5 h-5 text-surface-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {/* Drawer Content */}
      <div className="h-full overflow-auto p-6">
        {scenario ? (
          <div className="grid grid-cols-3 gap-6">
            {/* Global Metrics */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider">
                Global Metrics
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="card p-3">
                  <div className="stat-label">Total Primary</div>
                  <div className="stat-value text-lg">{formatNumber(idealPrimary * k)}</div>
                  <div className="text-xs text-surface-500">Ideal: {formatNumber(idealPrimary)}/territory</div>
                </div>
                <div className="card p-3">
                  <div className="stat-label">Total Secondary</div>
                  <div className="stat-value text-lg">{formatCurrency(idealSecondary * k)}</div>
                  <div className="text-xs text-surface-500">Ideal: {formatCurrency(idealSecondary)}/territory</div>
                </div>
              </div>

              {/* Primary Fairness */}
              <div className="card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="stat-label">Primary Equity</span>
                  <span className={`text-2xl font-bold ${
                    scenario.fairness_primary.equity_score >= 90 ? 'text-emerald-400' :
                    scenario.fairness_primary.equity_score >= 80 ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {scenario.fairness_primary.equity_score}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-surface-500">
                  <div>Gini: {scenario.fairness_primary.gini.toFixed(3)}</div>
                  <div>Theil: {scenario.fairness_primary.theil.toFixed(3)}</div>
                  <div>Max/Min: {scenario.fairness_primary.max_min_ratio.toFixed(2)}×</div>
                </div>
              </div>

              {/* Secondary Fairness */}
              <div className="card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="stat-label">Secondary Equity</span>
                  <span className={`text-2xl font-bold ${
                    scenario.fairness_secondary.equity_score >= 90 ? 'text-emerald-400' :
                    scenario.fairness_secondary.equity_score >= 80 ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {scenario.fairness_secondary.equity_score}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-surface-500">
                  <div>Gini: {scenario.fairness_secondary.gini.toFixed(3)}</div>
                  <div>Theil: {scenario.fairness_secondary.theil.toFixed(3)}</div>
                  <div>Max/Min: {scenario.fairness_secondary.max_min_ratio.toFixed(2)}×</div>
                </div>
              </div>
            </div>

            {/* Scenario Comparison */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider">
                Scenario Comparison
              </h3>
              
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-surface-500 border-b border-surface-700">
                    <th className="text-left py-2">Scenario</th>
                    <th className="text-right py-2">Primary Eq.</th>
                    <th className="text-right py-2">Gini</th>
                    <th className="text-right py-2">Secondary Eq.</th>
                  </tr>
                </thead>
                <tbody>
                  {(['manual', 'primary', 'secondary'] as ScenarioId[]).map((id) => {
                    const s = scenarios[id];
                    if (!s) return null;
                    
                    return (
                      <tr key={id} className="border-b border-surface-700/50 hover:bg-surface-700/30">
                        <td className="py-2 capitalize">{id}</td>
                        <td className={`py-2 text-right font-medium ${
                          s.fairness_primary.equity_score >= 90 ? 'text-emerald-400' :
                          s.fairness_primary.equity_score >= 80 ? 'text-amber-400' :
                          'text-red-400'
                        }`}>
                          {s.fairness_primary.equity_score}
                        </td>
                        <td className="py-2 text-right text-surface-400">
                          {s.fairness_primary.gini.toFixed(3)}
                        </td>
                        <td className={`py-2 text-right font-medium ${
                          s.fairness_secondary.equity_score >= 90 ? 'text-emerald-400' :
                          s.fairness_secondary.equity_score >= 80 ? 'text-amber-400' :
                          'text-red-400'
                        }`}>
                          {s.fairness_secondary.equity_score}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Territory Comparison Table */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-surface-300 uppercase tracking-wider">
                Territory Comparison
              </h3>
              
              <div className="max-h-60 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-800">
                    <tr className="text-surface-500 border-b border-surface-700">
                      <th className="text-left py-2">Territory</th>
                      <th className="text-right py-2">Accounts</th>
                      <th className="text-right py-2">HW A/B%</th>
                      <th className="text-right py-2">CRE A/B%</th>
                      <th className="text-right py-2">Prio A+B%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {territoryIds.map((tid) => {
                      const stats = scenario.territory_stats[tid];
                      if (!stats) return null;
                      
                      const hwPct = getGradePercent(stats.grades?.['Hardware_ICP_Grade'], ['A', 'B']);
                      const crePct = getGradePercent(stats.grades?.['CRE_ICP_Grade'], ['A', 'B']);
                      // Backend provides a computed tier ("Computed_Priority_Tier") as simple letter grades (A/B/C/D/F).
                      const prioPct = getGradePercent(stats.grades?.['Computed_Priority_Tier'], ['A', 'B']);
                      
                      return (
                        <tr key={tid} className="border-b border-surface-700/50 hover:bg-surface-700/30">
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getTerritoryColor(tid) }}
                              />
                              {tid}
                            </div>
                          </td>
                          <td className="py-2 text-right">{stats.account_count.toLocaleString()}</td>
                          <td className="py-2 text-right">{hwPct.toFixed(0)}%</td>
                          <td className="py-2 text-right">{crePct.toFixed(0)}%</td>
                          <td className="py-2 text-right">{prioPct.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-surface-500">
            No scenario data available. Click &quot;Optimize Territories&quot; to generate scenarios.
          </div>
        )}
      </div>
    </div>
  );
}

