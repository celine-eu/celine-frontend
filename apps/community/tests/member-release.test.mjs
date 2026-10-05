import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';

// Node strips the types; the module has no Svelte or `$lib` import on purpose.
import {
  RELEASE_REFUSAL_CODES,
  RELEASE_STEPS,
  STEP_CODES,
  STEP_STATUSES,
  confirmsMember,
  releaseCodeOf,
  releaseMember,
  releaseView,
  stepLine,
} from '../src/lib/memberRelease.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const LOCALES = ['en', 'it', 'es'];
const bundles = Object.fromEntries(
  await Promise.all(
    LOCALES.map(async (locale) => [locale, JSON.parse(await read(`src/lib/i18n/${locale}.json`))]),
  ),
);
const PAGE = 'src/routes/[community]/members/+page.svelte';

/** `svelte-i18n`'s `$_`, as far as these messages use it: a key and `{name}` values. */
function translator(locale) {
  return (key, options = {}) => {
    const message = bundles[locale][key];
    if (message === undefined) return key;
    return message.replace(/\{(\w+)\}/g, (whole, name) => options.values?.[name] ?? whole);
  };
}

// Fixture values, never real ones.
const RELEASE_URL = '/api/communities/example-rec/members/ex-00001/release';

const RELEASED = {
  memberKey: 'ex-00001',
  state: 'released',
  source: 'submission',
  steps: [
    { step: 'dataspace_share', status: 'done', code: 'withdrawn' },
    { step: 'dataspace_identity', status: 'done', code: 'revoked' },
    { step: 'keycloak_user', status: 'done', code: 'released' },
    { step: 'rec_registry_member', status: 'done', code: 'deactivated' },
  ],
};

const PARTIAL = {
  ...RELEASED,
  state: 'partial',
  steps: [
    { step: 'dataspace_share', status: 'failed', code: 'withdrawal_failed' },
    { step: 'dataspace_identity', status: 'blocked', code: 'waits_for_dataspace_share' },
    { step: 'keycloak_user', status: 'done', code: 'already_released' },
    { step: 'rec_registry_member', status: 'skipped', code: 'no_registry' },
  ],
};

/** Replace `fetch` with a recorder answering `answer`, and give the module a `window`. */
function stubFetch(answer) {
  const calls = [];
  globalThis.window = { location: { href: 'https://community.example.org/example-rec/members' } };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    const { status, body } = answer;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    });
  };
  return calls;
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
});

