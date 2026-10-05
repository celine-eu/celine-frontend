/**
 * A REC admin releases a member from the community (celine-community `members.release`).
 *
 * Pure apart from `fetch`, and free of Svelte and `$lib` imports, so `tests/` can load
 * it with Node's type stripping, stub `fetch`, and check the route and every code in
 * every locale.
 *
 * **Only REC admins see the action.** `GET /api/me` reports `members.release` to a
 * REC's `admins` and to platform admins, never to its managers; the BFF and onboarding
 * both refuse a manager, so hiding the button is the dashboard's courtesy, not the
 * enforcement.
 *
 * **The admin types the member key to confirm.** Releasing withdraws the member's data
 * sharing, revokes their dataspace credential, removes their login from this community
 * and marks them inactive. Nothing is deleted, and the person can then join another
 * community, but it cannot be undone from this dashboard.
 *
 * **A release that ran answers per step.** The BFF answers `200` with `state`
 * `released` or `partial` and onboarding's four steps in a fixed order. Each step's
 * `code` becomes a plain sentence; a code this dashboard does not know reads as a
 * generic sentence for its status, because new codes may be added. `partial` offers
 * "Release again": the release is idempotent, and steps already done stay done.
 */

import type { Tone, Translate } from './memberSend';

/** Onboarding's steps, in the order it runs and reports them. */
export const RELEASE_STEPS = ['dataspace_share', 'dataspace_identity', 'keycloak_user', 'rec_registry_member'] as const;
export type ReleaseStepName = (typeof RELEASE_STEPS)[number];

