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
// Cabine (secondary substations) — static layer
// ---------------------------------------------------------------------------

export const getCabineMap = (networkId: string) =>
  j<FeatureCollection>(gridUrl(networkId, '/cabine/map'));
