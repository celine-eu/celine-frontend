import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';

// Node strips the types; the module has no Svelte or `$lib` import on purpose.
import {
  EDITABLE_ROLES,
  PROFILE_CODES,
  areaKeyLabel,
  areaLabel,
  areaOptions,
  areaSubstation,
  canEditMember,
  editMemberProfile,
  getCommunityAreas,
  isRoleEditable,
  profileChanges,
  profileCodeOf,
  profileOutcomeMessage,
  warningKeys,
} from '../src/lib/memberProfile.ts';

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

// Fixture values, never real ones: a placeholder substation code.
const MEMBER_URL = '/api/communities/example-rec/members/ex-00001';
const AREAS_URL = '/api/communities/example-rec/areas';
const SUBSTATION = 'AC000E00000';

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

const dialogOf = (page) => page.match(/\{#if editFor\}[\s\S]*?\n\{\/if\}/)?.[0] ?? '';

// --- Codes and sentences ----------------------------------------------------

for (const locale of LOCALES) {
  const t = translator(locale);

  test(`${locale}: every code the BFF can answer a profile press with reads as a sentence`, () => {
    for (const code of PROFILE_CODES) {
      const message = profileOutcomeMessage({ status: 422, code, press: 'edit' }, t);
      assert.doesNotMatch(message.text, /^members\./, `${locale} ${code}`);
      assert.doesNotMatch(message.text, /\{\w+\}/, `${locale} ${code} left a placeholder`);
    }
  });

  test(`${locale}: updated, unchanged, a refusal and an outage read differently`, () => {
    const text = (code, status) => profileOutcomeMessage({ status, code, press: 'edit' }, t);
    const updated = text('updated', 200);
    const unchanged = text('unchanged', 200);
    const readOnly = text('role_read_only', 409);
    const outage = text('registry_unavailable', 502);
    assert.equal(updated.tone, 'success');
    assert.equal(unchanged.tone, 'warning');
    assert.equal(readOnly.tone, 'error');
    assert.equal(readOnly.retry, false);
    assert.equal(outage.tone, 'error');
    assert.equal(outage.retry, true);
    assert.equal(new Set([updated.text, unchanged.text, readOnly.text, outage.text]).size, 4);
    // A missing grant is the deployment's fault, not the manager's.
    assert.notEqual(text('registry_refused', 502).text, text('forbidden', 403).text);
    assert.notEqual(text('role_not_allowed', 422).text, text('role_read_only', 409).text);
  });

  test(`${locale}: the warning names the next pipeline run and the full refresh`, () => {
    for (const key of ['members.profile.warning_role', 'members.profile.warning_area', 'members.profile.warning_refresh']) {
      assert.ok(bundles[locale][key], `${locale} ${key}`);
    }
    assert.notEqual(bundles[locale]['members.profile.warning_role'], bundles[locale]['members.profile.warning_area']);
  });

  test(`${locale}: every role has a label, and an area shows its primary substation when known`, () => {
    for (const role of ['consumer', 'prosumer', 'producer', 'operator', 'admin']) {
      assert.ok(bundles[locale][`members.profile.role.${role}`], `${locale} ${role}`);
    }
    const labelled = areaLabel({ key: 'north', name: 'North', boundary: { source: 'gse_cabine_primarie', id: SUBSTATION } }, t);
    assert.ok(labelled.includes('North') && labelled.includes(SUBSTATION), labelled);
    assert.equal(areaLabel({ key: 'north', name: 'North', boundary: null }, t), 'North');
    assert.equal(areaLabel({ key: 'north', name: '' }, t), 'north');
  });

  test(`${locale}: the confirm step names an area by its label, and falls back to the key`, () => {
    const areas = [
      { key: 'north', name: 'North', boundary: { source: 'gse_cabine_primarie', id: SUBSTATION } },
      { key: 'south', name: 'South', boundary: null },
    ];
    assert.equal(areaKeyLabel(areas, 'north', t), areaLabel(areas[0], t));
    assert.equal(areaKeyLabel(areas, 'south', t), 'South');
    assert.equal(areaKeyLabel(areas, 'retired', t), 'retired');
    assert.equal(areaKeyLabel([], null, t), '');
  });

  test(`${locale}: an unknown code is shown raw`, () => {
    const message = profileOutcomeMessage({ status: 422, code: 'a_registry_code_nobody_knows', press: 'edit' }, t);
    assert.ok(message.text.includes('a_registry_code_nobody_knows'), message.text);
    assert.equal(message.tone, 'error');
  });
}

test('the code comes from the answer, never from its message', () => {
  assert.equal(profileCodeOf(409, { detail: { code: 'role_read_only' } }), 'role_read_only');
  assert.equal(profileCodeOf(403, { detail: 'REC admins or managers group required' }), 'forbidden');
  // FastAPI's own validation answer, e.g. a key the route does not take.
  assert.equal(profileCodeOf(422, { detail: [{ loc: ['body', 'status'], msg: 'x' }] }), 'invalid_input');
  assert.equal(profileCodeOf(500, null), 'http_500');
});

// --- What the dialog may change (D30) ----------------------------------------

test('only consumer and prosumer are editable roles; producer, operator and admin are read-only', () => {
  assert.deepEqual([...EDITABLE_ROLES], ['consumer', 'prosumer']);
  for (const role of ['consumer', 'prosumer', ' Prosumer ', 'CONSUMER']) assert.ok(isRoleEditable(role), role);
  for (const role of ['producer', 'operator', 'admin', '', null, undefined]) assert.ok(!isRoleEditable(role), String(role));
});

test('only what changed is in the changes, and nothing changed is nothing', () => {
  const member = { role: 'consumer', area: 'north' };
  assert.deepEqual(profileChanges(member, { role: 'consumer', area: 'north' }), {});
  assert.deepEqual(profileChanges(member, { role: 'prosumer', area: 'north' }), { role: 'prosumer' });
  assert.deepEqual(profileChanges(member, { role: 'consumer', area: 'south' }), { area: 'south' });
  assert.deepEqual(profileChanges(member, { role: 'prosumer', area: 'south' }), { role: 'prosumer', area: 'south' });
  // The role compares as the BFF compares it.
  assert.deepEqual(profileChanges({ role: ' Consumer ', area: 'north' }, { role: 'consumer', area: 'north' }), {});
  // A blank area is not a change.
  assert.deepEqual(profileChanges(member, { role: 'consumer', area: '  ' }), {});
});

test("a producer's role is never sent, but their area is", () => {
  for (const role of ['producer', 'operator', 'admin']) {
    const member = { role, area: 'north' };
    assert.deepEqual(profileChanges(member, { role: 'prosumer', area: 'north' }), {}, role);
    assert.deepEqual(profileChanges(member, { role: 'consumer', area: 'south' }), { area: 'south' }, role);
  }
  // Nor is a role outside the two, whoever the member is.
  assert.deepEqual(profileChanges({ role: 'consumer', area: 'north' }, { role: 'producer', area: 'north' }), {});
});

test('the warning covers each changed field, then the full refresh, and nothing when nothing changed', () => {
  assert.deepEqual(warningKeys({}), []);
  assert.deepEqual(warningKeys({ role: 'prosumer' }), ['members.profile.warning_role', 'members.profile.warning_refresh']);
  assert.deepEqual(warningKeys({ area: 'south' }), ['members.profile.warning_area', 'members.profile.warning_refresh']);
  assert.deepEqual(warningKeys({ role: 'consumer', area: 'south' }), [
    'members.profile.warning_role',
    'members.profile.warning_area',
    'members.profile.warning_refresh',
  ]);
});

test("the area select keeps the member's current area when the registry no longer lists it", () => {
  const areas = [{ key: 'north', name: 'North', boundary: null }];
  assert.deepEqual(areaOptions(areas, 'north'), areas);
  assert.deepEqual(areaOptions(areas, 'retired').map((area) => area.key), ['retired', 'north']);
  assert.deepEqual(areaOptions(areas, ''), areas);
});

// --- The requests ------------------------------------------------------------

test('a save PATCHes the member with only the changed fields', async () => {
  const calls = stubFetch({
    status: 200,
    body: { outcome: 'updated', memberKey: 'ex-00001', role: 'prosumer', area: 'north', changed: ['role'] },
  });
  const outcome = await editMemberProfile('example-rec', 'ex-00001', { role: 'prosumer' });

  assert.deepEqual(outcome, { status: 200, code: 'updated', press: 'edit', role: 'prosumer', area: 'north', changed: ['role'] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, MEMBER_URL);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[0].init.body), { role: 'prosumer' });
});

test('an area change sends the area alone, and an unchanged answer is read as such', async () => {
  const calls = stubFetch({
    status: 200,
    body: { outcome: 'unchanged', memberKey: 'ex-00001', role: 'consumer', area: 'south', changed: [] },
  });
  const outcome = await editMemberProfile('example-rec', 'ex-00001', { area: 'south' });

  assert.equal(outcome.code, 'unchanged');
  assert.deepEqual(outcome.changed, []);
  assert.deepEqual(JSON.parse(calls[0].init.body), { area: 'south' });
});

test('nothing changed sends nothing', async () => {
  const calls = stubFetch({ status: 200, body: {} });
  assert.deepEqual(await editMemberProfile('example-rec', 'ex-00001', {}), { status: 422, code: 'profile_empty', press: 'edit' });
  assert.equal(calls.length, 0);
});

test('refusals resolve with their code', async () => {
  const cases = [
    [{ status: 409, body: { detail: { code: 'role_read_only' } } }, 409, 'role_read_only'],
    [{ status: 422, body: { detail: { code: 'role_not_allowed' } } }, 422, 'role_not_allowed'],
    [{ status: 422, body: { detail: { code: 'unknown_area' } } }, 422, 'unknown_area'],
    [{ status: 422, body: { detail: { code: 'invalid_role' } } }, 422, 'invalid_role'],
    [{ status: 422, body: { detail: { code: 'profile_rejected' } } }, 422, 'profile_rejected'],
    [{ status: 404, body: { detail: { code: 'member_not_found' } } }, 404, 'member_not_found'],
    [{ status: 502, body: { detail: { code: 'registry_unavailable' } } }, 502, 'registry_unavailable'],
    [{ status: 502, body: { detail: { code: 'registry_refused' } } }, 502, 'registry_refused'],
    [{ status: 503, body: { detail: { code: 'profile_writes_not_configured' } } }, 503, 'profile_writes_not_configured'],
    [{ status: 422, body: { detail: [{ msg: 'extra key' }] } }, 422, 'invalid_input'],
    [{ status: 403, body: { detail: 'REC admins or managers group required' } }, 403, 'forbidden'],
    [new TypeError('offline'), 0, 'network_error'],
  ];
  for (const [answer, status, code] of cases) {
    stubFetch(answer);
    assert.deepEqual(await editMemberProfile('example-rec', 'ex-00001', { area: 'south' }), { status, code, press: 'edit' });
  }
});

test("the areas are read from the REC's areas route", async () => {
  const areas = [
    { key: 'north', name: 'North', boundary: { source: 'gse_cabine_primarie', id: SUBSTATION } },
    { key: 'south', name: 'South', boundary: null },
  ];
  const calls = stubFetch({ status: 200, body: { communityKey: 'example-rec', areas } });

  assert.deepEqual(await getCommunityAreas('example-rec'), { ok: true, areas });
  assert.equal(calls[0].url, AREAS_URL);
  assert.equal(calls[0].init.method, undefined);

  for (const [answer, code] of [
    [{ status: 404, body: { detail: { code: 'community_not_found' } } }, 'community_not_found'],
    [{ status: 502, body: { detail: { code: 'registry_unavailable' } } }, 'registry_unavailable'],
    [new TypeError('offline'), 'network_error'],
  ]) {
    stubFetch(answer);
    const result = await getCommunityAreas('example-rec');
    assert.equal(result.ok, false);
    assert.equal(result.outcome.code, code);
    assert.equal(result.outcome.press, 'areas');
  }
});

test('a 401 leaves for sign-in', async () => {
  stubFetch({ status: 401 });
  const pending = editMemberProfile('example-rec', 'ex-00001', { role: 'prosumer' });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(globalThis.window.location.href, /^\/oauth2\/sign_in\?rd=/);
  assert.equal(await Promise.race([pending.then(() => 'resolved'), Promise.resolve('pending')]), 'pending');
});

// --- The page ----------------------------------------------------------------

test('the dashboard knows members.edit and its api exposes the profile and areas calls', async () => {
  const api = await read('src/lib/api.ts');
  const client = await read('src/lib/memberProfile.ts');

  assert.match(api, /\| 'members\.edit'/);
  assert.match(api, /export \{[\s\S]*?editMemberProfile,[\s\S]*?getCommunityAreas,[\s\S]*?\} from '\.\/memberProfile'/);
  // The general member route, and nothing beneath it.
  assert.match(client, /\/members\/\$\{encodeURIComponent\(memberKey\)\}`/);
  assert.match(client, /\/areas`/);
});

test('the edit action exists only with members.edit', async () => {
  const page = await read(PAGE);

  assert.match(page, /includes\('members\.edit'\)/);
  assert.match(page, /\{#if canEdit\}\s*<span class="buttons"[^>]*>\s*<button[^>]*onclick=\{\(\) => openEdit\(member\)\}/);
  assert.equal(page.match(/openEdit\(member\)/g)?.length, 1);
  // The actions column appears for either capability.
  assert.match(page, /\{#if canInvite \|\| canEdit\}<th>/);
});

test('edit confirmation is the decision, the warning is shown before it, and one press is in flight', async () => {
  const page = await read(PAGE);
  const dialog = dialogOf(page);

  assert.ok(dialog);
  assert.equal(page.match(/editMemberProfile\(community/g)?.length, 1);
  assert.match(page, /async function confirmEdit\(\)[\s\S]*?editMemberProfile\(community/);
  for (const fn of ['askSave', 'openEdit']) {
    const body = page.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n  \\}`))?.[0] ?? '';
    assert.ok(body, fn);
    assert.doesNotMatch(body, /editMemberProfile/, fn);
  }
  assert.match(page, /if \(!community \|\| !member \|\| !changes \|\| editBusy\) return;/);
  // The confirm step shows the warning for what changes, then the confirm button.
  const confirm = dialog.match(/\{#if editConfirm\}[\s\S]*?\{:else\}/)?.[0] ?? '';
  assert.match(confirm, /warningKeys\(editConfirm\)/);
  assert.ok(confirm.indexOf('warningKeys') < confirm.indexOf('onclick={confirmEdit}'));
  // Save is disabled with nothing changed.
  assert.match(dialog, /disabled=\{editBusy \|\| !hasDraftChanges\}/);
});

test('the role select offers consumer and prosumer, and any other role is read-only', async () => {
  const dialog = dialogOf(await read(PAGE));

  assert.match(dialog, /\{#if isRoleEditable\(editFor\.role\)\}\s*<label>[\s\S]*?<select bind:value=\{draftRole\}>\{#each EDITABLE_ROLES as value\}/);
  assert.match(dialog, /\{:else\}\s*<div class="read-only">[\s\S]*?role_read_only_hint/);
  assert.doesNotMatch(dialog, /<option[^>]*>\s*producer/i);
});

test("the area select lists the REC's areas, each with its substation", async () => {
  const page = await read(PAGE);
  const dialog = dialogOf(page);

  assert.match(page, /getCommunityAreas\(community\.key\)/);
  assert.match(dialog, /<select bind:value=\{draftArea\}/);
  assert.match(dialog, /areaOptions\(editAreas, editFor\.area\)[\s\S]*?areaLabel\(area/);
});

test('the confirm step shows area names, not keys', async () => {
  const dialog = dialogOf(await read(PAGE));
  const line = dialog.match(/\{#if editConfirm\.area !== undefined\}[\s\S]*?\{\/if\}/)?.[0] ?? '';

  assert.match(line, /members\.profile\.change_area/);
  assert.match(line, /from: areaKeyLabel\(editAreas, editFor\.area,/);
  assert.match(line, /to: areaKeyLabel\(editAreas, editConfirm\.area,/);
});

test('D45: the meter action opens for every member who may hold a meter; attach is offered only to active members', async () => {
  const page = await read(PAGE);

  assert.match(page, /function openMeter\(member: MemberSummary\) \{[\s\S]*?if \(meterBusy \|\| !meterAccess\(member\)\.open\) return;/);
  assert.match(page, /disabled=\{meterBusy \|\| !access\.open\}[^>]*onclick=\{\(\) => openMeter\(member\)\}>\{\$_\(access\.label\)\}/);
  // The attach form exists only when the member is active; detach stays in the list of meters.
  assert.match(page, /\{#if meterAttach\}\s*<form class="attach"/);
  assert.match(page, /function askAttach\(\) \{\s*if \(meterBusy \|\| !meterAttach\) return;/);
  const list = page.match(/\{#each meterList as meter\}[\s\S]*?\{\/each\}/)?.[0] ?? '';
  assert.match(list, /askDetach\(meter\)/);
  assert.doesNotMatch(list, /meterAttach|status/);
  for (const locale of LOCALES) {
    assert.match(bundles[locale]['members.meter.inactive_reason'], /\{status\}/, locale);
    assert.match(bundles[locale]['members.meter.attach_inactive'], /\{status\}/, locale);
    assert.ok(bundles[locale]['members.meter.open_detach'], locale);
  }
});

test('D45: Edit is offered only for active members, and says why otherwise', async () => {
  const page = await read(PAGE);

  assert.match(page, /function openEdit\(member: MemberSummary\) \{[\s\S]*?if \(editBusy \|\| !canEditMember\(member\.status\)\) return;/);
  assert.match(page, /disabled=\{editBusy \|\| !canEditMember\(member\.status\)\} onclick=\{\(\) => openEdit\(member\)\}/);
  assert.match(page, /members\.profile\.inactive_reason/);
  for (const locale of LOCALES) {
    assert.match(bundles[locale]['members.profile.inactive_reason'], /\{status\}/, locale);
  }
});

test('D45: only an active member is editable', () => {
  assert.ok(canEditMember('active'));
  assert.ok(canEditMember(' Active '));
  for (const status of ['pending', 'suspended', 'inactive', '', null, undefined]) {
    assert.ok(!canEditMember(status), String(status));
  }
});

test('D45: the BFF refusing an edit of a member who is not active reads as its own sentence', async () => {
  stubFetch({ status: 409, body: { detail: { code: 'member_not_active' } } });
  const outcome = await editMemberProfile('example-rec', 'ex-00001', { area: 'south' });
  assert.deepEqual(outcome, { status: 409, code: 'member_not_active', press: 'edit' });
  for (const locale of LOCALES) {
    const message = profileOutcomeMessage(outcome, translator(locale));
    assert.equal(message.text, bundles[locale]['members.profile.outcome.member_not_active'], locale);
    assert.equal(message.tone, 'error');
    assert.equal(message.retry, false);
  }
});

test('the area select shows the primary substation the BFF names, else the boundary id', () => {
  const t = translator('en');
  const other = 'AC000E00002';
  assert.equal(areaSubstation({ key: 'north', name: 'North', primarySubstation: SUBSTATION, boundary: null }), SUBSTATION);
  assert.equal(
    areaSubstation({ key: 'north', name: 'North', primarySubstation: SUBSTATION, boundary: { source: 'gse_cabine_primarie', id: other } }),
    SUBSTATION,
  );
  assert.equal(areaSubstation({ key: 'north', name: 'North', primarySubstation: null, boundary: { source: 'gse_cabine_primarie', id: other } }), other);
  assert.equal(areaSubstation({ key: 'north', name: 'North', primarySubstation: null, boundary: null }), null);
  const label = areaLabel({ key: 'north', name: 'North', primarySubstation: SUBSTATION }, t);
  assert.ok(label.includes('North') && label.includes(SUBSTATION), label);
});

test('the edit dialog shows the read-only area map beside the select, following the selected area', async () => {
  const dialog = dialogOf(await read(PAGE));
  const form = dialog.match(/<form class="profile"[\s\S]*?<\/form>/)?.[0] ?? '';
  assert.match(form, /<AreaMap communityKey=\{\$communityStore\.key\} selected=\{draftArea\} \/>/);
  assert.ok(form.indexOf('bind:value={draftArea}') < form.indexOf('<AreaMap'));
});

test('the edit dialog stores nothing in the browser', async () => {
  const page = await read(PAGE);
  const client = await read('src/lib/memberProfile.ts');
  const code = (source) => source.replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const [name, source] of [['page', page], ['client', client]]) {
    assert.doesNotMatch(code(source), /localStorage|sessionStorage|indexedDB|document\.cookie/, name);
  }
});
