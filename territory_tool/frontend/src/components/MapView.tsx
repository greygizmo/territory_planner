import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import type { GeoJsonObject, Feature, Geometry, FeatureCollection } from 'geojson';
import type { Layer, PathOptions } from 'leaflet';
import { feature as topojsonFeature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { getTerritoryColor } from '../types';
import type { CountryFilter } from './ControlPanel';
import type { PaintMode } from '../App';

interface MapViewProps {
  granularity: string;
  assignments: Record<string, string>;
  seeds?: Record<string, string>; // unit_id -> territory_id
  activeTerritoryId: string | null;
  onUnitClick: (unitId: string) => void;
  onUnitHover?: (unitId: string, isMouseDown: boolean) => void;
  countryFilter: CountryFilter;
  paintMode?: PaintMode;
  isSeedMode?: boolean;
}

// Component to fit bounds when data changes
function FitBounds({ geoJson, countryFilter }: { geoJson: GeoJsonObject | null; countryFilter: CountryFilter }) {
  const map = useMap();

  useEffect(() => {
    if (geoJson) {
      // Adjust bounds based on country filter
      if (countryFilter === 'us') {
        // Continental US bounds (with Alaska inset would be shown)
        map.fitBounds([
          [24.396308, -125.0],  // SW corner
          [49.5, -66.0]         // NE corner
        ]);
      } else if (countryFilter === 'ca') {
        // Canada bounds
        map.fitBounds([
          [42.0, -141.0],  // SW corner
          [75.0, -52.0]    // NE corner
        ]);
      } else {
        // North America bounds (US + Canada)
        map.fitBounds([
          [24.396308, -140.0],  // SW corner (includes Alaska)
          [72.0, -52.0]         // NE corner (includes Canadian territories)
        ]);
      }
    }
  }, [map, geoJson, countryFilter]);

  return null;
}

// FIPS codes to US state abbreviations
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR', '78': 'VI', '66': 'GU', '60': 'AS', '69': 'MP',
};

// US state names
const US_STATE_NAMES: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
  'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
  'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
  'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
  'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
  'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico',
  'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
  'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
  'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
  'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
  'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
  'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam',
};

// Canadian province/territory codes and names
const CANADA_PROVINCE_NAMES: Record<string, string> = {
  'AB': 'Alberta',
  'BC': 'British Columbia',
  'MB': 'Manitoba',
  'NB': 'New Brunswick',
  'NL': 'Newfoundland and Labrador',
  'NS': 'Nova Scotia',
  'NT': 'Northwest Territories',
  'NU': 'Nunavut',
  'ON': 'Ontario',
  'PE': 'Prince Edward Island',
  'QC': 'Quebec',
  'SK': 'Saskatchewan',
  'YT': 'Yukon',
};

// Mapping from Natural Earth province names to codes (for Canada)
const PROVINCE_NAME_TO_CODE: Record<string, string> = {
  'Alberta': 'AB',
  'British Columbia': 'BC',
  'Manitoba': 'MB',
  'New Brunswick': 'NB',
  'Newfoundland and Labrador': 'NL',
  'Nova Scotia': 'NS',
  'Northwest Territories': 'NT',
  'Nunavut': 'NU',
  'Ontario': 'ON',
  'Prince Edward Island': 'PE',
  'Quebec': 'QC',
  'Québec': 'QC',
  'Saskatchewan': 'SK',
  'Yukon': 'YT',
  'Yukon Territory': 'YT',
};

