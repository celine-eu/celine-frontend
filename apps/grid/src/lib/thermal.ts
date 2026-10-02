// src/lib/thermal.ts
// Pure helpers for the thermal tier / soil-heat presentation shared by the cable
// popup heat branch and the joint popup (both in routes/+page.svelte).

/**
 * `thermal_modelled` only exists on risk-row metrics, never on `grid_shapes`
 * features, so it may only override the result DOWNWARD (toward
 * "unmodelled"): an explicit `false` always means unmodelled. Otherwise the
 * tier itself decides: missing/empty or the literal `unmodelled` tier key
 * means unmodelled, any other tier means modelled.
 */
export function isThermalUnmodelled(modelled: unknown, tier: unknown): boolean {
  if (modelled === false || modelled === 'false') return true;
  const hasTier = typeof tier === 'string' && tier.length > 0;
  return !hasTier || tier === 'unmodelled';
}

/** The tier key to use for the `thermal_tier.<key>` i18n lookup, defaulting to `low` when missing. */
export function thermalTierKey(tier: unknown): string {
  return typeof tier === 'string' && tier.length > 0 ? tier : 'low';
}

/**
 * Whether the "(non modellato)" suffix should be appended to a tier label.
 * The `unmodelled` tier's own label already says "not modelled", so the
 * suffix is only shown for other tiers that are flagged unmodelled.
 */
export function shouldShowUnmodelledSuffix(modelled: unknown, tier: unknown): boolean {
  return isThermalUnmodelled(modelled, tier) && thermalTierKey(tier) !== 'unmodelled';
}
