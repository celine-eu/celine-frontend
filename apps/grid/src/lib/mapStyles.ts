// src/lib/mapStyles.ts
// Basemap styles for the grid map. Pure — no runtime imports.

import type { StyleSpecification } from 'maplibre-gl';
import type { Basemap } from './layerState';

export const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
export const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

/**
 * Esri World Imagery, served as raster tiles without an API key.
 * Attribution is mandatory and rendered by MapLibre's attribution control.
 */
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  // Symbol layers (substation labels) need a glyph endpoint; reuse the CARTO
  // fonts that the light/dark basemaps already load.
  glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
  sources: {
    'esri-world-imagery': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    },
  },
  layers: [{ id: 'esri-world-imagery', type: 'raster', source: 'esri-world-imagery' }],
};

export type StyleKey = 'dark' | 'light' | 'satellite';

export interface ResolvedStyle {
  key: StyleKey;
  style: string | StyleSpecification;
}

export function resolveStyle(basemap: Basemap, isDark: boolean): ResolvedStyle {
  if (basemap === 'satellite') return { key: 'satellite', style: SATELLITE_STYLE };
  return isDark ? { key: 'dark', style: STYLE_DARK } : { key: 'light', style: STYLE_LIGHT };
}

export const isImagery = (key: StyleKey): boolean => key === 'satellite';