export default function MapView({
  granularity,
  assignments,
  seeds,
  activeTerritoryId,
  onUnitClick,
  onUnitHover,
  countryFilter,
  paintMode = 'click',
  isSeedMode = false,
}: MapViewProps) {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const [loading, setLoading] = useState(true);

  // Track mouse state for paint mode
  const isMouseDownRef = useRef(false);

  // Handle global mouse up/down tracking
  const handleGlobalMouseDown = useCallback(() => {
    isMouseDownRef.current = true;
  }, []);

  const handleGlobalMouseUp = useCallback(() => {
    isMouseDownRef.current = false;
  }, []);

  useEffect(() => {
    // Add global mouse event listeners for paint mode
    document.addEventListener('mousedown', handleGlobalMouseDown);
    document.addEventListener('mouseup', handleGlobalMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [handleGlobalMouseDown, handleGlobalMouseUp]);

  // Filter geoData based on country filter
  const filteredGeoData = useMemo(() => {
    if (!geoData) return null;
    if (countryFilter === 'all') return geoData;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const features = (geoData as any).features || [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = features.filter((f: any) => {
      const country = f.properties?.country || 'US';
      if (countryFilter === 'us') return country === 'US';
      if (countryFilter === 'ca') return country === 'CA';
      return true;
    });

    return {
      type: 'FeatureCollection',
      features: filtered,
    } as GeoJsonObject;
  }, [geoData, countryFilter]);

  // Load GeoJSON data from CDN
  useEffect(() => {
    setLoading(true);

    const fetchGeoData = async () => {
      try {
        // Load US states from us-atlas
        const usUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

        // Load Canada provinces from Natural Earth via unpkg
        // Using the 110m resolution for faster loading
        const canadaUrl = 'https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/canada.geojson';

        const [usResponse, canadaResponse] = await Promise.all([
          fetch(usUrl),
          fetch(canadaUrl)
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const features: any[] = [];

        // Process US data
        if (usResponse.ok) {
          const usTopoJson = await usResponse.json() as Topology<{ states: GeometryCollection }>;
          const usGeoJson = topojsonFeature(usTopoJson, usTopoJson.objects.states);

          // Enrich US features with STUSPS and NAME
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (usGeoJson as any).features.forEach((f: any) => {
            const fips = String(f.id).padStart(2, '0');
            const stusps = FIPS_TO_STATE[fips] || '';
            if (stusps) {
              features.push({
                ...f,
                properties: {
                  ...f.properties,
                  STUSPS: stusps,
                  NAME: US_STATE_NAMES[stusps] || `State ${fips}`,
                  country: 'US',
                }
              });
            }
          });
        }

        // Process Canada data
        if (canadaResponse.ok) {
          const canadaGeoJson = await canadaResponse.json() as FeatureCollection;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          canadaGeoJson.features.forEach((f: any) => {
            // Try to get the province code from various possible property names
            const name = f.properties?.name ||
              f.properties?.NAME ||
              f.properties?.PRENAME ||
              f.properties?.PRNAME ||
              '';

            const code = PROVINCE_NAME_TO_CODE[name] ||
              f.properties?.postal ||
              f.properties?.PRUID ||
              f.properties?.code ||
              '';

            if (code && CANADA_PROVINCE_NAMES[code]) {
              features.push({
                ...f,
                properties: {
                  ...f.properties,
                  STUSPS: code,
                  NAME: CANADA_PROVINCE_NAMES[code] || name,
                  country: 'CA',
                }
              });
            }
          });
        }

        // If we couldn't load Canada from the primary source, try backup
        if (!canadaResponse.ok) {
          console.warn('Failed to load Canada GeoJSON, using embedded fallback');
          CANADA_PROVINCES_GEOJSON.features.forEach(f => {
            features.push(f);
          });
        }

        const combinedGeoJson: FeatureCollection = {
          type: 'FeatureCollection',
          features: features,
        };

        console.log(`Loaded ${features.length} regions (US states + Canada provinces)`);
        setGeoData(combinedGeoJson as GeoJsonObject);
      } catch (error) {
        console.error('Error loading map data:', error);
        // Fallback to embedded data for both US and Canada
        const fallbackFeatures = [
          ...US_STATES_GEOJSON.features,
          ...CANADA_PROVINCES_GEOJSON.features,
        ];
        setGeoData({
          type: 'FeatureCollection',
          features: fallbackFeatures,
        } as GeoJsonObject);
      } finally {
        setLoading(false);
      }
    };

    fetchGeoData();
  }, [granularity]);

  // Style function for GeoJSON features
  const style = useMemo(() => {
    return (feature: Feature<Geometry> | undefined): PathOptions => {
      if (!feature?.properties) return {};

      // Get unit ID from feature properties
      const unitId = feature.properties.STUSPS ||
        feature.properties.postal ||
        feature.properties.name ||
        '';

      const territoryId = assignments[unitId];
      const isSeed = seeds && seeds[unitId] === territoryId;
      const color = getTerritoryColor(territoryId);
      const isActive = territoryId === activeTerritoryId;

      // Unassigned states/provinces have no fill, only a subtle border
      const isUnassigned = !territoryId;

      return {
        fillColor: isUnassigned ? 'transparent' : color,
        fillOpacity: isUnassigned ? 0 : (isSeed ? 0.9 : (isActive ? 0.7 : 0.5)),
        color: isUnassigned ? '#4B5563' : (isSeed ? '#fff' : (isActive ? '#fff' : '#374151')),
        weight: isSeed ? 3 : (isActive ? 2 : 1),
        dashArray: isSeed ? '5, 5' : undefined,
        opacity: isUnassigned ? 0.5 : 1,
      };
    };
  }, [assignments, activeTerritoryId, seeds]);

  // Event handlers for each feature
  const onEachFeature = useMemo(() => {
    return (feature: Feature<Geometry>, layer: Layer) => {
      const unitId = feature.properties?.STUSPS ||
        feature.properties?.postal ||
        feature.properties?.name ||
        '';
      const name = feature.properties?.NAME ||
        feature.properties?.name ||
        unitId;
      const territoryId = assignments[unitId];
      const country = feature.properties?.country || 'US';
      const countryLabel = country === 'CA' ? '🇨🇦 Canada' : '🇺🇸 USA';

      // Tooltip
      layer.bindTooltip(
        `<div class="font-sans">
          <div class="font-bold">${name}</div>
          <div class="text-sm opacity-75">${unitId} • ${countryLabel}</div>
          ${territoryId ? `<div class="text-sm mt-1">Territory: ${territoryId}</div>` : '<div class="text-sm mt-1 opacity-50">Unassigned</div>'}
        </div>`,
        { sticky: true }
      );

      // Event handlers
      layer.on({
        click: () => {
          onUnitClick(unitId);
        },
        mouseover: (e) => {
          const target = e.target;
          target.setStyle({
            weight: 3,
            color: '#fff',
          });
          target.bringToFront();

          // For brush/erase modes, trigger on hover while mouse is down
          if ((paintMode === 'brush' || paintMode === 'erase') && onUnitHover) {
            onUnitHover(unitId, isMouseDownRef.current);
          }
        },
        mouseout: (e) => {
          const target = e.target;
          const tid = assignments[unitId];
          const isActive = tid === activeTerritoryId;
          target.setStyle({
            weight: isActive ? 2 : 1,
            color: isActive ? '#fff' : '#374151',
          });
        },
      });
    };
  }, [assignments, activeTerritoryId, onUnitClick, onUnitHover, paintMode]);

  // Generate unique key for GeoJSON to force re-render
  const geoJsonKey = useMemo(() => {
    return `${granularity}-${countryFilter}-${Object.keys(assignments).length}-${activeTerritoryId}-${isSeedMode}-${Date.now()}`;
  }, [granularity, countryFilter, assignments, activeTerritoryId, isSeedMode]);

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-surface-800">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-surface-400">Loading map data...</p>
        </div>
      </div>
    );
  }

  return (
    <MapContainer
      center={[45.0, -100.0]}
      zoom={3}
      className="w-full h-full"
      scrollWheelZoom={true}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {filteredGeoData && (
        <>
          <GeoJSON
            key={geoJsonKey}
            data={filteredGeoData}
            style={style}
            onEachFeature={onEachFeature}
          />
          <FitBounds geoJson={filteredGeoData} countryFilter={countryFilter} />
        </>
      )}
    </MapContainer>
  );
}

// ============================================================================
// Embedded Fallback GeoJSON Data
// ============================================================================

// Simplified US states GeoJSON (fallback)
const US_STATES_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { STUSPS: "AL", NAME: "Alabama", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-88.47, 30.22], [-85.0, 30.99], [-85.0, 35.0], [-88.2, 35.0], [-88.47, 30.22]]] } },
    { type: "Feature", properties: { STUSPS: "AK", NAME: "Alaska", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-179.15, 51.21], [-129.98, 51.21], [-129.98, 71.35], [-179.15, 71.35], [-179.15, 51.21]]] } },
    { type: "Feature", properties: { STUSPS: "AZ", NAME: "Arizona", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-114.82, 31.33], [-109.04, 31.33], [-109.04, 37.0], [-114.82, 37.0], [-114.82, 31.33]]] } },
    { type: "Feature", properties: { STUSPS: "AR", NAME: "Arkansas", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-94.62, 33.0], [-89.65, 33.0], [-89.65, 36.5], [-94.62, 36.5], [-94.62, 33.0]]] } },
    { type: "Feature", properties: { STUSPS: "CA", NAME: "California", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-124.41, 32.53], [-114.13, 32.53], [-114.13, 42.0], [-124.41, 42.0], [-124.41, 32.53]]] } },
    { type: "Feature", properties: { STUSPS: "CO", NAME: "Colorado", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-109.04, 37.0], [-102.04, 37.0], [-102.04, 41.0], [-109.04, 41.0], [-109.04, 37.0]]] } },
    { type: "Feature", properties: { STUSPS: "CT", NAME: "Connecticut", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-73.73, 40.98], [-71.79, 40.98], [-71.79, 42.05], [-73.73, 42.05], [-73.73, 40.98]]] } },
    { type: "Feature", properties: { STUSPS: "DE", NAME: "Delaware", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-75.79, 38.45], [-75.05, 38.45], [-75.05, 39.84], [-75.79, 39.84], [-75.79, 38.45]]] } },
    { type: "Feature", properties: { STUSPS: "FL", NAME: "Florida", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-87.63, 24.52], [-80.03, 24.52], [-80.03, 31.0], [-87.63, 31.0], [-87.63, 24.52]]] } },
    { type: "Feature", properties: { STUSPS: "GA", NAME: "Georgia", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-85.61, 30.36], [-80.84, 30.36], [-80.84, 35.0], [-85.61, 35.0], [-85.61, 30.36]]] } },
    { type: "Feature", properties: { STUSPS: "HI", NAME: "Hawaii", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-160.24, 18.91], [-154.81, 18.91], [-154.81, 22.23], [-160.24, 22.23], [-160.24, 18.91]]] } },
    { type: "Feature", properties: { STUSPS: "ID", NAME: "Idaho", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-117.24, 42.0], [-111.04, 42.0], [-111.04, 49.0], [-117.24, 49.0], [-117.24, 42.0]]] } },
    { type: "Feature", properties: { STUSPS: "IL", NAME: "Illinois", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-91.51, 36.97], [-87.5, 36.97], [-87.5, 42.5], [-91.51, 42.5], [-91.51, 36.97]]] } },
    { type: "Feature", properties: { STUSPS: "IN", NAME: "Indiana", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-88.1, 37.77], [-84.78, 37.77], [-84.78, 41.76], [-88.1, 41.76], [-88.1, 37.77]]] } },
    { type: "Feature", properties: { STUSPS: "IA", NAME: "Iowa", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-96.64, 40.37], [-90.14, 40.37], [-90.14, 43.5], [-96.64, 43.5], [-96.64, 40.37]]] } },
    { type: "Feature", properties: { STUSPS: "KS", NAME: "Kansas", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-102.05, 36.99], [-94.59, 36.99], [-94.59, 40.0], [-102.05, 40.0], [-102.05, 36.99]]] } },
    { type: "Feature", properties: { STUSPS: "KY", NAME: "Kentucky", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-89.57, 36.5], [-81.97, 36.5], [-81.97, 39.15], [-89.57, 39.15], [-89.57, 36.5]]] } },
    { type: "Feature", properties: { STUSPS: "LA", NAME: "Louisiana", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-94.04, 28.93], [-88.82, 28.93], [-88.82, 33.02], [-94.04, 33.02], [-94.04, 28.93]]] } },
    { type: "Feature", properties: { STUSPS: "ME", NAME: "Maine", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-71.08, 43.06], [-66.95, 43.06], [-66.95, 47.46], [-71.08, 47.46], [-71.08, 43.06]]] } },
    { type: "Feature", properties: { STUSPS: "MD", NAME: "Maryland", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-79.49, 37.91], [-75.05, 37.91], [-75.05, 39.72], [-79.49, 39.72], [-79.49, 37.91]]] } },
    { type: "Feature", properties: { STUSPS: "MA", NAME: "Massachusetts", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-73.51, 41.24], [-69.93, 41.24], [-69.93, 42.89], [-73.51, 42.89], [-73.51, 41.24]]] } },
    { type: "Feature", properties: { STUSPS: "MI", NAME: "Michigan", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-90.42, 41.7], [-82.41, 41.7], [-82.41, 48.19], [-90.42, 48.19], [-90.42, 41.7]]] } },
    { type: "Feature", properties: { STUSPS: "MN", NAME: "Minnesota", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-97.24, 43.5], [-89.49, 43.5], [-89.49, 49.38], [-97.24, 49.38], [-97.24, 43.5]]] } },
    { type: "Feature", properties: { STUSPS: "MS", NAME: "Mississippi", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-91.66, 30.17], [-88.1, 30.17], [-88.1, 35.0], [-91.66, 35.0], [-91.66, 30.17]]] } },
    { type: "Feature", properties: { STUSPS: "MO", NAME: "Missouri", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-95.77, 35.99], [-89.1, 35.99], [-89.1, 40.61], [-95.77, 40.61], [-95.77, 35.99]]] } },
    { type: "Feature", properties: { STUSPS: "MT", NAME: "Montana", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-116.05, 44.36], [-104.04, 44.36], [-104.04, 49.0], [-116.05, 49.0], [-116.05, 44.36]]] } },
    { type: "Feature", properties: { STUSPS: "NE", NAME: "Nebraska", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-104.05, 40.0], [-95.31, 40.0], [-95.31, 43.0], [-104.05, 43.0], [-104.05, 40.0]]] } },
    { type: "Feature", properties: { STUSPS: "NV", NAME: "Nevada", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-120.0, 35.0], [-114.04, 35.0], [-114.04, 42.0], [-120.0, 42.0], [-120.0, 35.0]]] } },
    { type: "Feature", properties: { STUSPS: "NH", NAME: "New Hampshire", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-72.56, 42.7], [-70.7, 42.7], [-70.7, 45.31], [-72.56, 45.31], [-72.56, 42.7]]] } },
    { type: "Feature", properties: { STUSPS: "NJ", NAME: "New Jersey", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-75.56, 38.93], [-73.89, 38.93], [-73.89, 41.36], [-75.56, 41.36], [-75.56, 38.93]]] } },
    { type: "Feature", properties: { STUSPS: "NM", NAME: "New Mexico", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-109.05, 31.33], [-103.0, 31.33], [-103.0, 37.0], [-109.05, 37.0], [-109.05, 31.33]]] } },
    { type: "Feature", properties: { STUSPS: "NY", NAME: "New York", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-79.76, 40.5], [-71.86, 40.5], [-71.86, 45.01], [-79.76, 45.01], [-79.76, 40.5]]] } },
    { type: "Feature", properties: { STUSPS: "NC", NAME: "North Carolina", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-84.32, 33.84], [-75.46, 33.84], [-75.46, 36.59], [-84.32, 36.59], [-84.32, 33.84]]] } },
    { type: "Feature", properties: { STUSPS: "ND", NAME: "North Dakota", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-104.05, 45.94], [-96.55, 45.94], [-96.55, 49.0], [-104.05, 49.0], [-104.05, 45.94]]] } },
    { type: "Feature", properties: { STUSPS: "OH", NAME: "Ohio", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-84.82, 38.4], [-80.52, 38.4], [-80.52, 42.0], [-84.82, 42.0], [-84.82, 38.4]]] } },
    { type: "Feature", properties: { STUSPS: "OK", NAME: "Oklahoma", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-103.0, 33.62], [-94.43, 33.62], [-94.43, 37.0], [-103.0, 37.0], [-103.0, 33.62]]] } },
    { type: "Feature", properties: { STUSPS: "OR", NAME: "Oregon", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-124.57, 41.99], [-116.46, 41.99], [-116.46, 46.29], [-124.57, 46.29], [-124.57, 41.99]]] } },
    { type: "Feature", properties: { STUSPS: "PA", NAME: "Pennsylvania", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-80.52, 39.72], [-74.69, 39.72], [-74.69, 42.27], [-80.52, 42.27], [-80.52, 39.72]]] } },
    { type: "Feature", properties: { STUSPS: "RI", NAME: "Rhode Island", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-71.86, 41.15], [-71.12, 41.15], [-71.12, 42.02], [-71.86, 42.02], [-71.86, 41.15]]] } },
    { type: "Feature", properties: { STUSPS: "SC", NAME: "South Carolina", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-83.35, 32.03], [-78.54, 32.03], [-78.54, 35.21], [-83.35, 35.21], [-83.35, 32.03]]] } },
    { type: "Feature", properties: { STUSPS: "SD", NAME: "South Dakota", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-104.06, 42.48], [-96.44, 42.48], [-96.44, 45.94], [-104.06, 45.94], [-104.06, 42.48]]] } },
    { type: "Feature", properties: { STUSPS: "TN", NAME: "Tennessee", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-90.31, 34.98], [-81.65, 34.98], [-81.65, 36.68], [-90.31, 36.68], [-90.31, 34.98]]] } },
    { type: "Feature", properties: { STUSPS: "TX", NAME: "Texas", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-106.65, 25.84], [-93.51, 25.84], [-93.51, 36.5], [-106.65, 36.5], [-106.65, 25.84]]] } },
    { type: "Feature", properties: { STUSPS: "UT", NAME: "Utah", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-114.05, 37.0], [-109.04, 37.0], [-109.04, 42.0], [-114.05, 42.0], [-114.05, 37.0]]] } },
    { type: "Feature", properties: { STUSPS: "VT", NAME: "Vermont", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-73.44, 42.73], [-71.46, 42.73], [-71.46, 45.02], [-73.44, 45.02], [-73.44, 42.73]]] } },
    { type: "Feature", properties: { STUSPS: "VA", NAME: "Virginia", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-83.68, 36.54], [-75.24, 36.54], [-75.24, 39.47], [-83.68, 39.47], [-83.68, 36.54]]] } },
    { type: "Feature", properties: { STUSPS: "WA", NAME: "Washington", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-124.73, 45.54], [-116.92, 45.54], [-116.92, 49.0], [-124.73, 49.0], [-124.73, 45.54]]] } },
    { type: "Feature", properties: { STUSPS: "WV", NAME: "West Virginia", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-82.64, 37.2], [-77.72, 37.2], [-77.72, 40.64], [-82.64, 40.64], [-82.64, 37.2]]] } },
    { type: "Feature", properties: { STUSPS: "WI", NAME: "Wisconsin", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-92.89, 42.49], [-86.25, 42.49], [-86.25, 47.08], [-92.89, 47.08], [-92.89, 42.49]]] } },
    { type: "Feature", properties: { STUSPS: "WY", NAME: "Wyoming", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-111.05, 41.0], [-104.05, 41.0], [-104.05, 45.0], [-111.05, 45.0], [-111.05, 41.0]]] } },
    { type: "Feature", properties: { STUSPS: "DC", NAME: "District of Columbia", country: "US" }, geometry: { type: "Polygon", coordinates: [[[-77.12, 38.79], [-76.91, 38.79], [-76.91, 38.99], [-77.12, 38.99], [-77.12, 38.79]]] } },
  ]
};

