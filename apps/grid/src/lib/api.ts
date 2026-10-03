// src/lib/api.ts
// Grid UI client — fetch helpers against celine-grid BFF.
// All /api/grid/{networkId}/... calls are proxied by celine-grid to the DT.

import { normalizeRiskKmRow, type RiskKmRow, type RiskKmLevel } from './riskTable';
export type { RiskKmRow, RiskKmLevel } from './riskTable';

const DT_BASE = '/api/grid';

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

async function j<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status === 401) {
    window.location.href = '/oauth2/sign_in?rd=' + encodeURIComponent(window.location.href);
    return new Promise(() => {}); // never resolves
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json() as Promise<T>;
}

function gridUrl(networkId: string, path: string, params?: Record<string, string | string[]>): string {
  const url = new URL(`${DT_BASE}/${networkId}${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((val) => url.searchParams.append(k, val));
      else url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Auth / Profile
// ---------------------------------------------------------------------------

export interface Me {
  sub: string;
  email: string;
  name?: string;
  locale?: string;
  preferred_username?: string;
  network_id: string;
  organization: string;
}

interface MeResponse {
  user: Me;
}

export const getMe = () => j<MeResponse>('/api/me').then((r) => r.user);

// ---------------------------------------------------------------------------
// Shared filter params
// ---------------------------------------------------------------------------

export interface GridFilters {
  networkId: string;
  dates?: string[];
  operational_unit?: string[];
  line_name?: string[];
  substation_name?: string[];
  risk_level?: string[];
}

function filtersToParams(f: GridFilters): Record<string, string | string[]> {
  const p: Record<string, string | string[]> = {};
  if (f.dates?.length) p['dates'] = f.dates;
  if (f.operational_unit?.length) p['operational_unit'] = f.operational_unit;
  if (f.line_name?.length) p['line_name'] = f.line_name;
  if (f.substation_name?.length) p['substation_name'] = f.substation_name;
  if (f.risk_level?.length) p['risk_level'] = f.risk_level;
  return p;
}

// ---------------------------------------------------------------------------
// GeoJSON types
// ---------------------------------------------------------------------------

export interface GeoFeature {
  type: 'Feature';
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown>;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

// ---------------------------------------------------------------------------
// Wind endpoints
// ---------------------------------------------------------------------------

export const getWindMap = (f: GridFilters) =>
  j<FeatureCollection>(gridUrl(f.networkId, '/wind/map', filtersToParams(f)));

export const getWindBosco = (f: GridFilters) =>
  j<FeatureCollection>(gridUrl(f.networkId, '/wind/bosco', filtersToParams(f)));

export interface AlertDistributionItem {
  risk_level: string;
  events: number;
}

export const getWindAlertDistribution = (f: GridFilters) =>
  j<AlertDistributionItem[]>(gridUrl(f.networkId, '/wind/alert-distribution', filtersToParams(f)));

export interface TrendItem {
  date: string;
  value: number | null;
}

export const getWindTrend = (networkId: string) =>
  j<TrendItem[]>(gridUrl(networkId, '/wind/trend'));

// ---------------------------------------------------------------------------
// Heat endpoints
// ---------------------------------------------------------------------------

export const getHeatMap = (f: GridFilters) =>
  j<FeatureCollection>(gridUrl(f.networkId, '/heat/map', filtersToParams(f)));

export const getHeatAlertDistribution = (f: GridFilters) =>
  j<AlertDistributionItem[]>(gridUrl(f.networkId, '/heat/alert-distribution', filtersToParams(f)));

export const getHeatTrend = (networkId: string) =>
  j<TrendItem[]>(gridUrl(networkId, '/heat/trend'));

// ---------------------------------------------------------------------------
// Filter metadata — topology dimension values for autocomplete + network extent
// ---------------------------------------------------------------------------

export interface FilterOptions {
  parent_substations: string[];
  lines: string[];
  operational_units: string[];
  municipalities: string[];
  extent_min_lng: number | null;
  extent_min_lat: number | null;
  extent_max_lng: number | null;
  extent_max_lat: number | null;
}

export const getFilters = (networkId: string) =>
  j<FilterOptions>(gridUrl(networkId, '/filters'));

// ---------------------------------------------------------------------------
// Substations (CIM: Substation — secondary substations) — static layer (legacy)
// ---------------------------------------------------------------------------

export const getSubstationsMap = (networkId: string) =>
  j<FeatureCollection>(gridUrl(networkId, '/substations/map'));

// ---------------------------------------------------------------------------
// Tile index (progressive loading)
// ---------------------------------------------------------------------------

export interface TileInfo {
  tile_id: string;
  tile_x: number;
  tile_y: number;
  tile_bbox_geojson: GeoJSON.Polygon;
  segment_count: number;
}

export const getTileIndex = (networkId: string) =>
  j<FetchResult<TileInfo>>(gridUrl(networkId, '/tile-index'))
    .then((r) => r.items);

// ---------------------------------------------------------------------------
// Shapes / Risks / Trendline  (new schema)
// ---------------------------------------------------------------------------

export interface GridShapeProperties {
  segment_id: string;
  asset_type: 'ac_line_segment' | 'substation' | 'joint';
  asset_key: string;
  line_name?: string;
  conductor_type?: string;
  parent_substation_name?: string;
  operational_unit?: string;
  municipality?: string;
  feeder_id?: string;
  length_m?: number;
  is_vegetated_zone?: boolean;
  /** Worst tree-strike tier among the fragments of the tratta (what escalates the wind risk). */
  strike_tree_tier?: 'low' | 'mid' | 'high';
  strike_tree_multiplier?: number;
  /** Length-weighted strike-tree density over the whole tratta (trees/km). */
  strike_density_per_km?: number;
  /** km of fragments per tree-strike tier; together they explain strike_tree_tier. */
  strike_km_high?: number;
  strike_km_mid?: number;
  strike_km_low?: number;
  voltage_class?: string;
  label?: string;
  label_id?: string;
  name?: string;
  /** Thermal properties: cables (when modelled) and joints. */
  thermal_tier?: 'low' | 'mid' | 'high' | 'unmodelled' | null;
  thermal_margin_c?: number | null;
  thermal_theta_max_c?: number | null;
  thermal_insulation?: string | null;
  /** Joint-only properties. */
  is_asphalt?: boolean | null;
  anno_posa?: number | null;
  technology?: string | null;
  m_r_critico?: number | null;
}

export interface GridRisk {
  segment_id: string;
  date: string;
  risk_vector: 'wind' | 'heat';
  risk_level: 'ALERT' | 'WARNING';
  risk_color_hex: string;
  metrics: Record<string, unknown>;
}

export interface TrendlineItem {
  date: string;
  risk_vector: string;
  alert_count: number;
  warning_count: number;
  total_segments: number;
  risk_ratio: number;
  day_risk_level: 'ALERT' | 'WARNING' | 'NORMAL';
}

// FetchResultSchema wrapper returned by the DT values API
interface FetchResult<T> {
  items: T[];
  limit: number;
  offset: number;
  count: number;
}

export const getShapes = (networkId: string, assetType?: string[], tileIds?: string[]) => {
  const params: Record<string, string | string[]> = {};
  if (assetType?.length) params['asset_type'] = assetType;
  if (tileIds?.length) params['tile_id'] = tileIds;
  return j<FeatureCollection>(gridUrl(networkId, '/shapes', params));
};

/** Tree-strike exposure spans (static overlay) for the given tiles — same tile ids as shapes. */
export const getTreeStrikeSpans = (networkId: string, tileIds?: string[]) => {
  const params: Record<string, string | string[]> = {};
  if (tileIds?.length) params['tile_id'] = tileIds;
  return j<FeatureCollection>(gridUrl(networkId, '/tree-strike-spans', params));
};

export interface TreeStrikeSpanProperties {
  span_id: string;
  line_name?: string;
  municipality?: string;
  operational_unit?: string | null;
  parent_substation_name?: string | null;
  feeder_id?: string | null;
  conductor_type?: string;
  tier: 'low' | 'mid' | 'high';
  multiplier?: number;
  strike_density_km?: number;
  n_strike?: number;
  length_m?: number;
}

export const getRisks = (f: GridFilters) => {
  const params = filtersToParams(f);
  return j<FetchResult<GridRisk>>(gridUrl(f.networkId, '/risks', params))
    .then((r) => r.items);
};

/** Intra-day risks: same rows as getRisks plus window_start / slot (0 = 00–08, 1 = 08–16, 2 = 16–24). */
export interface GridRisk8h extends GridRisk {
  window_start: string;
  slot: 0 | 1 | 2;
}

export const getRisks8h = (f: GridFilters & { slots?: number[] }) => {
  const params = filtersToParams(f);
  if (f.slots?.length) params['slot'] = f.slots.map(String);
  return j<FetchResult<GridRisk8h>>(gridUrl(f.networkId, '/risks-8h', params))
    .then((r) => r.items);
};

export const getRisksNow = (networkId: string, riskVector?: string[]) => {
  const params: Record<string, string | string[]> = {};
  if (riskVector?.length) params['risk_vector'] = riskVector;
  return j<FetchResult<GridRisk>>(gridUrl(networkId, '/risks-now', params))
    .then((r) => r.items);
};

export const getTrendline = (
  networkId: string,
  dateFrom: string,
  dateTo: string,
  riskVector?: string[]
) => {
  const params: Record<string, string | string[]> = {
    date_from: dateFrom,
    date_to: dateTo,
  };
  if (riskVector?.length) params['risk_vector'] = riskVector;
  return j<FetchResult<TrendlineItem>>(gridUrl(networkId, '/trendline', params))
    .then((r) => r.items);
};

// ---------------------------------------------------------------------------
// Risk exposure table (km-weighted) — /risk-km
// ---------------------------------------------------------------------------

export interface RiskKmQuery {
  networkId: string;
  dates: string[];
  level?: RiskKmLevel;
  risk_vector?: ('wind' | 'heat')[];
  operational_unit?: string[];
  line_name?: string[];
  substation_name?: string[];
  min_level?: 'WARNING' | 'ALERT';
}

export const getRiskKm = (q: RiskKmQuery) => {
  const params: Record<string, string | string[]> = { dates: q.dates };
  if (q.level) params['level'] = q.level;
  if (q.risk_vector?.length) params['risk_vector'] = q.risk_vector;
  if (q.operational_unit?.length) params['operational_unit'] = q.operational_unit;
  if (q.line_name?.length) params['line_name'] = q.line_name;
  if (q.substation_name?.length) params['substation_name'] = q.substation_name;
  if (q.min_level) params['min_level'] = q.min_level;
  return j<FetchResult<Record<string, unknown>>>(gridUrl(q.networkId, '/risk-km', params))
    .then((r) => r.items.map(normalizeRiskKmRow));
};

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------

export interface AlertRule {
  id: string;
  user_id: string;
  network_id: string;
  risk_types: ('wind' | 'heat')[];
  threshold: 'ALERT' | 'WARNING';
  recipients: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AlertRuleCreate {
  risk_types: ('wind' | 'heat')[];
  threshold: 'ALERT' | 'WARNING';
  recipients?: string | null;
  active?: boolean;
}

export interface AlertRuleUpdate {
  risk_types?: ('wind' | 'heat')[];
  threshold?: 'ALERT' | 'WARNING';
  recipients?: string | null;
  active?: boolean;
}

export const getAlertRules = () =>
  j<AlertRule[]>('/api/alert-rules');

export const createAlertRule = (body: AlertRuleCreate) =>
  j<AlertRule>('/api/alert-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const updateAlertRule = (id: string, body: AlertRuleUpdate) =>
  j<AlertRule>(`/api/alert-rules/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

export const deleteAlertRule = (id: string) =>
  fetch(`/api/alert-rules/${id}`, { method: 'DELETE', credentials: 'include' });

// ---------------------------------------------------------------------------
// Notification settings
// ---------------------------------------------------------------------------

export interface NotificationSettings {
  user_id: string;
  email_recipients: string | null;
  webhook_url: string | null;
  updated_at: string;
}

export interface NotificationSettingsUpdate {
  email_recipients?: string | null;
  webhook_url?: string | null;
}

export const getNotificationSettings = () =>
  j<NotificationSettings>('/api/notification-settings');

export const updateNotificationSettings = (body: NotificationSettingsUpdate) =>
  j<NotificationSettings>('/api/notification-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

