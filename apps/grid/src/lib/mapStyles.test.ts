import { describe, it, expect } from 'vitest';
import { resolveStyle, STYLE_DARK, STYLE_LIGHT, SATELLITE_STYLE } from './mapStyles';

describe('resolveStyle', () => {
  it('follows the theme when basemap is auto', () => {
    expect(resolveStyle('auto', true)).toEqual({ key: 'dark', style: STYLE_DARK });
    expect(resolveStyle('auto', false)).toEqual({ key: 'light', style: STYLE_LIGHT });
  });
  it('ignores the theme when satellite is selected', () => {
    expect(resolveStyle('satellite', true).key).toBe('satellite');
    expect(resolveStyle('satellite', false).style).toBe(SATELLITE_STYLE);
  });
});

describe('SATELLITE_STYLE', () => {
  it('is a raster style with attribution and a single imagery layer', () => {
    const src = Object.values(SATELLITE_STYLE.sources)[0] as { type: string; attribution?: string; tiles?: string[] };
    expect(src.type).toBe('raster');
    expect(src.attribution).toMatch(/Esri/);
    expect(src.tiles?.[0]).toMatch(/^https:\/\//);
    expect(SATELLITE_STYLE.layers).toHaveLength(1);
    expect(SATELLITE_STYLE.glyphs).toMatch(/\{fontstack\}.*\{range\}/);
    expect(SATELLITE_STYLE.layers[0].type).toBe('raster');
  });
});
