import { useState, useEffect, useCallback } from 'react';
import api from './api/client';
import MapView from './components/MapView';
import ControlPanel, { type CountryFilter } from './components/ControlPanel';
import TerritoryList from './components/TerritoryList';
import ScenarioTabs from './components/ScenarioTabs';
import InsightsDrawer from './components/InsightsDrawer';
import type {
  ConfigResponse,
  Scenario,
  ScenarioId,
} from './types';

function App() {
  // Configuration from backend
  const [config, setConfig] = useState<ConfigResponse | null>(null);

  // User settings
  const [k, setK] = useState(8);
  const [granularity, setGranularity] = useState('state');
  const [primaryMetric, setPrimaryMetric] = useState('Weighted_ICP_Value');
  const [secondaryMetric, setSecondaryMetric] = useState('spend_12m');
  const [countryFilter, setCountryFilter] = useState<CountryFilter>('all');
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>([]);

  // Scenarios
  const [scenarios, setScenarios] = useState<Record<ScenarioId, Scenario | null>>({
    manual: null,
    primary: null,
    secondary: null,
    dual: null,
  });
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>('manual');

  // UI state
  const [activeTerritoryId, setActiveTerritoryId] = useState<string | null>('T1');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Current active scenario
  const activeScenario = scenarios[activeScenarioId];

  // Manual assignments (editable by clicking map)
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});

  // Seed assignments (TerritoryId -> UnitId)
  const [seeds, setSeeds] = useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = useState<'assign' | 'seed'>('assign');

  // Load configuration on mount
  useEffect(() => {
    async function loadConfig() {
      try {
        setIsLoading(true);
        const cfg = await api.getConfig();
        setConfig(cfg);
        setGranularity(cfg.default_granularity);
        setPrimaryMetric(cfg.default_primary_metric);
        setSecondaryMetric(cfg.default_secondary_metric);
        setError(null);
        setWarnings([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load configuration');
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  // Evaluate manual assignments when they change or settings change
  useEffect(() => {
    if (!config) return;

    async function evaluateManual() {
      try {
        const response = await api.evaluate({
          k,
          granularity,
          primary_metric: primaryMetric,
          secondary_metric: secondaryMetric,
          assignments: manualAssignments,
          excluded_industries: excludedIndustries,
        });
        setScenarios(prev => ({ ...prev, manual: response.scenario }));
      } catch (err) {
        console.error('Failed to evaluate manual assignments:', err);
      }
    }

    evaluateManual();
  }, [config, k, granularity, primaryMetric, secondaryMetric, manualAssignments, excludedIndustries]);

  // Handle map click to assign/unassign units
  const handleUnitClick = useCallback((unitId: string) => {
    if (!activeTerritoryId) return;

    if (selectionMode === 'seed') {
      // Set as seed for active territory
      setSeeds(prev => ({
        ...prev,
        [activeTerritoryId]: unitId
      }));
      // Also lock it to this territory
      setManualAssignments(prev => ({
        ...prev,
        [unitId]: activeTerritoryId
      }));
      // Reset mode
      setSelectionMode('assign');
      // Switch to manual scenario
      setActiveScenarioId('manual');
      return;
    }

    setManualAssignments(prev => {
      const newAssignments = { ...prev };

      if (newAssignments[unitId] === activeTerritoryId) {
        // Clicking same territory = unassign
        delete newAssignments[unitId];
      } else {
        // Assign to active territory
        newAssignments[unitId] = activeTerritoryId;
      }

      return newAssignments;
    });

    // Switch to manual scenario when editing
    setActiveScenarioId('manual');
  }, [activeTerritoryId, selectionMode]);

  // Handle entering seed mode
  const handleSetSeedMode = useCallback(() => {
    setSelectionMode('seed');
  }, []);

  // Run optimization
  const handleOptimize = useCallback(async () => {
    if (!config) return;

    try {
      setIsLoading(true);
      setError(null);

      const response = await api.optimize({
        k,
        granularity,
        primary_metric: primaryMetric,
        secondary_metric: secondaryMetric,
        locked_assignments: manualAssignments,
        seed_assignments: Object.entries(seeds).reduce((acc, [tid, uid]) => {
          acc[uid] = tid;
          return acc;
        }, {} as Record<string, string>),
        excluded_industries: excludedIndustries,
        require_contiguity: true,
        force_contiguity: false,
      });

      // Update scenarios from response
      const newScenarios: Record<ScenarioId, Scenario | null> = {
        ...scenarios,
      };

      for (const scenario of response.scenarios) {
        newScenarios[scenario.id as ScenarioId] = scenario;
      }

      setScenarios(newScenarios);
      setWarnings(response.warnings || []);
      setActiveScenarioId('primary');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
      setWarnings([]);
    } finally {
      setIsLoading(false);
    }
  }, [config, k, granularity, primaryMetric, secondaryMetric, manualAssignments, seeds, excludedIndustries]);

  // Use scenario as manual
  const handleUseAsManual = useCallback((scenarioId: ScenarioId) => {
    const scenario = scenarios[scenarioId];
    if (!scenario) return;

    setManualAssignments(scenario.assignments);
    setActiveScenarioId('manual');
  }, [scenarios]);

  // Get current assignments for map
  const currentAssignments = activeScenario?.assignments || manualAssignments;

  // Invert seeds for MapView (UnitId -> TerritoryId)
  const seedsForMap = Object.entries(seeds).reduce((acc, [tid, uid]) => {
    acc[uid] = tid;
    return acc;
  }, {} as Record<string, string>);

  // Calculate totals for ideal comparison
  const calculateTotals = () => {
    if (!activeScenario) return { totalPrimary: 0, totalSecondary: 0 };

    let totalPrimary = 0;
    let totalSecondary = 0;

    Object.values(activeScenario.territory_stats).forEach(stats => {
      totalPrimary += stats.primary_sum;
      totalSecondary += stats.secondary_sum;
    });

    return { totalPrimary, totalSecondary };
  };

  const { totalPrimary, totalSecondary } = calculateTotals();
  const idealPrimary = k > 0 ? totalPrimary / k : 0;
  const idealSecondary = k > 0 ? totalSecondary / k : 0;

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-900">
        <div className="text-center">
          {isLoading ? (
            <>
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-surface-400">Loading configuration...</p>
            </>
          ) : error ? (
            <>
              <div className="text-red-400 text-xl mb-4">⚠️ {error}</div>
              <p className="text-surface-500">Make sure the backend is running on port 8000</p>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-surface-900 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-16 bg-surface-800 border-b border-surface-700 flex items-center px-6 shrink-0">
        <h1 className="text-xl font-display font-bold text-gradient">
          ICP Territory Builder
        </h1>
        <div className="ml-6 flex items-center gap-4 text-sm text-surface-400">
          <span>{config.row_count.toLocaleString()} accounts</span>
          <span>•</span>
          <span>{granularity === 'state' ? config.state_count : config.zip_count} {granularity}s</span>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {warnings.length > 0 && (
            <div className="text-amber-300 text-sm max-w-md truncate">
              ⚠️ {warnings[0]}{warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}
            </div>
          )}
          {error && (
            <div className="text-red-400 text-sm">
              {error}
            </div>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-blue-400">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm">Processing...</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map Area */}
        <div className="flex-1 relative">
          <MapView
            granularity={granularity}
            assignments={currentAssignments}
            seeds={seedsForMap}
            activeTerritoryId={activeTerritoryId}
            onUnitClick={handleUnitClick}
            countryFilter={countryFilter}
          />
        </div>

        {/* Right Panel - unified scroll */}
        <aside className="w-96 bg-surface-800 border-l border-surface-700 flex flex-col overflow-y-auto">
          {/* Control Panel */}
          <div className="shrink-0">
            <ControlPanel
              k={k}
              setK={setK}
              granularity={granularity}
              setGranularity={setGranularity}
              primaryMetric={primaryMetric}
              setPrimaryMetric={setPrimaryMetric}
              secondaryMetric={secondaryMetric}
              setSecondaryMetric={setSecondaryMetric}
              metrics={config.numeric_metrics}
              metricDisplayNames={config.metric_display_names || {}}
              industries={config.industries || []}
              industryCounts={config.industry_counts || {}}
              excludedIndustries={excludedIndustries}
              setExcludedIndustries={setExcludedIndustries}
              onOptimize={handleOptimize}
              isLoading={isLoading}
              countryFilter={countryFilter}
              setCountryFilter={setCountryFilter}
            />

            {/* Scenario Tabs */}
            <ScenarioTabs
              scenarios={scenarios}
              activeScenarioId={activeScenarioId}
              onSelectScenario={setActiveScenarioId}
              onUseAsManual={handleUseAsManual}
            />
          </div>

          {/* Territory List */}
          <div className="shrink-0">
            <TerritoryList
              k={k}
              scenario={activeScenario}
              activeTerritoryId={activeTerritoryId}
              onSelectTerritory={setActiveTerritoryId}
              idealPrimary={idealPrimary}
              idealSecondary={idealSecondary}
              primaryMetric={primaryMetric}
              secondaryMetric={secondaryMetric}
              seeds={seeds}
              onSetSeedMode={handleSetSeedMode}
              isSeedMode={selectionMode === 'seed'}
            />
          </div>
        </aside>
      </div>

      {/* Insights Drawer */}
      <InsightsDrawer
        isOpen={drawerOpen}
        onToggle={() => setDrawerOpen(!drawerOpen)}
        scenario={activeScenario}
        scenarios={scenarios}
        k={k}
        idealPrimary={idealPrimary}
        idealSecondary={idealSecondary}
        primaryMetric={primaryMetric}
        secondaryMetric={secondaryMetric}
      />
    </div>
  );
}

export default App;
