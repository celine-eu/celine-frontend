/**
 * Round a PROMISED points value for display (nearest 5, exact below 5).
 * Promises are estimates — coarse display absorbs day-to-day jitter (spec T6).
 * Actual/settled points must never pass through this.
 */
export function roundPromise(points: number): number {
  return points < 5 ? Math.round(points) : Math.round(points / 5) * 5;
}
