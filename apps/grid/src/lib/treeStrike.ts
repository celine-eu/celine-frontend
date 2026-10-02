// src/lib/treeStrike.ts
// Pure helpers behind the tree-strike rows of the line popup.
//
// A map line is a tratta: the union of many silver fragments, each with its
// own tree-strike tier. The pipeline gives the tratta the worst tier (that is
// what escalates the wind risk) plus the km per tier, and the spans layer
// draws every span with its own tier. The popup shows both: the tier of the
// span under the cursor (found here) and the tratta breakdown.

import type { GeoFeature } from './api';

export type Px = { x: number; y: number };
export type Project = (lngLat: [number, number]) => Px;

export const STRIKE_TIERS = ['high', 'mid', 'low'] as const;
export type StrikeTier = (typeof STRIKE_TIERS)[number];

/** Squared distance from p to the segment ab, in the units of the inputs. */
function distSqToSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx - p.x;
  const cy = a.y + t * dy - p.y;
  return cx * cx + cy * cy;
}

function lineParts(geometry: GeoJSON.Geometry): number[][][] {
  if (geometry.type === 'LineString') return [geometry.coordinates as number[][]];
  if (geometry.type === 'MultiLineString') return geometry.coordinates as number[][][];
  return [];
}

/**
 * The span whose geometry passes closest to `point` (screen px), or null when
 * none is within `maxPx`. `project` maps [lng, lat] to screen px, so the
 * tolerance is in pixels whatever the zoom. Independent of layer visibility:
 * it reads the loaded span collection, not what MapLibre has rendered.
 */
export function nearestSpan(spans: GeoFeature[], project: Project, point: Px, maxPx: number): GeoFeature | null {
  let best: GeoFeature | null = null;
  let bestD = maxPx * maxPx;
  for (const f of spans) {
    for (const part of lineParts(f.geometry)) {
      for (let i = 1; i < part.length; i++) {
        const a = project(part[i - 1] as [number, number]);
        const b = project(part[i] as [number, number]);
        const d = distSqToSegment(point, a, b);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
    }
  }
  return best;
}

/** Tiers with a positive length on the tratta, worst first. Numerics may arrive as strings over JSON. */
export function strikeKmBreakdown(props: Record<string, unknown>): { tier: StrikeTier; km: number }[] {
  const out: { tier: StrikeTier; km: number }[] = [];
  for (const tier of STRIKE_TIERS) {
    const raw = props[`strike_km_${tier}`];
    const km = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(km) && km > 0) out.push({ tier, km });
  }
  return out;
}