const dialogOf = (page) => page.match(/\{#if releaseFor\}[\s\S]*?\n\{\/if\}/)?.[0] ?? '';

// --- Sentences ----------------------------------------------------------------

for (const locale of LOCALES) {
  const t = translator(locale);

  test(`${locale}: every step code, status and refusal reads as a sentence`, () => {
    for (const step of RELEASE_STEPS) {
      assert.ok(bundles[locale][`members.release.step_title.${step}`], `${locale} ${step}`);
      for (const code of STEP_CODES[step]) {
        for (const status of STEP_STATUSES) {
          const line = stepLine({ step, status, code }, t);
          assert.doesNotMatch(line.text, /^members\./, `${locale} ${step} ${code}`);
          assert.doesNotMatch(line.statusLabel, /^members\./, `${locale} ${status}`);
          assert.doesNotMatch(line.title, /^members\./, `${locale} ${step}`);
        }
      }
    }
    for (const code of RELEASE_REFUSAL_CODES) {
      const view = releaseView({ ok: false, status: 502, code }, 'Ada', t);
      assert.doesNotMatch(view.headline, /^members\./, `${locale} ${code}`);
      assert.doesNotMatch(view.headline, /\{\w+\}/, `${locale} ${code} left a placeholder`);
    }
  });

  test(`${locale}: each step code has its own sentence`, () => {
    for (const step of RELEASE_STEPS) {
      const texts = STEP_CODES[step].map((code) => stepLine({ step, status: 'done', code }, t).text);
      assert.equal(new Set(texts).size, texts.length, `${locale} ${step}`);
    }
  });

  test(`${locale}: the confirmation says what happens, that nothing is deleted, and that the person can join another community`, () => {
    for (const key of [
      'members.release.intro',
      'members.release.effect_share',
      'members.release.effect_credential',
      'members.release.effect_login',
      'members.release.effect_inactive',
      'members.release.retention',
      'members.release.rejoin',
    ]) {
      assert.ok(bundles[locale][key], `${locale} ${key}`);
    }
    assert.match(bundles[locale]['members.release.type_key'], /\{key\}/, locale);
    assert.match(bundles[locale]['members.release.dialog_title'], /\{member\}/, locale);
    assert.match(bundles[locale]['members.release.result_released'], /\{member\}/, locale);
  });

  test(`${locale}: a code or a step this dashboard does not know reads generically, never raw`, () => {
    for (const status of STEP_STATUSES) {
      const line = stepLine({ step: 'dataspace_share', status, code: 'a_code_from_the_future' }, t);
      assert.equal(line.text, bundles[locale][`members.release.generic.${status}`], `${locale} ${status}`);
      assert.ok(!line.text.includes('a_code_from_the_future'));
      assert.equal(line.code, 'a_code_from_the_future');
    }
    const odd = stepLine({ step: 'a_new_step', status: 'mystery', code: 'x' }, t);
    assert.equal(odd.title, bundles[locale]['members.release.step_title.unknown']);
    assert.equal(odd.text, bundles[locale]['members.release.generic.unknown']);
    assert.equal(odd.tone, 'error');
  });
}

test('the confirmation text, in English, says it in plain words', () => {
  const en = bundles.en;
  assert.match(en['members.release.effect_share'], /data sharing is withdrawn/);
  assert.match(en['members.release.effect_credential'], /dataspace credential is revoked/);
  assert.match(en['members.release.effect_login'], /login is removed from this community/);
  assert.match(en['members.release.effect_inactive'], /inactive/);
  assert.match(en['members.release.retention'], /Nothing is deleted.*retention period/);
  assert.match(en['members.release.rejoin'], /join another community/);
});

// --- The result ----------------------------------------------------------------

test('a full release is a success, keeps the four steps in order, and offers nothing more', () => {
  const t = translator('en');
  const view = releaseView({ ok: true, status: 200, released: RELEASED }, 'Ada', t);
  assert.equal(view.tone, 'success');
  assert.equal(view.released, true);
  assert.equal(view.again, false);
  assert.ok(view.headline.includes('Ada'));
  assert.deepEqual(view.steps.map((line) => line.step), [...RELEASE_STEPS]);
  assert.ok(view.steps.every((line) => line.tone === 'success'));
});

test('a partial release offers "Release again" and says which steps did not finish', () => {
  const t = translator('en');
  const view = releaseView({ ok: true, status: 200, released: PARTIAL }, 'Ada', t);
  assert.equal(view.tone, 'warning');
  assert.equal(view.released, false);
  assert.equal(view.again, true);
  assert.deepEqual(view.steps.map((line) => [line.status, line.tone]), [
    ['failed', 'error'],
    ['blocked', 'error'],
    ['done', 'success'],
    ['skipped', 'warning'],
  ]);
  assert.equal(view.steps[0].text, bundles.en['members.release.step.dataspace_share.withdrawal_failed']);
  assert.equal(view.steps[1].statusLabel, 'Not attempted');
});

test('contract v1.1: held_elsewhere is done but read as a caveat, credential_remains fails and asks to release again', () => {
  const t = translator('en');
  assert.ok(!STEP_CODES.dataspace_identity.includes('already_revoked'));
  for (const locale of LOCALES) {
    assert.equal(bundles[locale]['members.release.step.dataspace_identity.already_revoked'], undefined, locale);
  }
  const held = stepLine({ step: 'dataspace_identity', status: 'done', code: 'held_elsewhere' }, t);
  assert.equal(held.tone, 'warning');
  assert.equal(held.statusLabel, 'Done');
  assert.match(held.text, /Another community still holds an active credential/);
  assert.match(held.text, /only after that community releases them/);
  const remains = stepLine({ step: 'dataspace_identity', status: 'failed', code: 'credential_remains' }, t);
  assert.equal(remains.tone, 'error');
  assert.match(remains.text, /Release again/);
  const view = releaseView(
    {
      ok: true,
      status: 200,
      released: {
        ...PARTIAL,
        steps: [
          { step: 'dataspace_share', status: 'done', code: 'withdrawn' },
          { step: 'dataspace_identity', status: 'failed', code: 'credential_remains' },
          { step: 'keycloak_user', status: 'done', code: 'released' },
          { step: 'rec_registry_member', status: 'done', code: 'deactivated' },
        ],
      },
    },
    'Ada',
    t,
  );
  assert.equal(view.again, true);
  // A repeated release reports the credential as gone, not as an unknown code.
  const again = stepLine({ step: 'dataspace_identity', status: 'done', code: 'no_credential' }, t);
  assert.equal(again.text, bundles.en['members.release.step.dataspace_identity.no_credential']);
});

test('a refusal is its sentence; release again only where retrying can help', () => {
  const t = translator('en');
  const again = (code) => releaseView({ ok: false, status: 502, code }, 'Ada', t).again;
  for (const code of ['registry_unavailable', 'onboarding_unavailable', 'onboarding_unreadable', 'network_error', 'http_500']) {
    assert.equal(again(code), true, code);
  }
  for (const code of ['member_not_found', 'forbidden', 'onboarding_refused', 'release_not_configured', 'community_ambiguous']) {
    assert.equal(again(code), false, code);
  }
  const unknown = releaseView({ ok: false, status: 409, code: 'a_code_nobody_knows' }, 'Ada', t);
  assert.equal(unknown.tone, 'error');
  assert.ok(unknown.headline.includes('a_code_nobody_knows'));
});

test('the typed key must be the member key', () => {
  assert.ok(confirmsMember('ex-00001', 'ex-00001'));
  assert.ok(confirmsMember('  ex-00001 ', 'ex-00001'));
  for (const typed of ['', '   ', 'ex-0000', 'EX-00001', 'ex-00001x', null, undefined]) {
    assert.ok(!confirmsMember(typed, 'ex-00001'), String(typed));
  }
});

test('the code comes from the answer, never from its message', () => {
  assert.equal(releaseCodeOf(404, { detail: { code: 'member_not_found' } }), 'member_not_found');
  assert.equal(releaseCodeOf(403, { detail: 'REC admins group required' }), 'forbidden');
  assert.equal(releaseCodeOf(500, null), 'http_500');
});

// --- The request ------------------------------------------------------------------

test('a release POSTs to the member release route with no body', async () => {
  const calls = stubFetch({ status: 200, body: RELEASED });
  const outcome = await releaseMember('example-rec', 'ex-00001');

  assert.deepEqual(outcome, { ok: true, status: 200, released: RELEASED });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, RELEASE_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.credentials, 'include');
  assert.equal(calls[0].init.body, undefined);
});

test('a partial release is a 200 too', async () => {
  stubFetch({ status: 200, body: PARTIAL });
  const outcome = await releaseMember('example-rec', 'ex-00001');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.released.state, 'partial');
});

