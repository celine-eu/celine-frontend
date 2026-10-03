import { describe, it, expect } from 'vitest';
import { isThermalUnmodelled, thermalTierKey, shouldShowUnmodelledSuffix } from './thermal';

describe('isThermalUnmodelled', () => {
  it('is false when modelled is true and a tier is present', () => {
    expect(isThermalUnmodelled(true, 'high')).toBe(false);
  });

  it('is true when modelled is explicitly false, regardless of tier', () => {
    expect(isThermalUnmodelled(false, 'high')).toBe(true);
  });

  it('is false when modelled is missing but the tier is present and not unmodelled', () => {
    expect(isThermalUnmodelled(undefined, 'low')).toBe(false);
    expect(isThermalUnmodelled(null, 'low')).toBe(false);
    expect(isThermalUnmodelled(undefined, 'high')).toBe(false);
  });

  it('is true when the tier itself is missing', () => {
    expect(isThermalUnmodelled(true, null)).toBe(true);
    expect(isThermalUnmodelled(true, undefined)).toBe(true);
    expect(isThermalUnmodelled(true, '')).toBe(true);
  });

  it('is true when modelled is missing and the tier is unmodelled', () => {
    expect(isThermalUnmodelled(undefined, 'unmodelled')).toBe(true);
  });

  it('is true when modelled and tier are both missing', () => {
    expect(isThermalUnmodelled(undefined, undefined)).toBe(true);
    expect(isThermalUnmodelled(undefined, '')).toBe(true);
  });

  it('accepts the wire string forms of the boolean', () => {
    expect(isThermalUnmodelled('true', 'high')).toBe(false);
    expect(isThermalUnmodelled('false', 'high')).toBe(true);
  });
});

describe('thermalTierKey', () => {
  it('returns the tier string as-is when present', () => {
    expect(thermalTierKey('high')).toBe('high');
  });
  it('defaults to low when the tier is missing (per the NULL-tier-shown-as-low contract)', () => {
    expect(thermalTierKey(null)).toBe('low');
    expect(thermalTierKey(undefined)).toBe('low');
    expect(thermalTierKey('')).toBe('low');
  });
});

describe('shouldShowUnmodelledSuffix', () => {
  it('is false for the unmodelled tier itself, since its label already says so', () => {
    expect(shouldShowUnmodelledSuffix(undefined, 'unmodelled')).toBe(false);
    expect(shouldShowUnmodelledSuffix(false, 'unmodelled')).toBe(false);
  });

  it('is true for a missing tier, which defaults to the low label', () => {
    expect(shouldShowUnmodelledSuffix(undefined, undefined)).toBe(true);
    expect(shouldShowUnmodelledSuffix(undefined, '')).toBe(true);
  });

  it('is true when modelled is explicitly false on a real tier', () => {
    expect(shouldShowUnmodelledSuffix(false, 'high')).toBe(true);
  });

  it('is false for a modelled real tier', () => {
    expect(shouldShowUnmodelledSuffix(true, 'high')).toBe(false);
    expect(shouldShowUnmodelledSuffix(undefined, 'high')).toBe(false);
  });
});
