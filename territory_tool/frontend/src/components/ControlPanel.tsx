import { useState } from 'react';

export type CountryFilter = 'all' | 'us' | 'ca';

interface ControlPanelProps {
  k: number;
  setK: (k: number) => void;
  granularity: string;
  setGranularity: (g: string) => void;
  primaryMetric: string;
  setPrimaryMetric: (m: string) => void;
  secondaryMetric: string;
  setSecondaryMetric: (m: string) => void;
  metrics: string[];
  metricDisplayNames: Record<string, string>;
  industries: string[];
  industryCounts: Record<string, number>;
  excludedIndustries: string[];
  setExcludedIndustries: (industries: string[]) => void;
  onOptimize: () => void;
  onExportCsv: () => void;
  isLoading: boolean;
  countryFilter: CountryFilter;
  setCountryFilter: (filter: CountryFilter) => void;
}

// Fallback metric labels (used if server doesn't provide display names)
const FALLBACK_METRIC_LABELS: Record<string, string> = {
  // ICP Scores
  'Combined_ICP_Score': 'Combined ICP Score',
  'Hardware_ICP_Score': 'Hardware ICP',
  'CRE_ICP_Score': 'CRE ICP',
  'CPE_ICP_Score': 'CPE ICP',
  'Weighted_ICP_Value': 'Opportunity (Combined)',
  // GP (Gross Profit) metrics - primary financial indicator
  'GP_12M_Total': 'GP (12 Months)',
  'GP_24M_Total': 'GP (24 Months)',
  'GP_36M_Total': 'GP (36 Months)',
  'GP_T4Q_Total': 'GP (Last 4 Quarters)',
  'GP_Since_2023_Total': 'GP (Since 2023)',
  // Legacy spend metric
  'spend_12m': 'GP (12 Month, legacy)',
  'spend_24m': 'GP (24 Month, legacy)',
  'spend_36m': 'GP (36 Month, legacy)',
  // YoY
  'GP_12M_Prior': 'GP (12m Prior)',
  'GP_12M_Delta': 'GP Δ (12m)',
  'GP_12M_Delta_Pct': 'GP Δ% (12m)',
  // Assets
  'Total_Assets': 'Total Assets',
  'SW_Assets': 'Software Assets',
  'HW_Assets': 'Hardware Assets',
  'CRE_Assets': 'CRE Assets',
  'CPE_Assets': 'CPE Assets',
  'Active_Assets_Total': 'Active Assets',
  'Asset_Count_Total': 'Asset Count',
  // High-touch weighted
  'HighTouchWeighted_HW': 'High Touch (HW)',
  'HighTouchWeighted_CRE': 'High Touch (CRE)',
  'HighTouchWeighted_CPE': 'High Touch (CPE)',
  'HighTouchWeighted_Combined': 'High Touch (Combined)',
  // Opportunity alias
  'Opportunity_Combined': 'Opportunity',
  // Account counts by grade
  'Hardware_AB_Count': 'Hardware A+B Accounts',
  'CRE_AB_Count': 'CRE A+B Accounts',
  'CPE_AB_Count': 'CPE A+B Accounts',
  'Combined_AB_Count': 'All A+B Accounts',
  'Account_Count': 'Total Accounts',
};

