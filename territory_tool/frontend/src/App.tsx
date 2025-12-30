import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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

// Debounce utility
function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<number | null>(null);
  const callbackRef = useRef(callback);
  
  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = window.setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]) as T;
}

function deriveStateAssignmentsFromZips(
  zipAssignments: Record<string, string>,
  zipToState: Record<string, string>
): Record<string, string> {
  const stateTerritoryCounts: Record<string, Record<string, number>> = {};

  for (const [zip, territoryId] of Object.entries(zipAssignments)) {
    if (!territoryId) continue;
    const state = zipToState[zip];
    if (!state) continue;
    const stateKey = state.toUpperCase();
    const counts = stateTerritoryCounts[stateKey] || {};
    counts[territoryId] = (counts[territoryId] || 0) + 1;
    stateTerritoryCounts[stateKey] = counts;
  }

  const derived: Record<string, string> = {};
  for (const [state, counts] of Object.entries(stateTerritoryCounts)) {
    let topTerritory = '';
    let topCount = -1;
    for (const [territoryId, count] of Object.entries(counts)) {
      const isHigher = count > topCount;
      const isTieBreaker =
        count === topCount &&
        territoryId.localeCompare(topTerritory, undefined, { numeric: true }) < 0;
      if (isHigher || isTieBreaker) {
        topTerritory = territoryId;
        topCount = count;
      }
    }
    if (topTerritory) {
      derived[state] = topTerritory;
    }
  }

  return derived;
}

// Paint mode types
export type PaintMode = 'click' | 'brush' | 'erase';

