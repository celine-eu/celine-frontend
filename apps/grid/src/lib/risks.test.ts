import { describe, it, expect } from 'vitest';
import { indexRisks, mergeRisksIntoFeatures, fetchRisksOrError } from './risks';
import type { FeatureCollection, GridRisk } from './api';

const fc = (ids: string[]): FeatureCollection => ({
  type: 'FeatureCollection',
  features: ids.map((id, i) => ({
    type: 'Feature',
    id: i,
    geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    properties: { segment_id: id, asset_type: 'ac_line_segment', asset_key: id },
  })),
});

const risk = (segment_id: string, risk_vector: 'wind' | 'heat', risk_level: 'ALERT' | 'WARNING', metrics: Record<string, unknown>): GridRisk =>
  ({ segment_id, date: '2026-09-11', risk_vector, risk_level, risk_color_hex: '#000', metrics });

describe('indexRisks', () => {
  it('keys risks by segment and vector so wind and heat never collide', () => {
    const byKey = indexRisks([
      risk('s1', 'wind', 'ALERT', { gust_excess: 13 }),
      risk('s1', 'heat', 'WARNING', { temp_max_c: 31 }),
    ]);
    expect(byKey.size).toBe(2);
    expect(byKey.get('s1|wind')?.risk_level).toBe('ALERT');
    expect(byKey.get('s1|heat')?.risk_level).toBe('WARNING');
  });
});

describe('mergeRisksIntoFeatures', () => {
  const risks = indexRisks([
    risk('s1', 'wind', 'ALERT', { gust_excess: 13 }),
    risk('s1', 'heat', 'WARNING', { temp_max_c: 31 }),
    risk('s2', 'heat', 'ALERT', { temp_max_c: 35 }),
  ]);

  it('applies only the requested vector to the features', () => {
    const out = mergeRisksIntoFeatures(fc(['s1', 's2']), risks, 'wind');
    const p1 = out.features[0].properties as Record<string, unknown>;
    const p2 = out.features[1].properties as Record<string, unknown>;
    expect(p1.risk_level).toBe('ALERT');
    expect(p1.gust_excess).toBe(13);
    expect(p1.temp_max_c).toBeUndefined();
    expect(p2.risk_level).toBeUndefined();
  });

  it('does not mutate the base collection', () => {
    const base = fc(['s1']);
    mergeRisksIntoFeatures(base, risks, 'heat');
    expect((base.features[0].properties as Record<string, unknown>).risk_level).toBeUndefined();
  });

  it('returns the base collection untouched when there are no risks', () => {
    const base = fc(['s1']);
    expect(mergeRisksIntoFeatures(base, new Map(), 'wind')).toBe(base);
  });

  it('lands heat metrics (including thermal fields) on a joint feature', () => {
    const jointFc: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [11.1, 46.1] },
        properties: { segment_id: 'j1', asset_type: 'joint', asset_key: 'j1' },
      }],
    };
    const jointRisks = indexRisks([
      risk('j1', 'heat', 'WARNING', {
        asset_type: 'joint',
        thermal_tier: 'high',
        thermal_modelled: true,
        heat_status: 'ORANGE',
        soil7_mean_c: 22.1,
        soil7_p90_c: 21.4832,
      }),
    ]);
    const out = mergeRisksIntoFeatures(jointFc, jointRisks, 'heat');
    const p = out.features[0].properties as Record<string, unknown>;
    expect(p.risk_level).toBe('WARNING');
    expect(p.thermal_tier).toBe('high');
    expect(p.heat_status).toBe('ORANGE');
    expect(p.soil7_mean_c).toBe(22.1);
  });
});

describe('mergeRisksIntoFeatures — shape-owned tree-strike fields', () => {
  it('keeps the tratta-level strike fields of the shape over the fragment values in the risk metrics', () => {
    const base: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        properties: {
          segment_id: 's1', asset_type: 'ac_line_segment', asset_key: 's1',
          strike_tree_tier: 'high', strike_density_per_km: 1832, strike_tree_multiplier: 3.3,
          strike_km_high: 2.3, strike_km_mid: 1.66, strike_km_low: 0.51,
        },
      }],
    };
    const byKey = indexRisks([
      risk('s1', 'wind', 'WARNING', {
        gust_excess: 9, strike_tree_tier: 'low', strike_density_per_km: 0, strike_tree_multiplier: 1,
        escalated_by_tree_strike: false,
      }),
    ]);
    const p = mergeRisksIntoFeatures(base, byKey, 'wind').features[0].properties as Record<string, unknown>;
    expect(p.risk_level).toBe('WARNING');
    expect(p.gust_excess).toBe(9);
    expect(p.escalated_by_tree_strike).toBe(false);
    expect(p.strike_tree_tier).toBe('high');
    expect(p.strike_density_per_km).toBe(1832);
    expect(p.strike_tree_multiplier).toBe(3.3);
    expect(p.strike_km_high).toBe(2.3);
  });
});

describe('fetchRisksOrError', () => {
  it('returns the risks when the request succeeds', async () => {
    const rows = [risk('s1', 'wind', 'ALERT', {})];
    const res = await fetchRisksOrError(async () => rows);
    expect(res).toEqual({ ok: true, risks: rows });
  });

  it('keeps a genuinely empty answer as a valid empty list', async () => {
    const res = await fetchRisksOrError(async () => []);
    expect(res).toEqual({ ok: true, risks: [] });
  });

  it('reports a failure instead of returning an empty list', async () => {
    const res = await fetchRisksOrError(async () => { throw new Error('HTTP 503'); });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toMatch(/risk data/i);
      expect(res.error).toContain('HTTP 503');
    }
  });

  it('handles non-Error rejections', async () => {
    const res = await fetchRisksOrError(() => Promise.reject('boom'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('boom');
  });
});
