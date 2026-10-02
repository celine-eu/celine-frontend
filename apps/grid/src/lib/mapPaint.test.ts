import { describe, it, expect } from 'vitest';
import {
  riskColorExpr,
  esc,
  RISK_COLORS,
  UNIFORM_GREY,
  UNIFORM_GREY_IMAGERY,
  THERMAL_TIER_COLORS,
  jointColorExpr,
} from './mapPaint';

describe('riskColorExpr', () => {
  it('returns a hover-aware expression with the three risk colours when enabled', () => {
    const json = JSON.stringify(riskColorExpr(true));
    expect(json).toContain(RISK_COLORS.ALERT);
    expect(json).toContain(RISK_COLORS.WARNING);
    expect(json).toContain('risk_level');
    expect(json).toContain(UNIFORM_GREY);
  });

  it('never references risk_level when disabled (uniform grey)', () => {
    const json = JSON.stringify(riskColorExpr(false));
    expect(json).not.toContain('risk_level');
    expect(json).not.toContain(RISK_COLORS.ALERT);
    expect(json).toContain(UNIFORM_GREY);
  });

  it('uses the lighter grey on imagery basemaps', () => {
    expect(JSON.stringify(riskColorExpr(false, true))).toContain(UNIFORM_GREY_IMAGERY);
    expect(JSON.stringify(riskColorExpr(true, true))).toContain(UNIFORM_GREY_IMAGERY);
    expect(JSON.stringify(riskColorExpr(true, false))).not.toContain(UNIFORM_GREY_IMAGERY);
  });
});

describe('jointColorExpr', () => {
  it('colours ALERT/WARNING joints by risk and every other joint in the muted grey when heat risk is enabled', () => {
    const json = JSON.stringify(jointColorExpr(true));
    expect(json).toContain('risk_level');
    expect(json).toContain(RISK_COLORS.ALERT);
    expect(json).toContain(RISK_COLORS.WARNING);
    expect(json).toContain(UNIFORM_GREY);
  });

  it('never paints a thermal tier colour while heat risk is enabled (tier red must not read as ALERT)', () => {
    const json = JSON.stringify(jointColorExpr(true));
    expect(json).not.toContain('thermal_tier');
    expect(json).not.toContain(THERMAL_TIER_COLORS.high);
    expect(json).not.toContain(THERMAL_TIER_COLORS.mid);
    expect(json).not.toContain(THERMAL_TIER_COLORS.low);
  });

  it('uses the lighter grey for non-risk joints on imagery basemaps', () => {
    const json = JSON.stringify(jointColorExpr(true, true));
    expect(json).toContain(UNIFORM_GREY_IMAGERY);
    expect(json).not.toContain(UNIFORM_GREY);
  });

  it('falls back to the tier match alone (with the unmodelled grey) when heat risk is disabled', () => {
    const json = JSON.stringify(jointColorExpr(false));
    expect(json).not.toContain('risk_level');
    expect(json).not.toContain(RISK_COLORS.ALERT);
    expect(json).toContain('thermal_tier');
    expect(json).toContain(THERMAL_TIER_COLORS.unmodelled);
  });
});

describe('THERMAL_TIER_COLORS', () => {
  it('defines the four thermal tiers', () => {
    expect(THERMAL_TIER_COLORS).toEqual({
      low: '#bfdbfe',
      mid: '#f59e0b',
      high: '#b91c1c',
      unmodelled: '#9ca3af',
    });
  });
});

describe('esc', () => {
  it('escapes HTML special characters', () => {
    expect(esc('<b onclick="x">&\'</b>')).toBe('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
  });
  it('stringifies non-strings and maps null/undefined to empty', () => {
    expect(esc(12)).toBe('12');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});
