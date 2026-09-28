/**
 * The read-only map of a REC's areas (celine-frontend ADR-0001, celine-community ADR-0003).
 *
 * Pure apart from `fetch`, and free of Svelte, `$lib` and `leaflet` imports, so `tests/`
 * can load it with Node's type stripping, stub `fetch`, and check the route, the shapes
 * the map is given and every code in every locale. The component that draws the map,
 * `components/AreaMap.svelte`, imports `leaflet` lazily on mount.
 *
 * **Nothing here is edited.** The shapes are the primary-substation boundaries the BFF
 * reads from the Digital Twin; the map only draws them. No shape, coordinate or area
 * is logged or kept in the browser: the answer lives in the component's state while
 * the dialog is open.
 */

import type { Tone, Translate } from './memberSend';

/** A GeoJSON geometry, as far as the map draws one: an area boundary is a polygon. */
export interface AreaGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: unknown[];
}

/** One area of `GET …/areas/shapes`. `geometry: null`: the Digital Twin has no shape for the id. */
export interface AreaShape {
  areaKey: string;
  name: string;
  boundaryId: string;
  geometry: AreaGeometry | Record<string, unknown> | null;
}

/** `GET /api/communities/{community_key}/areas/shapes`. Only areas with a boundary are listed. */
export interface AreaShapes {
  communityKey: string;
  areas: AreaShape[];
}

/** What the map draws: one feature per area whose shape is a polygon. */
export interface AreaFeature {
  type: 'Feature';
  properties: { areaKey: string; name: string; boundaryId: string };
  geometry: AreaGeometry;
}

export interface AreaFeatureCollection {
  type: 'FeatureCollection';
  features: AreaFeature[];
}

export interface AreaMapOutcome {
  status: number;
  code: string;
}

export type ShapesRead = { ok: true; shapes: AreaShapes } | { ok: false; outcome: AreaMapOutcome };

/** Every code the shapes read can answer, each with a `members.profile.map.outcome.<code>` key. */
export const MAP_CODES = [
  'community_not_found',
  'registry_unavailable',
  'registry_refused',
  'digital_twin_unavailable',
  'digital_twin_refused',
  'digital_twin_not_configured',
  'forbidden',
  'network_error',
] as const;

/** Codes where reopening the dialog can succeed. */
const RETRYABLE = new Set(['registry_unavailable', 'digital_twin_unavailable', 'network_error']);

/** The tile source and its attribution, as `packages/roi-ui`'s `MapPicker.svelte` has them (ADR-0001). */
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors';

function isPolygon(geometry: unknown): geometry is AreaGeometry {
  const candidate = geometry as { type?: unknown; coordinates?: unknown } | null;
  return (
    !!candidate &&
    (candidate.type === 'Polygon' || candidate.type === 'MultiPolygon') &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.length > 0
  );
}

/**
 * The map's layer from the BFF's answer: one feature per area whose geometry is a
 * polygon, in the answer's order. An area with no shape, or a shape that is not a
 * polygon, is left off the map and listed in `missing` by name.
 */
export function areaFeatures(shapes: AreaShape[]): { collection: AreaFeatureCollection; missing: AreaShape[] } {
  const features: AreaFeature[] = [];
  const missing: AreaShape[] = [];
  for (const shape of shapes) {
    if (isPolygon(shape.geometry)) {
      features.push({
        type: 'Feature',
        properties: {
          areaKey: shape.areaKey,
          name: shape.name?.trim() || shape.areaKey,
          boundaryId: shape.boundaryId,
        },
        geometry: shape.geometry,
      });
    } else {
      missing.push(shape);
    }
  }
  return { collection: { type: 'FeatureCollection', features }, missing };
}

/** The label an area carries on the map: its name, and its primary substation. */
export function featureLabel(properties: AreaFeature['properties'], t: Translate): string {
  return t('members.profile.area_with_substation', {
    values: { name: properties.name, substation: properties.boundaryId },
  });
}

/** The code the BFF sent, or a stand-in when its answer carried none. */
export function mapCodeOf(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  if (status === 403) return 'forbidden';
  return `http_${status}`;
}

/** The sentence the map shows in place of the shapes. The area select keeps working either way. */
export function mapOutcomeMessage(outcome: AreaMapOutcome, t: Translate): { tone: Tone; text: string; retry: boolean } {
  const { code } = outcome;
  if (!(MAP_CODES as readonly string[]).includes(code)) {
    return { tone: 'error', text: t('members.profile.map.outcome.unknown', { values: { code } }), retry: false };
  }
  return { tone: 'error', text: t(`members.profile.map.outcome.${code}`), retry: RETRYABLE.has(code) };
}

/** A `401` leaves the page, as every other request of this dashboard does. */
function signIn(): Promise<never> {
  window.location.href = `/oauth2/sign_in?rd=${encodeURIComponent(window.location.href)}`;
  return new Promise(() => {});
}

/** The REC's area shapes. Refusals and outages resolve, they do not throw. */
export async function getAreaShapes(communityKey: string): Promise<ShapesRead> {
  let response: Response;
  try {
    response = await fetch(`/api/communities/${encodeURIComponent(communityKey)}/areas/shapes`, {
      credentials: 'include',
    });
  } catch {
    return { ok: false, outcome: { status: 0, code: 'network_error' } };
  }
  if (response.status === 401) return signIn();
  const body: unknown = await response.json().catch(() => null);
  if (response.ok && body && Array.isArray((body as AreaShapes).areas)) {
    return { ok: true, shapes: body as AreaShapes };
  }
  return { ok: false, outcome: { status: response.status, code: mapCodeOf(response.status, body) } };
}
