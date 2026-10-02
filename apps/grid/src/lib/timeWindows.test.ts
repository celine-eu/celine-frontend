import { describe, it, expect } from 'vitest';
import { SLOTS, slotLabel, parseSlot, windowStart } from './timeWindows';

describe('timeWindows', () => {
  it('has three 8-hour windows with hh–hh labels', () => {
    expect(SLOTS).toEqual([0, 1, 2]);
    expect(SLOTS.map(slotLabel)).toEqual(['00–08', '08–16', '16–24']);
  });
  it('parses a slot from the URL and rejects anything else', () => {
    expect(parseSlot('0')).toBe(0);
    expect(parseSlot('2')).toBe(2);
    expect(parseSlot('3')).toBeNull();
    expect(parseSlot('x')).toBeNull();
    expect(parseSlot(null)).toBeNull();
  });
  it('builds the window start timestamp', () => {
    expect(windowStart('2026-09-11', 1)).toBe('2026-09-11T08:00:00');
  });
});
