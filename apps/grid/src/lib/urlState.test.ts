import { describe, it, expect } from 'vitest';
import { parseFilters, serializeFilters, EMPTY_FILTERS } from './urlState';

describe('parseFilters', () => {
  it('returns empty defaults for an empty query', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual(EMPTY_FILTERS);
  });
  it('reads every filter, repeated params as lists', () => {
    const f = parseFilters(new URLSearchParams(
      'mode=nowcasting&date=2026-09-11&substation=VARENA&secondary=A&secondary=B&line=TENNA&unit=U1&unit=U2&municipality=TESERO&risk=ALERT&vector=heat'
    ));
    expect(f).toEqual({
      mode: 'nowcasting', date: '2026-09-11', vector: 'heat',
      substations: ['VARENA'], secondarySubstations: ['A', 'B'], lines: ['TENNA'],
      units: ['U1', 'U2'], municipalities: ['TESERO'], risk: ['ALERT'],
    });
  });
  it('reads the 8-hour window and drops an invalid one', () => {
    expect(parseFilters(new URLSearchParams('slot=2')).slot).toBe(2);
    expect(parseFilters(new URLSearchParams('slot=7')).slot).toBeUndefined();
    expect(serializeFilters({ ...EMPTY_FILTERS, slot: 0 }).toString()).toBe('slot=0');
  });
  it('falls back to forecast for an unknown mode and to undefined for an unknown vector', () => {
    const f = parseFilters(new URLSearchParams('mode=other&vector=fire'));
    expect(f.mode).toBe('forecast');
    expect(f.vector).toBeUndefined();
  });
});

describe('serializeFilters', () => {
  it('round-trips through parseFilters', () => {
    const f = { ...EMPTY_FILTERS, date: '2026-09-11', vector: 'wind' as const, lines: ['A', 'B'], units: ['U1'] };
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });
  it('omits defaults and empty lists, and appends extras', () => {
    const p = serializeFilters(EMPTY_FILTERS, { lat: '46.1' });
    expect(p.toString()).toBe('lat=46.1');
  });
});