test('refusals resolve with their code', async () => {
  const cases = [
    [{ status: 404, body: { detail: { code: 'member_not_found' } } }, 404, 'member_not_found'],
    [{ status: 404, body: { detail: { code: 'community_not_served' } } }, 404, 'community_not_served'],
    [{ status: 409, body: { detail: { code: 'community_ambiguous' } } }, 409, 'community_ambiguous'],
    [{ status: 502, body: { detail: { code: 'registry_unavailable' } } }, 502, 'registry_unavailable'],
    [{ status: 502, body: { detail: { code: 'onboarding_refused' } } }, 502, 'onboarding_refused'],
    [{ status: 503, body: { detail: { code: 'admin_not_configured' } } }, 503, 'admin_not_configured'],
    [{ status: 503, body: { detail: { code: 'onboarding_unavailable' } } }, 503, 'onboarding_unavailable'],
    [{ status: 403, body: { detail: 'REC admins group required' } }, 403, 'forbidden'],
    [{ status: 200, body: { state: 'released' } }, 200, 'onboarding_unreadable'],
    [new TypeError('offline'), 0, 'network_error'],
  ];
  for (const [answer, status, code] of cases) {
    stubFetch(answer);
    assert.deepEqual(await releaseMember('example-rec', 'ex-00001'), { ok: false, status, code });
  }
});

