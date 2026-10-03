import { describe, it, expect } from 'vitest';
import { nearestSpan, strikeKmBreakdown } from './treeStrike';
import type { GeoFeature } from './api';

const span = (id: string, tier: string, coords: number[][]): GeoFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: coords },
  properties: { span_id: id, tier },
});

// Screen space == lng/lat space: 1 unit = 1 px, so distances are readable.
const identity = (lngLat: [number, number]) => ({ x: lngLat[0], y: lngLat[1] });

describe('nearestSpan', () => {
  const spans = [
    span('a', 'low', [[0, 0], [10, 0]]),
    span('b', 'high', [[0, 5], [10, 5]]),
    span('c', 'mid', [[[0, 20], [10, 20]], [[0, 30], [10, 30]]] as unknown as number[][]),
  ];
  // c is a MultiLineString; declare it as such
  (spans[2].geometry as { type: string }).type = 'MultiLineString';

  it('returns the span closest to the click point', () => {
    expect(nearestSpan(spans, identity, { x: 5, y: 4 }, 10)?.properties.span_id).toBe('b');
    expect(nearestSpan(spans, identity, { x: 5, y: 1 }, 10)?.properties.span_id).toBe('a');
  });

  it('measures distance to the segment, not to its vertices', () => {
    // (5, 6) is 1 px from the middle of b but 5+ px from any vertex
    expect(nearestSpan(spans, identity, { x: 5, y: 6 }, 2)?.properties.span_id).toBe('b');
  });

  it('handles MultiLineString parts', () => {
    expect(nearestSpan(spans, identity, { x: 5, y: 29 }, 3)?.properties.span_id).toBe('c');
  });

  it('returns null when nothing is within the pixel tolerance', () => {
    expect(nearestSpan(spans, identity, { x: 5, y: 100 }, 10)).toBeNull();
    expect(nearestSpan([], identity, { x: 0, y: 0 }, 10)).toBeNull();
  });
});

describe('strikeKmBreakdown', () => {
  it('lists the tiers with a positive length, worst first', () => {
    expect(strikeKmBreakdown({ strike_km_high: 2.3, strike_km_mid: 1.66, strike_km_low: 0.51 }))
      .toEqual([{ tier: 'high', km: 2.3 }, { tier: 'mid', km: 1.66 }, { tier: 'low', km: 0.51 }]);
  });

  it('drops zero, missing and non-numeric tiers (Postgres numerics arrive as strings)', () => {
    expect(strikeKmBreakdown({ strike_km_high: '0', strike_km_mid: '1.2', strike_km_low: undefined }))
      .toEqual([{ tier: 'mid', km: 1.2 }]);
    expect(strikeKmBreakdown({})).toEqual([]);
  });
});
