import type { Scenario, ScenarioId } from '../types';

interface ScenarioTabsProps {
  scenarios: Record<ScenarioId, Scenario | null>;
  activeScenarioId: ScenarioId;
  onSelectScenario: (id: ScenarioId) => void;
  onUseAsManual: (id: ScenarioId) => void;
}

const SCENARIO_ORDER: ScenarioId[] = ['manual', 'primary', 'secondary', 'dual'];

const SCENARIO_INFO: Record<ScenarioId, { label: string; icon: string }> = {
  manual: { label: 'Manual', icon: '✋' },
  primary: { label: 'Primary', icon: '🎯' },
  secondary: { label: 'Secondary', icon: '📊' },
  dual: { label: 'Dual', icon: '⚖️' },
};

export default function ScenarioTabs({
  scenarios,
  activeScenarioId,
  onSelectScenario,
  onUseAsManual,
}: ScenarioTabsProps) {
  const activeScenario = scenarios[activeScenarioId];

  return (
    <div className="border-b border-surface-700">
      {/* Tab Buttons */}
      <div className="flex p-2 gap-1">
        {SCENARIO_ORDER.map((id) => {
          const scenario = scenarios[id];
          const info = SCENARIO_INFO[id];
          const isActive = id === activeScenarioId;
          const hasData = !!scenario;
          
          return (
            <button
              key={id}
              onClick={() => hasData && onSelectScenario(id)}
              disabled={!hasData}
              className={`scenario-tab flex-1 flex items-center justify-center gap-1.5
                         ${isActive ? 'active' : ''}
                         ${!hasData ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <span>{info.icon}</span>
              <span className="text-xs">{info.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Scenario Info */}
      {activeScenario && (
        <div className="px-4 pb-3">
          {/* Equity Scores */}
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500">Primary Equity:</span>
              <span className={`font-bold text-sm ${
                activeScenario.fairness_primary.equity_score >= 90 ? 'text-emerald-400' :
                activeScenario.fairness_primary.equity_score >= 80 ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {activeScenario.fairness_primary.equity_score}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500">Secondary Equity:</span>
              <span className={`font-bold text-sm ${
                activeScenario.fairness_secondary.equity_score >= 90 ? 'text-emerald-400' :
                activeScenario.fairness_secondary.equity_score >= 80 ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {activeScenario.fairness_secondary.equity_score}
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-surface-500 mb-2">
            {activeScenario.description}
          </p>

          {/* Use as Manual Button (for optimization scenarios) */}
          {activeScenarioId !== 'manual' && (
            <button
              onClick={() => onUseAsManual(activeScenarioId)}
              className="btn btn-secondary text-xs py-1.5 w-full"
            >
              Use this scenario as Manual
            </button>
          )}

          {/* Unassigned units warning */}
          {activeScenario.unassigned_units.length > 0 && (
            <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {activeScenario.unassigned_units.length} unassigned {activeScenario.unassigned_units.length === 1 ? 'unit' : 'units'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


