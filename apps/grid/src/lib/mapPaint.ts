// src/lib/mapPaint.ts
// Pure helpers for MapLibre paint expressions and popup HTML.
// Kept free of Svelte/MapLibre runtime imports so they can be unit-tested.

import type { ExpressionSpecification } from 'maplibre-gl';

export const RISK_COLORS = {
  ALERT: '#D00000',
  WARNING: '#F7D000',
  NORMAL: '#00A000',
} as const;

/** Colour of a line whose risk colouring is off (or NORMAL) on vector basemaps. */
export const UNIFORM_GREY = '#6b7280';
/** Lighter grey so lines stay readable on satellite imagery. */
export const UNIFORM_GREY_IMAGERY = '#e5e7eb';
/** Hover colour for lines without an active risk level. */
export const HOVER_GREEN = '#16a34a';

export function baseLineColor(onImagery = false): string {
  return onImagery ? UNIFORM_GREY_IMAGERY : UNIFORM_GREY;
}

/**
 * `line-color` expression for a conductor layer.
 *
 * - `enabled = true`: ALERT/WARNING features take the risk colour, the rest the
 *   base grey (green on hover).
 * - `enabled = false`: risk colouring is switched off — every feature is grey
 *   (green on hover). The geometry stays visible and clickable.
 */
export function riskColorExpr(enabled: boolean, onImagery = false): ExpressionSpecification {
  const grey = baseLineColor(onImagery);
  const hovered: ExpressionSpecification = ['boolean', ['feature-state', 'hover'], false];
  if (!enabled) {
    return ['case', hovered, HOVER_GREEN, grey];
  }
  return [
    'case',
    hovered,
    ['match', ['get', 'risk_level'], 'ALERT', RISK_COLORS.ALERT, 'WARNING', RISK_COLORS.WARNING, HOVER_GREEN],
    ['match', ['get', 'risk_level'], 'ALERT', RISK_COLORS.ALERT, 'WARNING', RISK_COLORS.WARNING, grey],
  ];
}

/** Escape a value for safe interpolation into popup HTML. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Colours of the static tree-strike exposure tiers (underlay + legend). */
export const TREE_TIER_COLORS: Record<string, string> = {
  low: '#fed7aa',
  mid: '#f97316',
  high: '#9a3412',
};

/** Colours of the thermal tiers (joints layer + cable thermal tier, legend). */
export const THERMAL_TIER_COLORS: Record<string, string> = {
  low: '#bfdbfe',
  mid: '#f59e0b',
  high: '#b91c1c',
  unmodelled: '#9ca3af',
};

/**
 * `circle-color` expression for the joints layer.
 *
 * - `heatEnabled = true`: ALERT/WARNING joints take the risk colour, every other
 *   joint the same muted grey as the lines. The thermal tier is deliberately NOT
 *   painted here: tier "high" is a dark red that reads as an ALERT on the map,
 *   which is a lie on days without risk rows (see the popup for the tier).
 * - `heatEnabled = false`: every joint is coloured by its thermal tier alone.
 */
export function jointColorExpr(heatEnabled: boolean, onImagery = false): ExpressionSpecification {
  if (!heatEnabled) {
    return [
      'match',
      ['get', 'thermal_tier'],
      'low', THERMAL_TIER_COLORS.low,
      'mid', THERMAL_TIER_COLORS.mid,
      'high', THERMAL_TIER_COLORS.high,
      THERMAL_TIER_COLORS.unmodelled,
    ];
  }
  return [
    'match',
    ['get', 'risk_level'],
    'ALERT', RISK_COLORS.ALERT,
    'WARNING', RISK_COLORS.WARNING,
    baseLineColor(onImagery),
  ];
}