test('a 401 leaves for sign-in', async () => {
  stubFetch({ status: 401 });
  const pending = releaseMember('example-rec', 'ex-00001');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(globalThis.window.location.href, /^\/oauth2\/sign_in\?rd=/);
  assert.equal(await Promise.race([pending.then(() => 'resolved'), Promise.resolve('pending')]), 'pending');
});

// --- The page ----------------------------------------------------------------------

test('the dashboard knows members.release and its api exposes the release call', async () => {
  const api = await read('src/lib/api.ts');
  assert.match(api, /\| 'members\.release'/);
  assert.match(api, /export \{[\s\S]*?releaseMember,[\s\S]*?\} from '\.\/memberRelease'/);
});

test('the release action exists only with members.release, once per row', async () => {
  const page = await read(PAGE);
  assert.match(page, /const canRelease = \$derived\(\(\$communityStore\?\.capabilities \?\? \[\]\)\.includes\('members\.release'\)\)/);
  assert.match(page, /\{#if canRelease\}\s*<button class="send danger"[^>]*onclick=\{\(\) => openRelease\(member\)\}>\{\$_\('members\.release\.open'\)\}/);
  assert.equal(page.match(/openRelease\(member\)/g)?.length, 1);
});

test('nothing is released until the typed key matches, and one press is in flight', async () => {
  const page = await read(PAGE);
  const dialog = dialogOf(page);
  assert.ok(dialog);
  assert.equal(page.match(/releaseMember\(community/g)?.length, 1);
  assert.match(page, /async function confirmRelease\(\)[\s\S]*?if \(!community \|\| !member \|\| releaseBusy\) return;[\s\S]*?if \(!releaseResult && !confirmsMember\(releaseTyped, member\.key\)\) return;[\s\S]*?releaseMember\(community/);
  const body = page.match(/function openRelease\([\s\S]*?\n {2}\}/)?.[0] ?? '';
  assert.ok(body);
  assert.doesNotMatch(body, /releaseMember/);
  assert.match(dialog, /<input bind:value=\{releaseTyped\}/);
  assert.match(dialog, /disabled=\{releaseBusy \|\| !releaseConfirmed\}/);
});

test('the dialog explains before it asks, then lists the steps and offers "Release again" when partial', async () => {
  const dialog = dialogOf(await read(PAGE));
  const ask = dialog.match(/\{:else\}[\s\S]*$/)?.[0] ?? '';
  for (const key of ['effect_share', 'effect_credential', 'effect_login', 'effect_inactive', 'retention', 'rejoin']) {
    assert.ok(ask.includes(`members.release.${key}`), key);
    assert.ok(ask.indexOf(`members.release.${key}`) < ask.indexOf('bind:value={releaseTyped}'), key);
  }
  const result = dialog.match(/\{#if releaseResult\}[\s\S]*?\{:else\}/)?.[0] ?? '';
  assert.match(result, /\{#each releaseResult\.steps as line/);
  assert.match(result, /\{#if releaseResult\.again\}[\s\S]*?onclick=\{confirmRelease\}[\s\S]*?members\.release\.again/);
});

test('a released member is shown inactive, and nothing is stored in the browser', async () => {
  const page = await read(PAGE);
  assert.match(page, /if \(view\.released\) \{[\s\S]*?status: 'inactive'/);
  const client = await read('src/lib/memberRelease.ts');
  const code = (source) => source.replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(code(client), /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(code(dialogOf(page)), /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
