/**
 * A manager corrects a member's role and area (celine-community ADR-0003).
 *
 * Pure apart from `fetch`, and free of Svelte and `$lib` imports, so `tests/` can load
 * it with Node's type stripping, stub `fetch`, and check the routes, the bodies and
 * every code in every locale.
 *
 * **The role moves between `consumer` and `prosumer` only** (plan D30): settlement
 * counts a meter's production only for a `prosumer`. A member whose role is anything
 * else (`producer`, an imported `operator` or `admin`) is shown that role read-only,
 * and only their area can be changed. The BFF refuses the same (`role_not_allowed`,
 * `role_read_only`), so this is the dialog's courtesy, not the enforcement.
 *
 * **Only an active member is edited** (plan D45): the Edit action is disabled for any
 * other status, and the BFF refuses the same (`409 member_not_active`).
 *
 * **Only what changed is sent.** The BFF's `PATCH …/members/{member_key}` takes
 * `{role?, area?}` and nothing else; a field the manager left as it was is not in the
 * body, and a dialog with nothing changed sends nothing.
 */

import type { OutcomeMessage, Tone, Translate } from './memberSend';

/** The roles the dialog moves a member between. Every other role is read-only. */
export const EDITABLE_ROLES = ['consumer', 'prosumer'] as const;
export type EditableRole = (typeof EDITABLE_ROLES)[number];

/** The boundary an area references: its `id` is the primary substation's code. */
export interface AreaBoundary {
  source: string;
  id: string;
}

/** One of the REC's areas, as `GET …/areas` returns it. */
export interface CommunityArea {
  key: string;
  name: string;
  /** `null` while the registry records no boundary for the area. */
  boundary?: AreaBoundary | null;
  /**
   * The area's primary substation: its first topology node, the node the pipelines
   * attribute its meters to. Equal to `boundary.id` for an area with a boundary.
   */
  primarySubstation?: string | null;
}

/** `GET /api/communities/{community_key}/areas`. */
export interface CommunityAreas {
  communityKey: string;
  areas: CommunityArea[];
}

/** What the dialog sends: only the fields that changed. */
export interface ProfileChanges {
  role?: EditableRole;
  area?: string;
}

export type ProfilePress = 'areas' | 'edit';

/** The BFF's answer to one press, whatever its status. */
export interface ProfileOutcome {
  status: number;
  code: string;
  press: ProfilePress;
  /** On `updated` and `unchanged`: the member's role and area as they now stand. */
  role?: string;
  area?: string;
  changed?: Array<'role' | 'area'>;
}

export type AreasRead = { ok: true; areas: CommunityArea[] } | { ok: false; outcome: ProfileOutcome };

/** Every code a profile press or the areas read can answer, each with a `members.profile.outcome.<code>` key. */
export const PROFILE_CODES = [
  'updated',
  'unchanged',
  'profile_empty',
  'role_not_allowed',
  'role_read_only',
  'member_not_active',
  'invalid_role',
  'unknown_area',
  'member_not_found',
  'community_not_found',
  'profile_rejected',
  'invalid_input',
  'registry_unavailable',
  'registry_refused',
  'profile_writes_not_configured',
  'forbidden',
  'network_error',
] as const;

/** Codes where pressing again can succeed. */
const RETRYABLE = new Set(['registry_unavailable', 'network_error']);

const TONES: Record<string, Tone> = {
  updated: 'success',
  unchanged: 'warning',
  profile_empty: 'warning',
};

/** The role as the BFF compares it: trimmed and lowercased. */
export function normalizeRole(role: string | null | undefined): string {
  return (role ?? '').trim().toLowerCase();
}

/** Whether this member's role and area may be edited: only an active member's (D45). */
export function canEditMember(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'active';
}

/** Whether the dialog may change this member's role: only a consumer's or a prosumer's. */
export function isRoleEditable(role: string | null | undefined): role is EditableRole {
  return (EDITABLE_ROLES as readonly string[]).includes(normalizeRole(role));
}

/**
 * What a save sends, from the member as listed and the dialog's choices. The role is
 * included only when the member's role is editable and the choice differs; the area
 * only when it differs. An empty object means there is nothing to send.
 */
export function profileChanges(
  current: { role?: string | null; area?: string | null },
  draft: { role?: string | null; area?: string | null },
): ProfileChanges {
  const changes: ProfileChanges = {};
  const role = normalizeRole(draft.role);
  if (isRoleEditable(current.role) && isRoleEditable(role) && role !== normalizeRole(current.role)) {
    changes.role = role;
  }
  const area = (draft.area ?? '').trim();
  if (area && area !== (current.area ?? '').trim()) changes.area = area;
  return changes;
}