export default function ControlPanel({
  k,
  setK,
  granularity,
  setGranularity,
  primaryMetric,
  setPrimaryMetric,
  secondaryMetric,
  setSecondaryMetric,
  metrics,
  metricDisplayNames,
  industries,
  industryCounts,
  excludedIndustries,
  setExcludedIndustries,
  onOptimize,
  onExportCsv,
  isLoading,
  countryFilter,
  setCountryFilter,
}: ControlPanelProps) {
  const [industryFilterOpen, setIndustryFilterOpen] = useState(false);

  const hiddenMetrics = new Set([
    'Open_Cases',
    'Recent_Interactions',
    'High_Touch_Score',
    'GP_T4Q_Total',
    'GP_Since_2023_Total',
    'spend_13w',
    'spend_13w_hw',
    'spend_13w_cre',
    'spend_13w_cpe',
  ]);

  const visibleMetrics = metrics.filter((m) => !hiddenMetrics.has(m));

  // Get display name for a metric
  const getMetricLabel = (metric: string): string => {
    return metricDisplayNames[metric] || FALLBACK_METRIC_LABELS[metric] || metric;
  };

  // Toggle an industry in the exclusion list
  const toggleIndustry = (industry: string) => {
    if (excludedIndustries.includes(industry)) {
      setExcludedIndustries(excludedIndustries.filter((i) => i !== industry));
    } else {
      setExcludedIndustries([...excludedIndustries, industry]);
    }
  };

  // Select/deselect all industries
  const selectAllIndustries = () => {
    setExcludedIndustries([]);
  };

  const excludeAllIndustries = () => {
    setExcludedIndustries([...industries]);
  };

  return (
    <div className="p-4 border-b border-surface-700 space-y-4">
      {/* Country Filter Toggle */}
      <div>
        <label className="label">Region</label>
        <div className="flex rounded-lg bg-surface-700 p-1">
          <button
            onClick={() => setCountryFilter('all')}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1
                       ${countryFilter === 'all' 
                         ? 'bg-surface-600 text-white' 
                         : 'text-surface-400 hover:text-surface-200'}`}
          >
            <span>🌎</span>
            <span>US + CA</span>
          </button>
          <button
            onClick={() => setCountryFilter('us')}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1
                       ${countryFilter === 'us' 
                         ? 'bg-surface-600 text-white' 
                         : 'text-surface-400 hover:text-surface-200'}`}
          >
            <span>🇺🇸</span>
            <span>US Only</span>
          </button>
          <button
            onClick={() => setCountryFilter('ca')}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center gap-1
                       ${countryFilter === 'ca' 
                         ? 'bg-surface-600 text-white' 
                         : 'text-surface-400 hover:text-surface-200'}`}
          >
            <span>🇨🇦</span>
            <span>CA Only</span>
          </button>
        </div>
      </div>

      {/* Number of Territories */}
      <div>
        <label className="label">Number of Territories</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={2}
            max={15}
            value={k}
            onChange={(e) => setK(parseInt(e.target.value))}
            className="flex-1 h-2 bg-surface-700 rounded-lg appearance-none cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:bg-blue-500
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <span className="w-8 text-center font-bold text-lg">{k}</span>
        </div>
      </div>

      {/* Granularity Toggle */}
      <div>
        <label className="label">Granularity</label>
        <div className="flex rounded-lg bg-surface-700 p-1">
          <button
            onClick={() => setGranularity('state')}
            className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-colors
                       ${granularity === 'state' 
                         ? 'bg-surface-600 text-white' 
                         : 'text-surface-400 hover:text-surface-200'}`}
          >
            State
          </button>
          <button
            onClick={() => setGranularity('zip')}
            className={`flex-1 px-3 py-1 rounded-md text-xs font-medium transition-colors
                       ${granularity === 'zip'
                         ? 'bg-surface-600 text-white'
                         : 'text-surface-400 hover:text-surface-200'}`}
            title="ZIP mode uses state map; assignments are expanded to ZIPs server-side"
          >
            ZIP Code
          </button>
        </div>
      </div>

      {/* Metric Selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Primary Metric</label>
          <select
            value={primaryMetric}
            onChange={(e) => setPrimaryMetric(e.target.value)}
            className="select w-full text-sm"
          >
            {visibleMetrics.map((m) => (
              <option key={m} value={m}>
                {getMetricLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Secondary Metric</label>
          <select
            value={secondaryMetric}
            onChange={(e) => setSecondaryMetric(e.target.value)}
            className="select w-full text-sm"
          >
            {visibleMetrics.map((m) => (
              <option key={m} value={m}>
                {getMetricLabel(m)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Industry Filter */}
      <div>
        <button
          onClick={() => setIndustryFilterOpen(!industryFilterOpen)}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <span className="label mb-0">
            Industry Filter
            {excludedIndustries.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
                {excludedIndustries.length} excluded
              </span>
            )}
          </span>
          <svg
            className={`w-4 h-4 text-surface-400 transition-transform ${industryFilterOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {industryFilterOpen && (
          <div className="mt-2 p-3 bg-surface-700 rounded-lg">
            {/* Quick actions */}
            <div className="flex gap-2 mb-3 text-xs">
              <button
                onClick={selectAllIndustries}
                className="px-2 py-1 rounded bg-surface-600 hover:bg-surface-500 text-surface-300 transition-colors"
              >
                Include All
              </button>
              <button
                onClick={excludeAllIndustries}
                className="px-2 py-1 rounded bg-surface-600 hover:bg-surface-500 text-surface-300 transition-colors"
              >
                Exclude All
              </button>
            </div>
            
            {/* Industry checkboxes */}
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {industries.map((industry) => {
                const isExcluded = excludedIndustries.includes(industry);
                const count = industryCounts[industry] || 0;
                return (
                  <label
                    key={industry}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors
                               ${isExcluded 
                                 ? 'bg-surface-600/50 text-surface-400 line-through' 
                                 : 'hover:bg-surface-600 text-surface-200'}`}
                  >
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => toggleIndustry(industry)}
                      className="w-3.5 h-3.5 rounded border-surface-500 bg-surface-600 
                                 checked:bg-blue-500 checked:border-blue-500
                                 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <span className="flex-1 text-xs truncate">{industry}</span>
                    <span className="text-xs text-surface-500">
                      {count.toLocaleString()}
                    </span>
                  </label>
                );
              })}
            </div>
            
            {excludedIndustries.length > 0 && (
              <div className="mt-2 pt-2 border-t border-surface-600 text-xs text-surface-400">
                Excluding {excludedIndustries.length} industries from optimization
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onOptimize}
          disabled={isLoading}
          className="btn btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Optimizing...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Optimize
            </>
          )}
        </button>

        <button
          onClick={onExportCsv}
          disabled={isLoading}
          className="btn btn-secondary whitespace-nowrap"
          title="Export assignments + metrics to CSV"
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
