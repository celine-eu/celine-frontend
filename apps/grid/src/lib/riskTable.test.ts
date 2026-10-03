import { describe, it, expect } from 'vitest';
import { sortRows, pct, fmtKm, fmtIndex, toCsv, riskKmCsvColumns, worstLevelOf, type RiskKmRow } from './riskTable';

const row = (over: Partial<RiskKmRow>): RiskKmRow => ({
  date: '2026-09-11', risk_vector: 'wind', level: 'line', line_name: 'X',
  km_total: 10, km_alert: 2, km_warning: 4, km_normal: 4, km_escalated: 0,
  km_tree_high: 1, km_tree_mid: 0, km_thermal_high: 0, km_thermal_mid: 0,
  metric_max: 9, worst_level: 'WARNING', risk_index: 40,
  ...over,
});

describe('sortRows', () => {
  const rows = [row({ line_name: 'B', risk_index: 10 }), row({ line_name: 'A', risk_index: null }), row({ line_name: 'C', risk_index: 30 })];
  it('sorts numbers descending with nulls last', () => {
    expect(sortRows(rows, 'risk_index', 'desc').map((r) => r.line_name)).toEqual(['C', 'B', 'A']);
  });
  it('sorts strings ascending, case-insensitive, and does not mutate', () => {
    const out = sortRows(rows, 'line_name', 'asc');
    expect(out.map((r) => r.line_name)).toEqual(['A', 'B', 'C']);
    expect(rows[0].line_name).toBe('B');
  });
});

describe('formatting', () => {
  it('pct divides safely', () => {
    expect(pct(2, 10)).toBe(20);
    expect(pct(2, 0)).toBeNull();
  });
  it('fmtKm uses one decimal', () => {
    expect(fmtKm(12.345)).toBe('12.3');
    expect(fmtKm(null)).toBe('—');
  });
  it('fmtIndex is an integer-ish score', () => {
    expect(fmtIndex(34.66)).toBe('34.7');
    expect(fmtIndex(null)).toBe('—');
  });
});

describe('toCsv', () => {
  it('quotes fields with separators or quotes and uses the given headers', () => {
    const cols = [{ key: 'line_name', header: 'nome_linea' }, { key: 'km_alert', header: 'km_allerta' }] as const;
    const csv = toCsv([row({ line_name: 'A "B", C' })], cols);
    expect(csv.split('\n')).toEqual(['nome_linea,km_allerta', '"A ""B"", C",2']);
  });
  it('ships an Italian column set per level', () => {
    expect(riskKmCsvColumns('unit').map((c) => c.header)).toContain('nucleo_operativo');
    expect(riskKmCsvColumns('line').map((c) => c.header)).toContain('nome_linea');
    expect(riskKmCsvColumns('tratta').map((c) => c.header)).toContain('comune');
  });
  it('includes the thermal km columns at every level', () => {
    for (const level of ['unit', 'line', 'tratta'] as const) {
      const keys = riskKmCsvColumns(level).map((c) => c.key);
      expect(keys).toContain('km_thermal_high');
      expect(keys).toContain('km_thermal_mid');
    }
  });
});

describe('worstLevelOf', () => {
  it('takes the worst across rows', () => {
    expect(worstLevelOf([row({ worst_level: 'NORMAL' }), row({ worst_level: 'ALERT' })])).toBe('ALERT');
    expect(worstLevelOf([])).toBe('NORMAL');
  });
});

describe('aggregateRows', () => {
  const t = (over: Partial<RiskKmRow>) => row({ level: 'tratta', ...over });
  const rows = [
    t({ operational_unit: 'U1', line_name: 'A', municipality: 'M1', km_total: 10, km_alert: 5, km_warning: 0, km_normal: 5, km_tree_high: 2, km_thermal_high: 3, km_thermal_mid: 1, worst_level: 'ALERT', metric_max: 12 }),
    t({ operational_unit: 'U1', line_name: 'A', municipality: 'M2', km_total: 10, km_alert: 0, km_warning: 10, km_normal: 0, km_tree_high: 0, km_thermal_high: 0, km_thermal_mid: 2, worst_level: 'WARNING', metric_max: 8 }),
    t({ operational_unit: 'U2', line_name: 'A', municipality: 'M3', km_total: 20, km_alert: 0, km_warning: 0, km_normal: 20, km_tree_high: 0, km_thermal_high: 0, km_thermal_mid: 0, worst_level: 'NORMAL', metric_max: 1 }),
    t({ operational_unit: 'U2', line_name: 'B', municipality: 'M3', km_total: 5, km_alert: 5, km_warning: 0, km_normal: 0, km_tree_high: 5, km_thermal_high: 1, km_thermal_mid: 0, worst_level: 'ALERT', metric_max: 14 }),
  ];
  it('sums km, recomputes the index and keeps the worst level per key', async () => {
    const { aggregateRows } = await import('./riskTable');
    const byUnit = aggregateRows(rows, 'unit');
    expect(byUnit.map((r) => r.operational_unit)).toEqual(['U1', 'U2']);
    const u1 = byUnit[0];
    expect(u1.km_total).toBe(20);
    expect(u1.km_alert).toBe(5);
    expect(u1.km_warning).toBe(10);
    expect(u1.risk_index).toBeCloseTo(50);
    expect(u1.worst_level).toBe('ALERT');
    expect(u1.metric_max).toBe(12);
    expect(u1.n_tratte).toBe(2);
    expect(u1.n_lines).toBe(1);
    expect(u1.km_thermal_high).toBe(3);
    expect(u1.km_thermal_mid).toBe(3);
  });
  it('aggregates per line across units and lists the units', async () => {
    const { aggregateRows } = await import('./riskTable');
    const byLine = aggregateRows(rows, 'line');
    const a = byLine.find((r) => r.line_name === 'A')!;
    expect(a.km_total).toBe(40);
    expect(a.operational_units).toBe('U1,U2');
    expect(a.n_units).toBe(2);
    expect(a.n_tratte).toBe(3);
  });
  it('can scope a line aggregate to one unit', async () => {
    const { aggregateRows } = await import('./riskTable');
    const inU2 = aggregateRows(rows.filter((r) => r.operational_unit === 'U2'), 'line');
    expect(inU2.map((r) => [r.line_name, r.km_total])).toEqual([['A', 20], ['B', 5]]);
  });
});

describe('normalizeRiskKmRow', () => {
  it('coerces numeric strings (Postgres numeric/bigint over JSON) to numbers, keeps nulls', async () => {
    const { normalizeRiskKmRow } = await import('./riskTable');
    const r = normalizeRiskKmRow({
      date: '2026-09-11', risk_vector: 'wind', level: 'tratta', line_name: 'X',
      km_total: '10.5', km_alert: '2', km_warning: 4, km_normal: '4.5', km_escalated: '0',
      km_tree_high: '1', km_tree_mid: 0, km_thermal_high: '2.5', km_thermal_mid: '0',
      metric_max: null, worst_level: 'WARNING', risk_index: '40.00', n_fragments: '7',
    });
    expect(r.km_total).toBe(10.5);
    expect(r.km_alert).toBe(2);
    expect(r.risk_index).toBe(40);
    expect(r.n_fragments).toBe(7);
    expect(r.metric_max).toBeNull();
    expect(r.km_thermal_high).toBe(2.5);
    expect(r.km_thermal_mid).toBe(0);
  });
});