/** The warning's paragraphs, as translation keys: one per changed field, then the full-refresh note. */
export function warningKeys(changes: ProfileChanges): string[] {
  const keys: string[] = [];
  if (changes.role !== undefined) keys.push('members.profile.warning_role');
  if (changes.area !== undefined) keys.push('members.profile.warning_area');
  if (keys.length) keys.push('members.profile.warning_refresh');
  return keys;
}

/** The area's primary substation id: the BFF's `primarySubstation`, else its boundary's id. */
export function areaSubstation(area: CommunityArea): string | null {
  return area.primarySubstation?.trim() || area.boundary?.id?.trim() || null;
}

/** An area as the select shows it: its name, and its primary substation when the registry records one. */
export function areaLabel(area: CommunityArea, t: Translate): string {
  const name = area.name?.trim() || area.key;
  const substation = areaSubstation(area);
  return substation
    ? t('members.profile.area_with_substation', { values: { name, substation } })
    : name;
}

/**
 * An area key as the confirm step shows it: the REC area's label when the registry
 * lists that key, the key itself otherwise (an area the registry no longer lists).
 */
export function areaKeyLabel(areas: CommunityArea[], key: string | null | undefined, t: Translate): string {
  const wanted = (key ?? '').trim();
  const area = areas.find((candidate) => candidate.key === wanted);
  return area ? areaLabel(area, t) : wanted;
}

/**
 * The select's options: the REC's areas, plus the member's current area when the
 * registry no longer lists it, so the select shows what the member has rather than
 * silently offering another area.
 */
export function areaOptions(areas: CommunityArea[], currentArea: string | null | undefined): CommunityArea[] {
  const current = (currentArea ?? '').trim();
  if (!current || areas.some((area) => area.key === current)) return areas;
  return [{ key: current, name: current, boundary: null, primarySubstation: null }, ...areas];
}

/** The code the BFF sent, or a stand-in when its answer carried none. */
export function profileCodeOf(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  // The BFF's own policy refusal carries a sentence, not a code.
  if (status === 403) return 'forbidden';
  // FastAPI's own validation refusal: a list of errors, e.g. a key the route does not take.
  if (status === 422 && Array.isArray(detail)) return 'invalid_input';
  return `http_${status}`;
}

export function profileOutcomeMessage(outcome: ProfileOutcome, t: Translate): OutcomeMessage {
  const { code } = outcome;
  if (!(PROFILE_CODES as readonly string[]).includes(code)) {
    // Shown raw: a code this dashboard does not know is still the truth, and it is
    // what an operator will search the logs for.
    return { tone: 'error', text: t('members.profile.outcome.unknown', { values: { code } }), retry: false };
  }
  return {
    tone: TONES[code] ?? 'error',
    text: t(`members.profile.outcome.${code}`),
    retry: RETRYABLE.has(code),
  };
}

function communityUrl(communityKey: string): string {
  return `/api/communities/${encodeURIComponent(communityKey)}`;
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

/** The REC's areas, for the dialog's select. Refusals resolve, they do not throw. */
export async function getCommunityAreas(communityKey: string): Promise<AreasRead> {
  const { response, body } = await call(`${communityUrl(communityKey)}/areas`, {});
  if (!response) return { ok: false, outcome: { status: 0, code: 'network_error', press: 'areas' } };
  if (response.ok && body) return { ok: true, areas: (body as CommunityAreas).areas ?? [] };
  return {
    ok: false,
    outcome: { status: response.status, code: profileCodeOf(response.status, body), press: 'areas' },
  };
}

/** Send the changed fields. `200 updated`, or `200 unchanged` when the member already had them. */
export async function editMemberProfile(
  communityKey: string,
  memberKey: string,
  changes: ProfileChanges,
): Promise<ProfileOutcome> {
  const body: ProfileChanges = {};
  if (changes.role !== undefined) body.role = changes.role;
  if (changes.area !== undefined) body.area = changes.area;
  if (body.role === undefined && body.area === undefined) {
    // Refused here, before any request: the BFF would answer `profile_empty`.
    return { status: 422, code: 'profile_empty', press: 'edit' };
  }
  const { response, body: answer } = await call(
    `${communityUrl(communityKey)}/members/${encodeURIComponent(memberKey)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!response) return { status: 0, code: 'network_error', press: 'edit' };
  if (response.ok) {
    const edited = (answer ?? {}) as {
      outcome?: string;
      role?: string;
      area?: string;
      changed?: Array<'role' | 'area'>;
    };
    return {
      status: response.status,
      code: edited.outcome ?? 'updated',
      press: 'edit',
      role: edited.role,
      area: edited.area,
      changed: edited.changed ?? [],
    };
  }
  return { status: response.status, code: profileCodeOf(response.status, answer), press: 'edit' };
}
