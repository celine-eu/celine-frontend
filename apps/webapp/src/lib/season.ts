/** Season helpers shared by the points and fair gamification panels. */

/** "Sep–Oct" style label; `end` is exclusive, so the last day is end − 1. */
export function seasonMonthsLabel(start: string, end: string, loc: string): string {
  const startDate = new Date(`${start}T00:00:00`);
  const lastDay = new Date(`${end}T00:00:00`);
  lastDay.setDate(lastDay.getDate() - 1);
  const fmt = new Intl.DateTimeFormat(loc, { month: 'short' });
  return `${fmt.format(startDate)}–${fmt.format(lastDay)}`;
}

/** Whole days left before the (exclusive) season end, never negative. */
export function seasonDaysLeft(end: string): number {
  const endDate = new Date(`${end}T00:00:00`);
  return Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000));
}
