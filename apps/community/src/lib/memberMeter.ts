/**
 * A manager attaches or detaches a member's meter (celine-community ADR-0003, ADR-0004).
 *
 * Pure apart from `fetch`, and free of Svelte and `$lib` imports, so `tests/` can load
 * it with Node's type stripping, stub `fetch`, and check the routes, the bodies and
 * every code in every locale.
 *
 * **The sensor id is typed, never offered** (plan D18): nothing here reads meter data
 * to suggest one. The only meters read are those of the one member the dialog is open
 * for. **A name meets a sensor id only in the dialog:** the id travels in request and
 * response bodies, never in a URL; the dialog's read is `cache: 'no-store'`, so the
 * browser's HTTP cache never keeps it; nothing here writes to browser storage; and no
 * outcome sentence contains it, so a message left under a row of the members list
 * does not put the id beside the name.
 */

import type { OutcomeMessage, Tone, Translate } from './memberSend';

/** The registry's meter vocabulary (`rec-registry: schemas/bundle.py`). */
export const METER_TYPES = ['consumption', 'production', 'bidirectional', 'import', 'export'] as const;
export type MeterType = (typeof METER_TYPES)[number];

/**
 * The longest sensor id an attach takes: `meter-<id>` must fit the registry's
 * 128-character asset key. The BFF refuses a longer one before asking the registry.
 */
export const SENSOR_ID_MAX_LENGTH = 128 - 'meter-'.length;

export type MeterPress = 'read' | 'attach' | 'detach';

/** One of the member's meters, as the dialog's read returns it. */
export interface MemberMeter {
  sensorId: string;
  meterType?: string | null;
}

/** `GET …/members/{member_key}/meter`: that one member's meters and nothing else. */
export interface MemberMeters {
  memberKey: string;
  /** What an attach sends when the manager picks no type: from the member's role. */
  defaultMeterType: MeterType;
  meters: MemberMeter[];
}

/** The BFF's answer to one press, whatever its status. Carries no sensor id. */
export interface MeterOutcome {
  status: number;
  code: string;
  press: MeterPress;
  /** On `attached` and `already_attached`: the type the meter now has. */
  meterType?: string;
}

export type MeterRead = { ok: true; meters: MemberMeters } | { ok: false; outcome: MeterOutcome };

/** Every code the BFF can answer a meter press with, each with a `members.meter.outcome.<code>` key. */
export const METER_CODES = [
  'attached',
  'already_attached',
  'detached',
  'sensor_held',
  'asset_key_taken',
  'asset_key_too_long',
  'member_not_found',
  'community_not_found',
  'meter_not_found',
  'sensor_id_blank',
  'invalid_input',
  'meter_rejected',
  'registry_unavailable',
  'registry_refused',
  'meter_writes_not_configured',
  'forbidden',
  'network_error',
] as const;

/** Codes where pressing again can succeed. */
const RETRYABLE = new Set(['registry_unavailable', 'network_error']);

const TONES: Record<string, Tone> = {
  attached: 'success',
  detached: 'success',
  already_attached: 'warning',
  sensor_held: 'warning',
  sensor_id_blank: 'warning',
};

/** An attach's default type: `bidirectional` for a prosumer, `consumption` otherwise. */
export function defaultMeterType(role: string | null | undefined): MeterType {
  return (role ?? '').trim().toLowerCase() === 'prosumer' ? 'bidirectional' : 'consumption';
}

/** The id as the BFF and the registry compare it: trimmed. `null` when nothing is left. */
export function normalizeSensorId(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/** The code the BFF sent, or a stand-in when its answer carried none. */
export function meterCodeOf(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  // The BFF's own policy refusal carries a sentence, not a code.
  if (status === 403) return 'forbidden';
  // FastAPI's own validation refusal: a list of errors, e.g. an unknown meter type.
  if (status === 422 && Array.isArray(detail)) return 'invalid_input';
  return `http_${status}`;
}

export function meterOutcomeMessage(outcome: MeterOutcome, t: Translate): OutcomeMessage {
  const { code } = outcome;
  if (!(METER_CODES as readonly string[]).includes(code)) {
    // Shown raw: a code this dashboard does not know is still the truth, and it is
    // what an operator will search the logs for.
    return { tone: 'error', text: t('members.meter.outcome.unknown', { values: { code } }), retry: false };
  }
  return {
    tone: TONES[code] ?? 'error',
    text: t(`members.meter.outcome.${code}`),
    retry: RETRYABLE.has(code),
  };
}

function meterUrl(communityKey: string, memberKey: string): string {
  return `/api/communities/${encodeURIComponent(communityKey)}/members/${encodeURIComponent(memberKey)}/meter`;
}

/** A `401` leaves the page, as every other request of this dashboard does. */
function signIn(): Promise<never> {
  window.location.href = `/oauth2/sign_in?rd=${encodeURIComponent(window.location.href)}`;
  return new Promise(() => {});
}

async function call(
  url: string,
  init: RequestInit,
): Promise<{ response: Response; body: unknown } | { response: null; body: null }> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', ...init });
  } catch {
    return { response: null, body: null };
  }
  if (response.status === 401) return signIn();
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}

/** The meters of the one member the dialog is open for. Refusals resolve, they do not throw. */
export async function getMemberMeters(communityKey: string, memberKey: string): Promise<MeterRead> {
  const { response, body } = await call(meterUrl(communityKey, memberKey), {
    // The answer carries sensor ids: the browser's HTTP cache must not keep it.
    cache: 'no-store',
  });
  if (!response) return { ok: false, outcome: { status: 0, code: 'network_error', press: 'read' } };
  if (response.ok && body) return { ok: true, meters: body as MemberMeters };
  return { ok: false, outcome: { status: response.status, code: meterCodeOf(response.status, body), press: 'read' } };
}

/** Attach the meter with this typed sensor id. `201 attached` or `200 already_attached`. */
export async function attachMeter(
  communityKey: string,
  memberKey: string,
  sensorId: string,
  meterType?: MeterType,
): Promise<MeterOutcome> {
  const { response, body } = await call(meterUrl(communityKey, memberKey), {
    method: 'PUT',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meterType ? { sensorId, meterType } : { sensorId }),
  });
  if (!response) return { status: 0, code: 'network_error', press: 'attach' };
  if (response.ok) {
    const answer = (body ?? {}) as { outcome?: string; meterType?: string };
    return {
      status: response.status,
      code: answer.outcome ?? (response.status === 200 ? 'already_attached' : 'attached'),
      press: 'attach',
      meterType: answer.meterType,
    };
  }
  return { status: response.status, code: meterCodeOf(response.status, body), press: 'attach' };
}

/** Detach the member's meter with this sensor id. The id is in the body, never the URL. */
export async function detachMeter(
  communityKey: string,
  memberKey: string,
  sensorId: string,
): Promise<MeterOutcome> {
  const { response, body } = await call(meterUrl(communityKey, memberKey), {
    method: 'DELETE',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensorId }),
  });
  if (!response) return { status: 0, code: 'network_error', press: 'detach' };
  if (response.ok) return { status: response.status, code: 'detached', press: 'detach' };
  return { status: response.status, code: meterCodeOf(response.status, body), press: 'detach' };
}
