import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// Node strips the types; the module has no Svelte or `$lib` import on purpose.
import { SEND_CODES, codeOf, outcomeMessage, relative } from '../src/lib/memberSend.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const LOCALES = ['en', 'it', 'es'];
const bundles = Object.fromEntries(
  await Promise.all(
    LOCALES.map(async (locale) => [locale, JSON.parse(await read(`src/lib/i18n/${locale}.json`))]),
  ),
);

/** `svelte-i18n`'s `$_`, as far as these messages use it: a key and `{name}` values. */
function translator(locale) {
  return (key, options = {}) => {
    const message = bundles[locale][key];
    if (message === undefined) return key;
    return message.replace(/\{(\w+)\}/g, (whole, name) => options.values?.[name] ?? whole);
  };
}

const outcome = (code, extra = {}) => ({ status: 409, code, kind: 'invitation', ...extra });

for (const locale of LOCALES) {
  const t = translator(locale);

  test(`${locale}: every code the BFF can answer reads as a sentence`, () => {
    for (const code of SEND_CODES) {
      const extra =
        code === 'sent' || code === 'not_on_dev_list'
          ? { status: 200, lifespanSeconds: 604800 }
          : code === 'cooldown'
            ? { status: 429, retryAfterSeconds: 240 }
            : {};
      const message = outcomeMessage(outcome(code, extra), t, locale);
      assert.doesNotMatch(message.text, /^members\./, `${locale} ${code}`);
      assert.doesNotMatch(message.text, /\{\w+\}/, `${locale} ${code} left a placeholder`);
    }
  });

  test(`${locale}: the kind picks the sentence and the lifespan comes from the answer`, () => {
    const invitation = outcomeMessage(
      { status: 200, code: 'sent', kind: 'invitation', lifespanSeconds: 604800 },
      t,
      locale,
    );
    const reset = outcomeMessage(
      { status: 200, code: 'sent', kind: 'password_reset', lifespanSeconds: 3600 },
      t,
      locale,
    );
    assert.notEqual(invitation.text, reset.text);
    assert.ok(invitation.text.includes(relative(604800, locale)), invitation.text);
    assert.ok(reset.text.includes(relative(3600, locale)), reset.text);
    assert.equal(invitation.tone, 'success');
    // A different lifespan changes the words: nothing says "7 days" by itself.
    const shorter = outcomeMessage(
      { status: 200, code: 'sent', kind: 'invitation', lifespanSeconds: 172800 },
      t,
      locale,
    );
    assert.ok(shorter.text.includes(relative(172800, locale)), shorter.text);
    assert.notEqual(shorter.text, invitation.text);
  });

  test(`${locale}: a mismatch names the other button`, () => {
    const hasPassword = outcomeMessage(outcome('has_password'), t, locale);
    const noPassword = outcomeMessage(outcome('no_password', { kind: 'password_reset' }), t, locale);
    assert.ok(hasPassword.text.includes(t('members.reset_password')), hasPassword.text);
    assert.ok(noPassword.text.includes(t('members.send_invitation')), noPassword.text);
    assert.equal(hasPassword.retry, false);
    assert.equal(noPassword.retry, false);
  });

  test(`${locale}: a cooldown says when, and no_email offers no retry`, () => {
    const cooldown = outcomeMessage(outcome('cooldown', { status: 429, retryAfterSeconds: 240 }), t, locale);
    assert.ok(cooldown.text.includes(relative(240, locale)), cooldown.text);
    assert.equal(cooldown.retry, true);
    const noEmail = outcomeMessage(outcome('no_email'), t, locale);
    assert.equal(noEmail.retry, false);
    assert.equal(outcomeMessage(outcome('send_failed', { status: 502 }), t, locale).retry, true);
  });

  test(`${locale}: an unknown code is shown raw`, () => {
    const message = outcomeMessage(outcome('a_code_nobody_has_invented_yet'), t, locale);
    assert.ok(message.text.includes('a_code_nobody_has_invented_yet'), message.text);
    assert.equal(message.tone, 'error');
  });
}

test('the code comes from the answer, never from its message', () => {
  assert.equal(codeOf(409, { detail: { code: 'no_email', message: 'ignored' } }), 'no_email');
  // The BFF's own policy refusal is a sentence.
  assert.equal(codeOf(403, { detail: 'REC admins or managers group required' }), 'forbidden');
  assert.equal(codeOf(500, null), 'http_500');
});

test('confirmation is the decision, and one press is in flight at a time', async () => {
  const page = await read('src/routes/[community]/members/+page.svelte');

  // The only call is inside the dialog's confirm handler.
  assert.equal(page.match(/sendMemberEmail\(/g)?.length, 1);
  assert.match(page, /async function confirmSend\(\)[\s\S]*?sendMemberEmail\(/);
  assert.doesNotMatch(page.match(/function ask\([\s\S]*?\n  \}/)?.[0] ?? '', /sendMemberEmail/);
  assert.match(page, /onclick=\{confirmSend\}/);
  // Both buttons are disabled while a request is in flight, and for a member who is not active.
  assert.equal(page.match(/disabled=\{sending \|\| member\.status !== 'active'\}/g)?.length, 2);
});

test('the buttons exist only with members.invite', async () => {
  const page = await read('src/routes/[community]/members/+page.svelte');

  assert.match(page, /includes\('members\.invite'\)/);
  assert.match(page, /\{#if canInvite\}\s*<td class="actions">/);
});

test('past sends are labelled shortly, in every locale, and unknown codes stay raw', async () => {
  const { outcomeLabel } = await import('../src/lib/memberSend.ts');
  for (const locale of LOCALES) {
    const t = translator(locale);
    for (const code of SEND_CODES) {
      assert.doesNotMatch(outcomeLabel(code, t), /^members\./, `${locale} ${code}`);
    }
    assert.equal(outcomeLabel('http_500', t), 'http_500');
  }
});

test('the sends view reads the audit-backed route, and neither stores nor exports names', async () => {
  const component = await read('src/lib/components/MemberSends.svelte');
  const page = await read('src/routes/[community]/members/+page.svelte');

  assert.match(component, /getMemberSends\(communityKey/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|indexedDB|ExportButtons|sendMemberEmail/);
  assert.doesNotMatch(component, /\.(userId|user_id|did|email|deliveryPoints?|fiscalCode|taxCode|phone)\b/i);
  assert.match(page, /<MemberSends communityKey=\{\$communityStore\.key\} \/>/);
});
