// src/lib/urlState.ts
// Filter state shared between the map (/) and the table (/table) through the URL.
// Pure — no runtime imports, unit-tested.

import { parseSlot, type Slot } from './timeWindows';

export type DataMode = 'forecast' | 'nowcasting';
export type RiskVector = 'wind' | 'heat';

export interface FilterState {
  mode: DataMode;
  date?: string;
  vector?: RiskVector;
  /** 8-hour window of the intra-day view; undefined = daily view */
  slot?: Slot;
  substations: string[];
  secondarySubstations: string[];
  lines: string[];
  units: string[];
  municipalities: string[];
  risk: string[];
}

export const EMPTY_FILTERS: FilterState = {
  mode: 'forecast',
  date: undefined,
  vector: undefined,
  slot: undefined,
  substations: [],
  secondarySubstations: [],
  lines: [],
  units: [],
  municipalities: [],
  risk: [],
};

const LIST_PARAMS: [keyof FilterState, string][] = [
  ['substations', 'substation'],
  ['secondarySubstations', 'secondary'],
  ['lines', 'line'],
  ['units', 'unit'],
  ['municipalities', 'municipality'],
  ['risk', 'risk'],
];

export function parseFilters(p: URLSearchParams): FilterState {
  const vector = p.get('vector');
  const out: FilterState = {
    ...EMPTY_FILTERS,
    mode: p.get('mode') === 'nowcasting' ? 'nowcasting' : 'forecast',
    date: p.get('date') ?? undefined,
    vector: vector === 'wind' || vector === 'heat' ? vector : undefined,
    slot: parseSlot(p.get('slot')) ?? undefined,
  };
  for (const [key, param] of LIST_PARAMS) {
    (out as unknown as Record<string, string[]>)[key] = p.getAll(param);
  }
  return out;
}

/** Serialise to URL params; defaults and empty lists are omitted, `extra` is appended. */
export function serializeFilters(f: FilterState, extra?: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  if (f.mode === 'nowcasting') p.set('mode', 'nowcasting');
  if (f.date) p.set('date', f.date);
  if (f.vector) p.set('vector', f.vector);
  if (f.slot !== undefined) p.set('slot', String(f.slot));
  for (const [key, param] of LIST_PARAMS) {
    for (const v of f[key] as string[]) p.append(param, v);
  }
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  return p;
}
