/**
 * "Sei qui perché…" — one line per board and per weekly component, composed from the
 * reason codes and numbers the BFF returns (never computed here).
 */
import type { BoardStanding, FairWeeklyScore } from '$lib/api';

type Translate = (key: string, options?: { values?: Record<string, string | number> }) => string;

/** The explanation line of a board standing. */
export function boardLine(b: BoardStanding, t: Translate): string {
  const key = `gamification_fair.rank_reason.${b.reason}`;
  const text = t(key, { values: b.params });
  return text === key ? '' : text;
}

/** The explanation line of one weekly component (level / growth / actions). */
export function weekLine(w: FairWeeklyScore, kind: 'level' | 'growth' | 'actions', t: Translate): string {
  const reason = kind === 'level' ? w.level_reason : kind === 'growth' ? w.growth_reason : w.actions_reason;
  const base = `gamification_fair.${kind}_reason.${reason}`;
  // Level compared in a merged group (small category joined the other one): dedicated copy
  const key = kind === 'level' && w.params.merged === 1 ? `${base}_merged` : base;
  let text = t(key, { values: w.params });
  if (text === key && key !== base) text = t(base, { values: w.params });
  return text === base || text === key ? '' : text;
}

/** Progress ratio inside the current level, 0–100. */
export function levelProgressPct(seasonPoints: number, level: number, nextLevelAt: number): number {
  const step = nextLevelAt / Math.max(1, level);
  const prev = nextLevelAt - step;
  const range = Math.max(1, nextLevelAt - prev);
  return Math.min(100, Math.max(0, ((seasonPoints - prev) / range) * 100));
}
