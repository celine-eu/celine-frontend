// src/lib/popup.ts
// Pure builders for the map popups. Colours come from the app's CSS variables
// (app.css) so the popup follows the theme: MapLibre's popup box is white by
// default and any hardcoded light-mode colour here becomes unreadable in dark
// mode.

import { esc } from './mapPaint';

export type PopupFilter = 'substation' | 'line' | 'municipality';

export interface PopupRowSpec {
  /** i18n key of the row label */
  key: string;
  value: unknown;
  filter?: PopupFilter;
}

/** One "label | value" grid row; empty values render nothing. */
export function popupRow(label: string, value: unknown, filterType?: PopupFilter): string {
  if (value === null || value === undefined || value === '') return '';
  const v = esc(typeof value === 'number' ? value.toFixed(2).replace(/\.?0+$/, '') : String(value));
  const valHtml = filterType
    ? `<a href="#" data-filter-type="${esc(filterType)}" data-filter-value="${v}" style="font-weight:500;color:var(--celine-primary);cursor:pointer;text-decoration:none">${v}</a>`
    : `<span style="font-weight:500">${v}</span>`;
  return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:12px"><span style="color:var(--celine-text-muted)">${esc(label)}</span>${valHtml}</div>`;
}

/** Popup title bar. */
export function popupTitle(text: string): string {
  return `<div style="font-weight:700;font-size:13px;margin-bottom:6px;border-bottom:1px solid var(--celine-border);padding-bottom:6px">${esc(text)}</div>`;
}

/** Red call-out used for "escalated by …" notes. */
export function popupCallout(text: string): string {
  return `<div style="margin-top:6px;background:rgba(208,0,0,0.12);border:1px solid var(--celine-alert, #D00000);border-radius:6px;padding:4px 8px;font-size:11px;font-weight:600;color:var(--celine-alert, #D00000)">${esc(text)}</div>`;
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

/**
 * Rows of the secondary-substation (cabina) popup: exactly the six fields the
 * DSO asked for, in their order — identifier, name, "ID Linea MT" (feeder -
 * line), line, municipality, feeder code. Nothing else (the DSO struck the
 * rest out; "Data esercizio" is not in the shapefile anyway).
 */
export function cabinaPopupRows(props: Record<string, unknown>): PopupRowSpec[] {
  const feeder = str(props.feeder_id);
  const line = str(props.line_name);
  const lineMtId = feeder && line ? `${feeder} - ${line}` : (feeder ?? line);
  return [
    { key: 'panel.cabina_id', value: str(props.label_id) ?? str(props.asset_key) },
    { key: 'panel.cabina_name', value: str(props.name) },
    { key: 'panel.cabina_line_mt_id', value: lineMtId },
    { key: 'panel.cabina_line_normal', value: line, filter: 'line' },
    { key: 'panel.municipality', value: str(props.municipality), filter: 'municipality' },
    { key: 'panel.cabina_feeder_code', value: feeder },
  ];
}

/** Map label of a cabina: "code - name" only (the DSO wants the rest on click). */
export function cabinaLabel(props: Record<string, unknown>): string {
  const parts = [str(props.label_id), str(props.name)].filter((p): p is string => p !== null);
  return parts.length ? parts.join(' - ') : (str(props.asset_key) ?? '');
}
