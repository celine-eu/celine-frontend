import { describe, it, expect } from 'vitest';
import { DEFAULT_LAYER_STATE, parseLayerState } from './layerState';

describe('parseLayerState', () => {
  it('returns defaults for garbage input', () => {
    expect(parseLayerState(null)).toEqual(DEFAULT_LAYER_STATE);
    expect(parseLayerState('nope')).toEqual(DEFAULT_LAYER_STATE);
    expect(parseLayerState('{"x":1}')).toEqual(DEFAULT_LAYER_STATE);
  });
  it('keeps only known keys with the right type', () => {
    const s = parseLayerState(JSON.stringify({ windRisk: false, cabine: 'yes', basemap: 'satellite', extra: 1 }));
    expect(s.windRisk).toBe(false);
    expect(s.cabine).toBe(true);
    expect(s.basemap).toBe('satellite');
    expect('extra' in s).toBe(false);
  });
  it('rejects unknown basemap values', () => {
    expect(parseLayerState(JSON.stringify({ basemap: 'google' })).basemap).toBe('auto');
  });
  it('defaults joints to visible', () => {
    expect(DEFAULT_LAYER_STATE.joints).toBe(true);
  });
  it('keeps a parsed joints value', () => {
    expect(parseLayerState(JSON.stringify({ joints: false })).joints).toBe(false);
  });
});