function App() {
  // Configuration from backend
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [zipToState, setZipToState] = useState<Record<string, string>>({});

  // User settings
  const [k, setK] = useState(8);
  const [granularity, setGranularity] = useState('state');
  const [primaryMetric, setPrimaryMetric] = useState('Weighted_ICP_Value');
  const [secondaryMetric, setSecondaryMetric] = useState('spend_12m');
  const [countryFilter, setCountryFilter] = useState<CountryFilter>('all');
  const [excludedIndustries, setExcludedIndustries] = useState<string[]>([]);

  // Scenarios (removed dual)
  const [scenarios, setScenarios] = useState<Record<ScenarioId, Scenario | null>>({
    manual: null,
    primary: null,
    secondary: null,
  });
  const [activeScenarioId, setActiveScenarioId] = useState<ScenarioId>('manual');

  // Paint mode for brush/erase functionality
  const [paintMode, setPaintMode] = useState<PaintMode>('click');

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
        // ZIP mode needs a ZIP->state lookup for map coloring.
        // We load it once; it’s used only when granularity === 'zip'.
        try {
          const z2s = await api.getZipToState();
          setZipToState(z2s);
        } catch (e) {
          console.warn('Failed to load zip_to_state mapping; ZIP mode may be limited.', e);
          setZipToState({});
        }
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

  // Debounced evaluate function to prevent excessive API calls
  const debouncedEvaluate = useDebouncedCallback(
    async (params: {
      k: number;
      granularity: string;
      primaryMetric: string;
      secondaryMetric: string;
      manualAssignments: Record<string, string>;
      excludedIndustries: string[];
      countryFilter: CountryFilter;
    }) => {
      try {
        const response = await api.evaluate({
          k: params.k,
          granularity: params.granularity,
          primary_metric: params.primaryMetric,
          secondary_metric: params.secondaryMetric,
          assignments: params.manualAssignments,
          excluded_industries: params.excludedIndustries,
          country_filter: params.countryFilter,
        });
        setScenarios(prev => ({ ...prev, manual: response.scenario }));
      } catch (err) {
        console.error('Failed to evaluate manual assignments:', err);
      }
    },
    300 // 300ms debounce for paint mode responsiveness
  );

  // Evaluate manual assignments when they change or settings change
  useEffect(() => {
    if (!config) return;

    debouncedEvaluate({
      k,
      granularity,
      primaryMetric,
      secondaryMetric,
      manualAssignments,
      excludedIndustries,
      countryFilter,
    });
  }, [config, k, granularity, primaryMetric, secondaryMetric, manualAssignments, excludedIndustries, countryFilter, debouncedEvaluate]);

  // Handle map interaction (click/brush/erase)
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

      if (paintMode === 'erase') {
        // Erase mode: always unassign
        delete newAssignments[unitId];
      } else if (paintMode === 'brush') {
        // Brush mode: always assign to active territory
        newAssignments[unitId] = activeTerritoryId;
      } else {
        // Click mode: toggle
        if (newAssignments[unitId] === activeTerritoryId) {
          delete newAssignments[unitId];
        } else {
          newAssignments[unitId] = activeTerritoryId;
        }
      }

      return newAssignments;
    });

    // Switch to manual scenario when editing
    setActiveScenarioId('manual');
  }, [activeTerritoryId, selectionMode, paintMode]);

  // Handle drag/hover for brush/erase modes
  const handleUnitHover = useCallback((unitId: string, isMouseDown: boolean) => {
    if (!isMouseDown || !activeTerritoryId || selectionMode === 'seed') return;
    if (paintMode !== 'brush' && paintMode !== 'erase') return;

    setManualAssignments(prev => {
      const newAssignments = { ...prev };

      if (paintMode === 'erase') {
        delete newAssignments[unitId];
      } else if (paintMode === 'brush') {
        newAssignments[unitId] = activeTerritoryId;
      }

      return newAssignments;
    });

    // Switch to manual scenario when editing
    setActiveScenarioId('manual');
  }, [activeTerritoryId, selectionMode, paintMode]);

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

  const handleExportCsv = useCallback(async () => {
    if (!config) return;

    try {
      setIsLoading(true);
      setError(null);

      const scenarioId = activeScenario?.id || activeScenarioId;
      const scenarioLabel = activeScenario?.label || scenarioId;
      const assignments = activeScenario?.assignments || manualAssignments;

      const blob = await api.exportCsv({
        granularity,
        primary_metric: primaryMetric,
        secondary_metric: secondaryMetric,
        assignments,
        scenario_id: scenarioId,
        scenario_label: scenarioLabel,
        excluded_industries: excludedIndustries,
        country_filter: countryFilter,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `territory_export_${scenarioId}_${granularity}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsLoading(false);
    }
  }, [
    config,
    activeScenario,
    activeScenarioId,
    countryFilter,
    manualAssignments,
    excludedIndustries,
    granularity,
    primaryMetric,
    secondaryMetric,
  ]);

  // Use scenario as manual
  const handleUseAsManual = useCallback((scenarioId: ScenarioId) => {
    const scenario = scenarios[scenarioId];
    if (!scenario) return;

    setManualAssignments(scenario.assignments);
    setActiveScenarioId('manual');
  }, [scenarios]);

  // Get current assignments for map
  const currentAssignments = useMemo(() => {
    // State mode: assignments already use state/province codes.
    if (granularity !== 'zip') return activeScenario?.assignments || manualAssignments;

    // ZIP mode: backend scenarios are ZIP->territory. The map uses state/province polygons,
    // so derive a state->territory mapping by picking the dominant territory per state.
    const source = activeScenario?.assignments || {};
    const derived = deriveStateAssignmentsFromZips(source, zipToState);

    // Manual painting is state-based, so fall back to that if we don’t have derived.
    return Object.keys(derived).length > 0 ? derived : manualAssignments;
  }, [activeScenario, manualAssignments, granularity, zipToState]);

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
          {/* Paint Mode Controls */}
          <div className="absolute top-4 left-4 z-[1000] bg-surface-800/95 backdrop-blur-sm rounded-lg p-2 flex gap-1 shadow-lg border border-surface-600">
            <button
              onClick={() => setPaintMode('click')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                paintMode === 'click'
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
              }`}
              title="Click to toggle assignment"
            >
              👆 Click
            </button>
            <button
              onClick={() => setPaintMode('brush')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                paintMode === 'brush'
                  ? 'bg-green-600 text-white'
                  : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
              }`}
              title="Drag to paint territory"
            >
              🖌️ Brush
            </button>
            <button
              onClick={() => setPaintMode('erase')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-all ${
                paintMode === 'erase'
                  ? 'bg-red-600 text-white'
                  : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
              }`}
              title="Drag to erase assignments"
            >
              🧹 Erase
            </button>
          </div>

          <MapView
            granularity={granularity}
            assignments={currentAssignments}
            seeds={seedsForMap}
            activeTerritoryId={activeTerritoryId}
            onUnitClick={handleUnitClick}
            onUnitHover={handleUnitHover}
            countryFilter={countryFilter}
            paintMode={paintMode}
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
              onExportCsv={handleExportCsv}
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
            metricDisplayNames={config.metric_display_names || {}}
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
      />
    </div>
  );
}

export default App;
