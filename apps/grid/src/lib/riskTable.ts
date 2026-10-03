// src/lib/riskTable.ts
// Pure helpers for the risk exposure table (/table): sorting, formatting, CSV.

export type RiskKmLevel = 'tratta' | 'line' | 'unit';
export type RiskLevel = 'ALERT' | 'WARNING' | 'NORMAL';

/** One row of the BFF `/risk-km` response, at any of the three grains. */
export interface RiskKmRow {
  date: string;
  risk_vector: 'wind' | 'heat';
  level: RiskKmLevel;
  operational_unit?: string | null;
  operational_units?: string | null; // line grain: comma-joined
  n_units?: number;
  line_name?: string;
  municipality?: string;
  conductor_type?: string;
  segment_id?: string;
  parent_substation_name?: string | null;
  feeder_id?: string | null;
  n_fragments?: number;
  n_tratte?: number;
  n_lines?: number;
  km_total: number;
  km_alert: number;
  km_warning: number;
  km_normal: number;
  km_escalated: number;
  km_tree_high: number;
  km_tree_mid: number;
  km_thermal_high: number;
  km_thermal_mid: number;
  metric_max: number | null;
  worst_level: RiskLevel;
  risk_index: number | null;
}

export type SortDir = 'asc' | 'desc';

const LEVEL_RANK: Record<RiskLevel, number> = { ALERT: 2, WARNING: 1, NORMAL: 0 };

/** Stable sort; numbers compare numerically (nulls last), strings case-insensitively. */
export function sortRows<T extends object>(rows: T[], key: keyof T & string, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const rank = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v in LEVEL_RANK) return LEVEL_RANK[v as RiskLevel];
    return NaN;
  };
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const av = (a.r as Record<string, unknown>)[key];
      const bv = (b.r as Record<string, unknown>)[key];
      const an = rank(av);
      const bn = rank(bv);
      if (an === null && bn === null) return a.i - b.i;
      if (an === null) return 1;
      if (bn === null) return -1;
      let cmp: number;
      if (Number.isNaN(an) || Number.isNaN(bn)) {
        cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });
      } else {
        cmp = an - bn;
      }
      return cmp === 0 ? a.i - b.i : cmp * sign;
    })
    .map((x) => x.r);
}

export function pct(part: number, total: number): number | null {
  if (!total) return null;
  return (100 * part) / total;
}

export function fmtKm(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toFixed(1);
}

export function fmtIndex(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toFixed(1);
}

