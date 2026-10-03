import { describe, it, expect } from 'vitest';
import { popupRow, cabinaPopupRows, cabinaLabel } from './popup';

describe('popupRow', () => {
  it('renders label and value, escaping HTML', () => {
    const html = popupRow('Comune', '<LIVO>');
    expect(html).toContain('Comune');
    expect(html).toContain('&lt;LIVO&gt;');
  });

  it('returns nothing for empty values', () => {
    expect(popupRow('x', null)).toBe('');
    expect(popupRow('x', undefined)).toBe('');
    expect(popupRow('x', '')).toBe('');
  });

  it('formats numbers without trailing zeros', () => {
    expect(popupRow('d', 1832.0371)).toContain('1832.04');
    expect(popupRow('d', 2)).toContain('>2<');
  });

  it('renders a filter link when a filter type is given', () => {
    const html = popupRow('Linea', "MALE'", 'line');
    expect(html).toContain('data-filter-type="line"');
    expect(html).toContain('data-filter-value="MALE&#39;"');
  });

  it('uses theme variables, never hardcoded light-mode colours (dark mode must stay readable)', () => {
    const html = popupRow('Linea', 'X', 'line') + popupRow('Comune', 'Y');
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(html).toContain('var(--celine-text-muted');
    expect(html).toContain('var(--celine-primary');
  });
});

describe('cabinaPopupRows', () => {
  const props = {
    label_id: '033817', name: 'BRESIMO C.LE', feeder_id: 'DG1001320', line_name: "MALE'",
    municipality: 'LIVO', parent_substation_name: 'MONCLASSICO', operational_unit: 'U3',
  };

  it('lists the DSO-requested fields in order, composing ID Linea MT as feeder - line', () => {
    const rows = cabinaPopupRows(props);
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ['panel.cabina_id', '033817'],
      ['panel.cabina_name', 'BRESIMO C.LE'],
      ['panel.cabina_line_mt_id', "DG1001320 - MALE'"],
      ['panel.cabina_line_normal', "MALE'"],
      ['panel.municipality', 'LIVO'],
      ['panel.cabina_feeder_code', 'DG1001320'],
    ]);
  });

  it('shows nothing beyond the six DSO fields (no primary substation, unit, dates)', () => {
    const keys = cabinaPopupRows(props).map((r) => r.key);
    expect(keys).toHaveLength(6);
    expect(keys).not.toContain('panel.primary_substation');
    expect(keys).not.toContain('panel.operational_unit');
  });

  it('keeps line and municipality rows as filter links', () => {
    const rows = cabinaPopupRows(props);
    expect(rows.find((r) => r.key === 'panel.cabina_line_normal')?.filter).toBe('line');
    expect(rows.find((r) => r.key === 'panel.municipality')?.filter).toBe('municipality');
    expect(rows.find((r) => r.key === 'panel.cabina_line_mt_id')?.filter).toBeUndefined();
  });

  it('degrades when feeder or line are missing', () => {
    expect(cabinaPopupRows({ ...props, feeder_id: '' }).find((r) => r.key === 'panel.cabina_line_mt_id')?.value).toBe("MALE'");
    expect(cabinaPopupRows({ ...props, line_name: null }).find((r) => r.key === 'panel.cabina_line_mt_id')?.value).toBe('DG1001320');
    expect(cabinaPopupRows({ ...props, feeder_id: null, line_name: null }).find((r) => r.key === 'panel.cabina_line_mt_id')?.value).toBeNull();
  });
});

describe('cabinaLabel', () => {
  it('is "code - name" only', () => {
    expect(cabinaLabel({ label_id: '033817', name: 'BRESIMO C.LE' })).toBe('033817 - BRESIMO C.LE');
  });
  it('falls back to whichever part exists', () => {
    expect(cabinaLabel({ label_id: '033817' })).toBe('033817');
    expect(cabinaLabel({ name: 'BRESIMO C.LE' })).toBe('BRESIMO C.LE');
    expect(cabinaLabel({ asset_key: 'DG102033817' })).toBe('DG102033817');
  });
});
