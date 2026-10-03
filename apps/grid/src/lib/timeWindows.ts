// src/lib/timeWindows.ts
// The intra-day view: three 8-hour windows per forecast day (wind model on the
// window's max gust; heat stays daily). Pure — unit-tested.

export type Slot = 0 | 1 | 2;
export const SLOT_HOURS = 8;
export const SLOTS: readonly Slot[] = [0, 1, 2];

const pad = (n: number) => String(n).padStart(2, '0');

export function slotLabel(slot: Slot): string {
  return `${pad(slot * SLOT_HOURS)}–${pad((slot + 1) * SLOT_HOURS)}`;
}

export function parseSlot(value: string | null | undefined): Slot | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return n === 0 || n === 1 || n === 2 ? (n as Slot) : null;
}

export function windowStart(date: string, slot: Slot): string {
  return `${date}T${pad(slot * SLOT_HOURS)}:00:00`;
}
