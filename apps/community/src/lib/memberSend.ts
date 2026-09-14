/**
 * What a manager reads after pressing "Send invitation" or "Reset password".
 *
 * Pure, and free of Svelte and `$lib` imports, so `tests/` can load it with Node's
 * type stripping and check every code in every locale. The BFF answers with a
 * machine-readable code (A6); this turns the code into a sentence, and never shows
 * a server message.
 */

export type SendIntent = 'invitation' | 'password_reset';

/** The BFF's answer to one press, whatever its status. */
export interface SendOutcome {
  status: number;
  code: string;
  kind: SendIntent;
  lifespanSeconds?: number;
  retryAfterSeconds?: number;
}

export type Tone = 'success' | 'warning' | 'error';

export interface OutcomeMessage {
  tone: Tone;
  text: string;
  /** Whether pressing again can help. False for `no_email`, `has_password` and the like. */
  retry: boolean;
}

/** Translate `key` with ICU-style `{name}` values. `svelte-i18n`'s `$_` fits. */
export type Translate = (key: string, options?: { values?: Record<string, string> }) => string;

/** Every code the BFF can answer with, each with a `members.send.<code>` key. */
export const SEND_CODES = [
  'sent',
  'not_on_dev_list',
  'member_not_found',
  'account_not_found',
  'community_not_found',
  'community_not_served',
  'community_ambiguous',
  'account_disabled',
  'has_password',
  'no_password',
  'no_email',
  'cooldown',
  'send_failed',
  'registry_unavailable',
  'provisioning_failed',
  'provisioning_refused',
  'provisioning_not_configured',
  'provisioning_unavailable',
  'onboarding_refused',
  'onboarding_unavailable',
  'onboarding_not_configured',
  'acting_token_unavailable',
  'forbidden',
  'network_error',
] as const;

/** Codes where pressing the same button again can succeed. */
const RETRYABLE = new Set([
  'cooldown',
  'send_failed',
  'registry_unavailable',
  'provisioning_failed',
  'provisioning_unavailable',
  'onboarding_unavailable',
  'network_error',
]);

const TONES: Record<string, Tone> = {
  sent: 'success',
  not_on_dev_list: 'warning',
  has_password: 'warning',
  no_password: 'warning',
  no_email: 'warning',
  cooldown: 'warning',
};

/** A duration as the largest whole unit that expresses it exactly. */
export function durationParts(seconds: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const whole = Math.max(0, Math.round(seconds));
  if (whole >= 86400 && whole % 86400 === 0) return { value: whole / 86400, unit: 'day' };
  if (whole >= 3600 && whole % 3600 === 0) return { value: whole / 3600, unit: 'hour' };
  if (whole >= 60) return { value: Math.ceil(whole / 60), unit: 'minute' };
  return { value: whole, unit: 'second' };
}

/** "in 7 days", "tra 1 ora", "dentro de 4 minutos": never a hard-coded lifespan. */
export function relative(seconds: number, locale: string): string {
  const { value, unit } = durationParts(seconds);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'always' }).format(value, unit);
}

/** The code the BFF sent, or a stand-in when its answer carried none. */
export function codeOf(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  const code = (detail as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && code) return code;
  // The BFF's own policy refusal carries a sentence, not a code.
  if (status === 403) return 'forbidden';
  return `http_${status}`;
}

/** A short outcome label for a past send, or the code itself when it is unknown. */
export function outcomeLabel(code: string, t: Translate): string {
  return (SEND_CODES as readonly string[]).includes(code) ? t(`members.outcome.${code}`) : code;
}

export function outcomeMessage(outcome: SendOutcome, t: Translate, locale: string): OutcomeMessage {
  const { code } = outcome;
  const known = (SEND_CODES as readonly string[]).includes(code);
  const retry = RETRYABLE.has(code);
  const tone: Tone = TONES[code] ?? 'error';

  if (!known) {
    // Shown raw: a code this dashboard does not know is still the truth, and it
    // is what an operator will search the logs for.
    return { tone: 'error', text: t('members.send.unknown', { values: { code } }), retry: false };
  }

  const values: Record<string, string> = {
    invitation: t('members.send_invitation'),
    reset: t('members.reset_password'),
  };
  if (code === 'sent' || code === 'not_on_dev_list') {
    if (outcome.lifespanSeconds !== undefined) {
      values.validity = relative(outcome.lifespanSeconds, locale);
    }
    const key = code === 'sent' ? `members.send.sent_${outcome.kind}` : 'members.send.not_on_dev_list';
    return { tone, text: t(key, { values }), retry: false };
  }
  if (code === 'cooldown') {
    const key =
      outcome.retryAfterSeconds !== undefined ? 'members.send.cooldown' : 'members.send.cooldown_unknown';
    if (outcome.retryAfterSeconds !== undefined) {
      values.retry = relative(outcome.retryAfterSeconds, locale);
    }
    return { tone, text: t(key, { values }), retry };
  }
  return { tone, text: t(`members.send.${code}`, { values }), retry };
}