export function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v.toFixed(0)}%`;
}

export function worstLevelOf(rows: { worst_level: RiskLevel }[]): RiskLevel {
  let worst: RiskLevel = 'NORMAL';
  for (const r of rows) if (LEVEL_RANK[r.worst_level] > LEVEL_RANK[worst]) worst = r.worst_level;
  return worst;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export interface CsvColumn {
  key: string;
  header: string;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: object[], columns: readonly CsvColumn[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell((r as Record<string, unknown>)[c.key])).join(','));
  return [head, ...body].join('\n');
}

const KM_COLUMNS: CsvColumn[] = [
  { key: 'km_total', header: 'km_totali' },
  { key: 'km_alert', header: 'km_allerta' },
  { key: 'km_warning', header: 'km_preallarme' },
  { key: 'km_normal', header: 'km_normale' },
  { key: 'km_escalated', header: 'km_escalati_alberi' },
  { key: 'km_tree_high', header: 'km_alberi_alta' },
  { key: 'km_tree_mid', header: 'km_alberi_media' },
  { key: 'km_thermal_high', header: 'km_termico_alta' },
  { key: 'km_thermal_mid', header: 'km_termico_media' },
  { key: 'metric_max', header: 'metrica_max' },
  { key: 'worst_level', header: 'livello_peggiore' },
  { key: 'risk_index', header: 'indice_rischio' },
];

/** Italian column set per grain, in the spirit of `make_dangerous_lines_csv.py`. */
export function riskKmCsvColumns(level: RiskKmLevel): CsvColumn[] {
  const common: CsvColumn[] = [
    { key: 'date', header: 'data' },
    { key: 'risk_vector', header: 'rischio' },
  ];
  if (level === 'unit') {
    return [...common, { key: 'operational_unit', header: 'nucleo_operativo' }, { key: 'n_lines', header: 'n_linee' }, { key: 'n_tratte', header: 'n_tratte' }, ...KM_COLUMNS];
  }
  if (level === 'line') {
    return [...common, { key: 'line_name', header: 'nome_linea' }, { key: 'operational_units', header: 'nuclei_operativi' }, { key: 'parent_substation_name', header: 'cabina_primaria' }, { key: 'n_tratte', header: 'n_tratte' }, ...KM_COLUMNS];
  }
  return [
    ...common,
    { key: 'line_name', header: 'nome_linea' },
    { key: 'operational_unit', header: 'nucleo_operativo' },
    { key: 'municipality', header: 'comune' },
    { key: 'conductor_type', header: 'tipo_conduttore' },
    { key: 'parent_substation_name', header: 'cabina_primaria' },
    { key: 'feeder_id', header: 'feeder' },
    { key: 'segment_id', header: 'id_tratta' },
    { key: 'n_fragments', header: 'n_frammenti' },
    ...KM_COLUMNS,
  ];
}

// ---------------------------------------------------------------------------
// Client-side rollups from tratta rows (same arithmetic as the DT `risk_km`
// line/unit grains: summed km, worst level, index recomputed from the sums).
// ---------------------------------------------------------------------------

function keyOf(row: RiskKmRow, level: 'line' | 'unit'): string {
  return level === 'unit' ? (row.operational_unit ?? '') : (row.line_name ?? '');
}

export function aggregateRows(rows: RiskKmRow[], level: 'line' | 'unit'): RiskKmRow[] {
  const groups = new Map<string, RiskKmRow[]>();
  for (const r of rows) {
    const k = keyOf(r, level);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: RiskKmRow[] = [];
  for (const [k, g] of groups) {
    const sum = (f: (r: RiskKmRow) => number) => g.reduce((acc, r) => acc + (f(r) || 0), 0);
    const km_total = sum((r) => r.km_total);
    const km_alert = sum((r) => r.km_alert);
    const km_warning = sum((r) => r.km_warning);
    const metrics = g.map((r) => r.metric_max).filter((v): v is number => v !== null && v !== undefined);
    const units = [...new Set(g.map((r) => r.operational_unit ?? ''))].sort();
    out.push({
      date: g[0].date,
      risk_vector: g[0].risk_vector,
      level,
      operational_unit: level === 'unit' ? k : undefined,
      line_name: level === 'line' ? k : undefined,
      operational_units: level === 'line' ? units.join(',') : undefined,
      n_units: level === 'line' ? units.length : undefined,
      parent_substation_name: level === 'line' ? g[0].parent_substation_name : undefined,
      n_tratte: g.length,
      n_lines: level === 'unit' ? new Set(g.map((r) => r.line_name)).size : undefined,
      km_total,
      km_alert,
      km_warning,
      km_normal: sum((r) => r.km_normal),
      km_escalated: sum((r) => r.km_escalated),
      km_tree_high: sum((r) => r.km_tree_high),
      km_tree_mid: sum((r) => r.km_tree_mid),
      km_thermal_high: sum((r) => r.km_thermal_high),
      km_thermal_mid: sum((r) => r.km_thermal_mid),
      metric_max: metrics.length ? Math.max(...metrics) : null,
      worst_level: worstLevelOf(g),
      risk_index: km_total ? (100 * (km_alert + 0.5 * km_warning)) / km_total : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wire normalisation: Postgres `numeric`/`bigint` reach the browser as strings.
// ---------------------------------------------------------------------------

const NUMERIC_KEYS = [
  'km_total', 'km_alert', 'km_warning', 'km_normal', 'km_escalated', 'km_tree_high', 'km_tree_mid',
  'km_thermal_high', 'km_thermal_mid',
  'metric_max', 'risk_index', 'n_fragments', 'n_tratte', 'n_lines', 'n_units',
] as const;

export function normalizeRiskKmRow(raw: Record<string, unknown>): RiskKmRow {
  const out: Record<string, unknown> = { ...raw };
  for (const k of NUMERIC_KEYS) {
    const v = raw[k];
    if (v === null || v === undefined) continue;
    const n = typeof v === 'number' ? v : Number(v);
    out[k] = Number.isFinite(n) ? n : null;
  }
  return out as unknown as RiskKmRow;
}
