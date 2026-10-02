// src/lib/stores/layers.svelte.ts
// Rune-based shared state for the map layer menu (elements / risks / basemap).
// Persisted per browser in localStorage; falls back silently when storage is unavailable.

import { DEFAULT_LAYER_STATE, parseLayerState, type LayerState } from '$lib/layerState';

const STORAGE_KEY = 'celine-grid-layers';

export const layers: LayerState = $state({ ...DEFAULT_LAYER_STATE });

export function loadLayers(): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return;
  }
  Object.assign(layers, parseLayerState(raw));
}

export function persistLayers(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...layers }));
  } catch {
    /* storage unavailable (private mode, quota) — keep in-memory state only */
  }
}