// Simplified Canadian provinces GeoJSON (fallback)
const CANADA_PROVINCES_GEOJSON = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { STUSPS: "AB", NAME: "Alberta", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-120.0, 49.0], [-110.0, 49.0], [-110.0, 60.0], [-120.0, 60.0], [-120.0, 49.0]]] } },
    { type: "Feature", properties: { STUSPS: "BC", NAME: "British Columbia", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-139.0, 48.3], [-114.0, 49.0], [-120.0, 60.0], [-139.0, 60.0], [-139.0, 48.3]]] } },
    { type: "Feature", properties: { STUSPS: "MB", NAME: "Manitoba", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-102.0, 49.0], [-89.0, 49.0], [-89.0, 60.0], [-102.0, 60.0], [-102.0, 49.0]]] } },
    { type: "Feature", properties: { STUSPS: "NB", NAME: "New Brunswick", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-69.0, 45.0], [-64.0, 45.0], [-64.0, 48.0], [-69.0, 48.0], [-69.0, 45.0]]] } },
    { type: "Feature", properties: { STUSPS: "NL", NAME: "Newfoundland and Labrador", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-67.0, 46.5], [-52.5, 46.5], [-52.5, 60.5], [-67.0, 60.5], [-67.0, 46.5]]] } },
    { type: "Feature", properties: { STUSPS: "NS", NAME: "Nova Scotia", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-66.5, 43.5], [-59.5, 43.5], [-59.5, 47.0], [-66.5, 47.0], [-66.5, 43.5]]] } },
    { type: "Feature", properties: { STUSPS: "NT", NAME: "Northwest Territories", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-136.0, 60.0], [-102.0, 60.0], [-102.0, 78.0], [-136.0, 78.0], [-136.0, 60.0]]] } },
    { type: "Feature", properties: { STUSPS: "NU", NAME: "Nunavut", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-120.0, 60.0], [-61.0, 60.0], [-61.0, 83.0], [-120.0, 83.0], [-120.0, 60.0]]] } },
    { type: "Feature", properties: { STUSPS: "ON", NAME: "Ontario", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-95.0, 42.0], [-74.0, 42.0], [-74.0, 56.5], [-95.0, 56.5], [-95.0, 42.0]]] } },
    { type: "Feature", properties: { STUSPS: "PE", NAME: "Prince Edward Island", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-64.5, 45.9], [-62.0, 45.9], [-62.0, 47.1], [-64.5, 47.1], [-64.5, 45.9]]] } },
    { type: "Feature", properties: { STUSPS: "QC", NAME: "Quebec", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-79.5, 45.0], [-57.0, 45.0], [-57.0, 62.5], [-79.5, 62.5], [-79.5, 45.0]]] } },
    { type: "Feature", properties: { STUSPS: "SK", NAME: "Saskatchewan", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-110.0, 49.0], [-102.0, 49.0], [-102.0, 60.0], [-110.0, 60.0], [-110.0, 49.0]]] } },
    { type: "Feature", properties: { STUSPS: "YT", NAME: "Yukon", country: "CA" }, geometry: { type: "Polygon", coordinates: [[[-141.0, 60.0], [-124.0, 60.0], [-124.0, 70.0], [-141.0, 70.0], [-141.0, 60.0]]] } },
  ]
};
