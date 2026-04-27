// src/lib/api.ts
// Grid UI client — fetch helpers against celine-grid BFF.
// All /api/grid/{networkId}/... calls are proxied by celine-grid to the DT.

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
  asset_type: 'ac_line_segment' | 'substation';
  asset_key: string;
  line_name?: string;
  conductor_type?: string;
  parent_substation_name?: string;
  operational_unit?: string;
  municipality?: string;
  feeder_id?: string;
  length_m?: number;
  is_vegetated_zone?: boolean;
  voltage_class?: string;
  label?: string;
  label_id?: string;
  name?: string;
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

export const getRisks = (f: GridFilters) => {
  const params = filtersToParams(f);
  return j<FetchResult<GridRisk>>(gridUrl(f.networkId, '/risks', params))
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

