// src/lib/layerState.ts
// Shape and (de)serialisation of the map layer menu state. Pure — no runes.

export type Basemap = 'auto' | 'satellite';

export interface LayerState {
  /** Geometric elements */
  overheadBare: boolean;
  overheadInsulated: boolean;
  undergroundCable: boolean;
  cabine: boolean;
  joints: boolean;
  /** Risk colouring / overlays */
  windRisk: boolean;
  heatRisk: boolean;
  treeStrike: boolean;
  /** Basemap */
  basemap: Basemap;
}

export const DEFAULT_LAYER_STATE: LayerState = {
  overheadBare: true,
  overheadInsulated: true,
  undergroundCable: true,
  cabine: true,
  joints: true,
  windRisk: true,
  heatRisk: true,
  treeStrike: false,
  basemap: 'auto',
};

const BASEMAPS: readonly Basemap[] = ['auto', 'satellite'];

/** Parse a persisted JSON string; unknown keys are dropped, bad values fall back to defaults. */
export function parseLayerState(raw: string | null | undefined): LayerState {
  const out: LayerState = { ...DEFAULT_LAYER_STATE };
  if (!raw) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!parsed || typeof parsed !== 'object') return out;
  const obj = parsed as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_LAYER_STATE) as (keyof LayerState)[]) {
    const v = obj[k];
    if (k === 'basemap') {
      if (typeof v === 'string' && (BASEMAPS as readonly string[]).includes(v)) out.basemap = v as Basemap;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}
