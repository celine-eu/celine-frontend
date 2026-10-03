// src/lib/risks.ts
// Pure helpers to join risk rows onto shape features, one risk vector at a time.

import type { FeatureCollection, GridRisk } from './api';

export type RiskVector = GridRisk['risk_vector'];

export type RiskIndex = Map<string, GridRisk>;

const key = (segmentId: string, vector: string) => `${segmentId}|${vector}`;

/**
 * Properties that describe the whole tratta and live on the shape. The wind
 * risk metrics carry the same names with the values of the one fragment that
 * escalated the risk; the popup must keep showing the tratta ones.
 */
const SHAPE_OWNED = [
  'strike_tree_tier', 'strike_tree_multiplier', 'strike_density_per_km',
  'strike_km_high', 'strike_km_mid', 'strike_km_low',
] as const;

/** Index risks by `segment_id|risk_vector` so wind and heat rows never overwrite each other. */
export function indexRisks(risks: GridRisk[]): RiskIndex {
  const byKey: RiskIndex = new Map();
  for (const r of risks) byKey.set(key(r.segment_id, r.risk_vector), r);
  return byKey;
}

/**
 * Return a copy of `base` where each feature carries the risk level and metrics
 * of the given vector (if a risk row exists for its segment). Features without a
 * matching risk are returned as-is; the base collection is never mutated.
 */
export function mergeRisksIntoFeatures(base: FeatureCollection, byKey: RiskIndex, vector: RiskVector): FeatureCollection {
  if (!byKey.size) return base;
  return {
    type: 'FeatureCollection',
    features: base.features.map((f) => {
      const segmentId = f.properties.segment_id;
      const r = typeof segmentId === 'string' ? byKey.get(key(segmentId, vector)) : undefined;
      if (!r) return f;
      const shapeOwned: Record<string, unknown> = {};
      for (const k of SHAPE_OWNED) if (k in f.properties) shapeOwned[k] = f.properties[k];
      return {
        ...f,
        properties: {
          ...f.properties,
          risk_level: r.risk_level,
          risk_color_hex: r.risk_color_hex,
          risk_vector: r.risk_vector,
          ...r.metrics,
          ...shapeOwned,
        },
      };
    }),
  };
}

export type RiskFetchResult =
  | { ok: true; risks: GridRisk[] }
  | { ok: false; error: string };

/**
 * Run a risk request and keep a failure distinct from "no risk": a rejected
 * request must never be turned into an empty list, which would paint the whole
 * network as NORMAL.
 */
export async function fetchRisksOrError(fetcher: () => Promise<GridRisk[]>): Promise<RiskFetchResult> {
  try {
    return { ok: true, risks: await fetcher() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Risk data could not be loaded: ${msg}. The network is shown without risk levels.` };
  }
}