export const STEP_STATUSES = ['done', 'skipped', 'failed', 'blocked'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** Every code each step can report, each with a `members.release.step.<step>.<code>` key. */
export const STEP_CODES: Record<ReleaseStepName, readonly string[]> = {
  dataspace_share: ['withdrawn', 'nothing_standing', 'no_connector', 'no_dataspace_identity', 'withdrawal_failed'],
  dataspace_identity: [
    'revoked',
    'no_credential',
    'held_elsewhere',
    'no_dataspace_identity',
    'credential_remains',
    'revocation_failed',
    'waits_for_dataspace_share',
  ],
  keycloak_user: ['released', 'already_released', 'no_provisioning', 'no_account', 'release_failed'],
  rec_registry_member: ['deactivated', 'no_registry', 'deactivation_failed', 'waits_for_keycloak_user'],
};

/** One step as the BFF answers it. Onboarding's English `detail` never reaches here. */
export interface ReleaseStep {
  step: string;
  status: string;
  code: string;
}

/** `200` from `POST …/members/{member_key}/release`. */
export interface MemberReleased {
  memberKey: string;
  state: 'released' | 'partial' | string;
  source?: string | null;
  steps: ReleaseStep[];
}

/** The BFF's answer to one press: the release that ran, or the code it was refused with. */
export type ReleaseOutcome =
  | { ok: true; status: number; released: MemberReleased }
  | { ok: false; status: number; code: string };

/** Every refusal code the BFF can answer, each with a `members.release.outcome.<code>` key. */
export const RELEASE_REFUSAL_CODES = [
  'member_not_found',
  'community_not_served',
  'community_ambiguous',
  'registry_unavailable',
  'admin_not_configured',
  'onboarding_refused',
  'onboarding_unavailable',
  'onboarding_unreadable',
  'onboarding_not_configured',
  'release_not_configured',
  'acting_token_unavailable',
  'forbidden',
  'network_error',
] as const;

/**
 * Refusals where pressing again cannot help until someone changes the configuration
 * or the member key. Every other refusal offers "Release again": the release is
 * idempotent, so a retry after an outage, or after an answer that may have come back
 * half-way, is safe.
 */
const FINAL = new Set([
  'member_not_found',
  'community_not_served',
  'community_ambiguous',
  'admin_not_configured',
  'onboarding_refused',
  'onboarding_not_configured',
  'release_not_configured',
  'acting_token_unavailable',
  'forbidden',
]);

/** One step as the dialog lists it. */
export interface StepLine {
  step: string;
  title: string;
  status: string;
  statusLabel: string;
  tone: Tone;
  text: string;
  /** The code as onboarding sent it, for an operator; not shown as text. */
  code: string;
}

/** What the dialog shows after a press. */
export interface ReleaseView {
  tone: Tone;
  headline: string;
  steps: StepLine[];
  /** Whether to offer "Release again". */
  again: boolean;
  /** Whether the member is now released: the row's status follows. */
  released: boolean;
}

/** Whether the typed text confirms this member: their key exactly, ignoring surrounding spaces. */
export function confirmsMember(typed: string | null | undefined, memberKey: string): boolean {
  const value = (typed ?? '').trim();
  return value.length > 0 && value === memberKey.trim();
}

/** The code the BFF sent, or a stand-in when its answer carried none. */
export function releaseCodeOf(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  // The BFF's own policy refusal carries a sentence, not a code.
  if (status === 403) return 'forbidden';
  return `http_${status}`;
}

/**
 * Codes whose step is `done` but which the admin must still read: `held_elsewhere`
 * means the member is released here, yet another community still holds an active
 * credential for the person, so they cannot join a new community until it releases them.
 */
const CAVEATS = new Set(['dataspace_identity.held_elsewhere']);

function stepTone(status: string): Tone {
  if (status === 'done') return 'success';
  if (status === 'skipped') return 'warning';
  return 'error';
}

/** A step's sentence: its code's, or the generic one for its status when the code is new. */
export function stepLine(step: ReleaseStep, t: Translate): StepLine {
  const known = (RELEASE_STEPS as readonly string[]).includes(step.step);
  const codes = known ? STEP_CODES[step.step as ReleaseStepName] : [];
  const status = (STEP_STATUSES as readonly string[]).includes(step.status) ? step.status : 'unknown';
  const text = codes.includes(step.code)
    ? t(`members.release.step.${step.step}.${step.code}`)
    : t(`members.release.generic.${status}`);
  return {
    step: step.step,
    title: known ? t(`members.release.step_title.${step.step}`) : t('members.release.step_title.unknown'),
    status: step.status,
    statusLabel: t(`members.release.status.${status}`),
    tone: status === 'unknown' ? 'error' : CAVEATS.has(`${step.step}.${step.code}`) ? 'warning' : stepTone(status),
    text,
    code: step.code,
  };
}

/** The dialog's result, from the BFF's answer. */
export function releaseView(outcome: ReleaseOutcome, member: string, t: Translate): ReleaseView {
  if (outcome.ok) {
    const { state, steps } = outcome.released;
    const lines = steps.map((step) => stepLine(step, t));
    if (state === 'released') {
      return {
        tone: 'success',
        headline: t('members.release.result_released', { values: { member } }),
        steps: lines,
        again: false,
        released: true,
      };
    }
    // `partial`, or a state this dashboard does not know: some step did not finish.
    return { tone: 'warning', headline: t('members.release.result_partial'), steps: lines, again: true, released: false };
  }
  const { code } = outcome;
  const known = (RELEASE_REFUSAL_CODES as readonly string[]).includes(code);
  return {
    tone: 'error',
    headline: known
      ? t(`members.release.outcome.${code}`)
      : t('members.release.outcome.unknown', { values: { code } }),
    steps: [],
    again: !FINAL.has(code),
    released: false,
  };
}

/** A `401` leaves the page, as every other request of this dashboard does. */
function signIn(): Promise<never> {
  window.location.href = `/oauth2/sign_in?rd=${encodeURIComponent(window.location.href)}`;
  return new Promise(() => {});
}

/** Release the member. Refusals resolve with their code; they do not throw. */
export async function releaseMember(communityKey: string, memberKey: string): Promise<ReleaseOutcome> {
  const url = `/api/communities/${encodeURIComponent(communityKey)}/members/${encodeURIComponent(memberKey)}/release`;
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', credentials: 'include' });
  } catch {
    return { ok: false, status: 0, code: 'network_error' };
  }
  if (response.status === 401) return signIn();
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const released = body as MemberReleased | null;
    if (released && typeof released.state === 'string' && Array.isArray(released.steps)) {
      return { ok: true, status: response.status, released };
    }
    return { ok: false, status: response.status, code: 'onboarding_unreadable' };
  }
  return { ok: false, status: response.status, code: releaseCodeOf(response.status, body) };
}
