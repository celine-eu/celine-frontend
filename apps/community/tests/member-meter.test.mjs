import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';

// Node strips the types; the module has no Svelte or `$lib` import on purpose.
import {
  METER_CODES,
  METER_TYPES,
  SENSOR_ID_MAX_LENGTH,
  attachMeter,
  defaultMeterType,
  detachMeter,
  getMemberMeters,
  meterAccess,
  meterCodeOf,
  meterOutcomeMessage,
  normalizeSensorId,
} from '../src/lib/memberMeter.ts';

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

// A fixture id, never a real one.
const SENSOR = 'ex-sensor-00001';
const METER_URL = '/api/communities/example-rec/members/ex-00001/meter';

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

for (const locale of LOCALES) {
  const t = translator(locale);

  test(`${locale}: every code the BFF can answer a meter press with reads as a sentence`, () => {
    for (const code of METER_CODES) {
      const message = meterOutcomeMessage({ status: 409, code, press: 'attach' }, t);
      assert.doesNotMatch(message.text, /^members\./, `${locale} ${code}`);
      assert.doesNotMatch(message.text, /\{\w+\}/, `${locale} ${code} left a placeholder`);
    }
  });

  test(`${locale}: sensor_held says another member holds it and names nobody`, () => {
    const template = bundles[locale]['members.meter.outcome.sensor_held'];
    // No placeholder: there is nothing to fill a member, community or id into.
    assert.doesNotMatch(template, /\{\w+\}/);
    const message = meterOutcomeMessage({ status: 409, code: 'sensor_held', press: 'attach' }, t);
    assert.equal(message.text, template);
    assert.equal(message.retry, false);
    assert.notEqual(message.tone, 'success');
  });

  test(`${locale}: attached, already attached and an outage read differently`, () => {
    const text = (code, status) => meterOutcomeMessage({ status, code, press: 'attach' }, t);
    const attached = text('attached', 201);
    const already = text('already_attached', 200);
    const outage = text('registry_unavailable', 502);
    assert.equal(attached.tone, 'success');
    assert.equal(already.tone, 'warning');
    assert.equal(outage.tone, 'error');
    assert.equal(outage.retry, true);
    assert.equal(new Set([attached.text, already.text, outage.text]).size, 3);
    // A missing grant is the deployment's fault, not the manager's.
    assert.notEqual(text('registry_refused', 502).text, text('forbidden', 403).text);
  });

  test(`${locale}: every meter type has a label`, () => {
    for (const type of METER_TYPES) {
      assert.ok(bundles[locale][`members.meter.type.${type}`], `${locale} ${type}`);
    }
  });

  test(`${locale}: an unknown code is shown raw`, () => {
    const message = meterOutcomeMessage({ status: 422, code: 'a_registry_code_nobody_knows', press: 'attach' }, t);
    assert.ok(message.text.includes('a_registry_code_nobody_knows'), message.text);
    assert.equal(message.tone, 'error');
  });
}

test('the meter type defaults from the role: prosumer is bidirectional, anything else consumption', () => {
  assert.equal(defaultMeterType('prosumer'), 'bidirectional');
  assert.equal(defaultMeterType(' Prosumer '), 'bidirectional');
  for (const role of ['consumer', 'producer', 'operator', '', null, undefined]) {
    assert.equal(defaultMeterType(role), 'consumption', String(role));
  }
});

test('the sensor id is trimmed, and a blank one is nothing', () => {
  assert.equal(normalizeSensorId(`  ${SENSOR}\t`), SENSOR);
  assert.equal(normalizeSensorId('   '), null);
  assert.equal(normalizeSensorId(''), null);
});

test('the code comes from the answer, never from its message', () => {
  assert.equal(meterCodeOf(409, { detail: { code: 'sensor_held' } }), 'sensor_held');
  assert.equal(meterCodeOf(403, { detail: 'REC admins or managers group required' }), 'forbidden');
  // FastAPI's own validation answer, e.g. an unknown meter type.
  assert.equal(meterCodeOf(422, { detail: [{ loc: ['body', 'meterType'], msg: 'x' }] }), 'invalid_input');
  assert.equal(meterCodeOf(500, null), 'http_500');
});

test('an attach PUTs the typed id in the body, never in the URL, and reads the outcome', async () => {
  const calls = stubFetch({ status: 201, body: { outcome: 'attached', sensorId: SENSOR, meterType: 'bidirectional' } });
  const outcome = await attachMeter('example-rec', 'ex-00001', SENSOR, 'bidirectional');

  assert.deepEqual(outcome, { status: 201, code: 'attached', press: 'attach', meterType: 'bidirectional' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, METER_URL);
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.credentials, 'include');
  assert.deepEqual(JSON.parse(calls[0].init.body), { sensorId: SENSOR, meterType: 'bidirectional' });
  assert.ok(!calls[0].url.includes(SENSOR));
  // The outcome the page keeps carries no sensor id.
  assert.ok(!JSON.stringify(outcome).includes(SENSOR));
});

test('the same id again is already attached, and a type left to the BFF is not sent', async () => {
  const calls = stubFetch({ status: 200, body: { outcome: 'already_attached', sensorId: SENSOR, meterType: 'consumption' } });
  const outcome = await attachMeter('example-rec', 'ex-00001', SENSOR);

  assert.equal(outcome.code, 'already_attached');
  assert.equal(outcome.meterType, 'consumption');
  assert.deepEqual(JSON.parse(calls[0].init.body), { sensorId: SENSOR });
});

test('refusals resolve with their code: held, outage, validation, not configured, network', async () => {
  const cases = [
    [{ status: 409, body: { detail: { code: 'sensor_held' } } }, 409, 'sensor_held'],
    [{ status: 502, body: { detail: { code: 'registry_unavailable' } } }, 502, 'registry_unavailable'],
    [{ status: 502, body: { detail: { code: 'registry_refused' } } }, 502, 'registry_refused'],
    [{ status: 422, body: { detail: { code: 'sensor_id_blank' } } }, 422, 'sensor_id_blank'],
    [{ status: 422, body: { detail: [{ msg: 'bad meterType' }] } }, 422, 'invalid_input'],
    [{ status: 503, body: { detail: { code: 'meter_writes_not_configured' } } }, 503, 'meter_writes_not_configured'],
    [{ status: 403, body: { detail: 'REC admins or managers group required' } }, 403, 'forbidden'],
    [new TypeError('offline'), 0, 'network_error'],
  ];
  for (const [answer, status, code] of cases) {
    stubFetch(answer);
    assert.deepEqual(await attachMeter('example-rec', 'ex-00001', SENSOR), { status, code, press: 'attach' });
  }
});

test('a detach DELETEs with the id in the body, and 204 is detached', async () => {
  const calls = stubFetch({ status: 204 });
  const outcome = await detachMeter('example-rec', 'ex-00001', SENSOR);

  assert.deepEqual(outcome, { status: 204, code: 'detached', press: 'detach' });
  assert.equal(calls[0].url, METER_URL);
  assert.equal(calls[0].init.method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[0].init.body), { sensorId: SENSOR });

  stubFetch({ status: 404, body: { detail: { code: 'meter_not_found' } } });
  assert.equal((await detachMeter('example-rec', 'ex-00001', SENSOR)).code, 'meter_not_found');
});

test("the dialog reads that one member's meters, and the browser's HTTP cache does not keep them", async () => {
  const meters = { memberKey: 'ex-00001', defaultMeterType: 'consumption', meters: [{ sensorId: SENSOR, meterType: 'consumption' }] };
  const calls = stubFetch({ status: 200, body: meters });

  assert.deepEqual(await getMemberMeters('example-rec', 'ex-00001'), { ok: true, meters });
  assert.equal(calls[0].url, METER_URL);
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.cache, 'no-store');

  stubFetch({ status: 502, body: { detail: { code: 'registry_unavailable' } } });
  assert.deepEqual(await getMemberMeters('example-rec', 'ex-00001'), {
    ok: false,
    outcome: { status: 502, code: 'registry_unavailable', press: 'read' },
  });
});

test('every meter request asks the browser not to cache, and a 401 leaves for sign-in', async () => {
  let calls = stubFetch({ status: 201, body: { outcome: 'attached' } });
  await attachMeter('example-rec', 'ex-00001', SENSOR);
  calls = [...calls, ...stubFetch({ status: 204 })];
  await detachMeter('example-rec', 'ex-00001', SENSOR);
  for (const call of calls) assert.equal(call.init.cache, 'no-store');

  stubFetch({ status: 401 });
  const pending = attachMeter('example-rec', 'ex-00001', SENSOR);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(globalThis.window.location.href, /^\/oauth2\/sign_in\?rd=/);
  // It never resolves: the page is leaving.
  assert.equal(await Promise.race([pending.then(() => 'resolved'), Promise.resolve('pending')]), 'pending');
});

test('the dashboard knows members.meter and its api exposes only the member meter route', async () => {
  const api = await read('src/lib/api.ts');
  const client = await read('src/lib/memberMeter.ts');

  assert.match(api, /\| 'members\.meter'/);
  assert.match(api, /export \{[\s\S]*?attachMeter,[\s\S]*?detachMeter,[\s\S]*?getMemberMeters,[\s\S]*?\} from '\.\/memberMeter'/);
  assert.match(api, /hasMeter\?: boolean \| null;/);
  // One route, `/members/{key}/meter`; no sensor id in any URL the client builds.
  assert.match(client, /\/members\/\$\{encodeURIComponent\(memberKey\)\}\/meter`/);
  assert.doesNotMatch(client, /`[^`]*\$\{sensorId\}[^`]*`/);
});

test('the meter action exists only with members.meter', async () => {
  const page = await read(PAGE);

  assert.match(page, /includes\('members\.meter'\)/);
  assert.match(page, /\{#if canMeter\}\s*\{@const access = meterAccess\(member\)\}\s*<button[^>]*onclick=\{\(\) => openMeter\(member\)\}/);
  assert.equal(page.match(/openMeter\(member\)/g)?.length, 1);
});

test('meter confirmation is the decision, and one press is in flight at a time', async () => {
  const page = await read(PAGE);

  // The only writes are inside the confirm handler.
  assert.equal(page.match(/attachMeter\(community/g)?.length, 1);
  assert.equal(page.match(/detachMeter\(community/g)?.length, 1);
  assert.match(page, /async function confirmMeter\(\)[\s\S]*?attachMeter\(community[\s\S]*?detachMeter\(community/);
  for (const fn of ['askAttach', 'askDetach', 'openMeter']) {
    const body = page.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n  \\}`))?.[0] ?? '';
    assert.ok(body, fn);
    assert.doesNotMatch(body, /attachMeter|detachMeter/, fn);
  }
  assert.match(page, /onclick=\{confirmMeter\}/);
  assert.match(page, /if \(!community \|\| !member \|\| !request \|\| meterBusy\) return;/);
  // A blank id is refused before any request.
  assert.match(page, /function askAttach\(\)[\s\S]*?normalizeSensorId\(sensorInput\)[\s\S]*?sensor_id_blank/);
});

test('the sensor id is typed: no picker, no suggestion list, no meter lookup (D18)', async () => {
  const page = await read(PAGE);
  const dialog = page.match(/\{#if meterFor\}[\s\S]*?\n\{\/if\}/)?.[0] ?? '';

  assert.ok(dialog);
  assert.match(dialog, /<input bind:value=\{sensorInput\}[^>]*autocomplete="off"/);
  assert.doesNotMatch(dialog, /<datalist|list=|<select bind:value=\{sensorInput\}/);
  assert.doesNotMatch(page, /getDevices|getDevice\b|getPointsLedger|rec_device_streaks|missing_intervals/);
  // The meter type is a select of the registry's vocabulary.
  assert.match(dialog, /<select bind:value=\{meterType\}>\{#each METER_TYPES as value\}/);
  assert.deepEqual([...METER_TYPES], ['consumption', 'production', 'bidirectional', 'import', 'export']);
});

test('the typed id is capped at 122 characters, so meter-<id> fits the registry key', async () => {
  const page = await read(PAGE);
  const dialog = page.match(/\{#if meterFor\}[\s\S]*?\n\{\/if\}/)?.[0] ?? '';

  assert.equal(SENSOR_ID_MAX_LENGTH, 122);
  assert.equal(`meter-${'S'.repeat(SENSOR_ID_MAX_LENGTH)}`.length, 128);
  assert.match(dialog, /<input bind:value=\{sensorInput\} maxlength=\{SENSOR_ID_MAX_LENGTH\}/);
});

test('a key the member already holds for another id, and a key too long, read as their own codes', async () => {
  for (const code of ['asset_key_taken', 'asset_key_too_long']) {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: { code } }), { status: code === 'asset_key_taken' ? 409 : 422 });
    const outcome = await attachMeter('example-rec', 'ex-00001', SENSOR);
    assert.equal(outcome.code, code);
    for (const locale of LOCALES) {
      const message = meterOutcomeMessage(outcome, translator(locale));
      assert.equal(message.tone, 'error');
      assert.equal(message.retry, false);
      assert.notEqual(message.text, `members.meter.outcome.${code}`, locale);
      assert.ok(!message.text.includes(SENSOR), locale);
    }
  }
});

test('the sensor id is never stored in the browser, and appears only in the dialog', async () => {
  const page = await read(PAGE);
  const client = await read('src/lib/memberMeter.ts');
  const code = (source) => source.replace(/\/\*\*[\s\S]*?\*\/|\/\/.*$/gm, '');

  for (const [name, source] of [['page', page], ['client', client]]) {
    assert.doesNotMatch(code(source), /localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|goto\(|searchParams/, name);
  }
  // Outside the dialog, the markup says yes or no and never shows a sensor id.
  const markup = page.slice(page.indexOf('</script>'));
  const outsideDialog = markup.replace(/\{#if meterFor\}[\s\S]*?\n\{\/if\}/, '');
  assert.doesNotMatch(outsideDialog, /sensorId|sensorInput|meterList|meterConfirm/);
  assert.match(outsideDialog, /meterFlag\(member\)/);
  // Closing the dialog clears what was typed and read.
  const close = page.match(/function closeMeter\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(close, /meterList = \[\];/);
  assert.match(close, /sensorInput = '';/);
  assert.match(close, /meterConfirm = null;/);
});

test('the list says yes, no or unknown in every locale', async () => {
  for (const locale of LOCALES) {
    for (const key of ['members.has_meter', 'members.has_meter_yes', 'members.has_meter_no', 'members.has_meter_unknown']) {
      assert.ok(bundles[locale][key], `${locale} ${key}`);
    }
    assert.notEqual(bundles[locale]['members.has_meter_yes'], bundles[locale]['members.has_meter_unknown']);
  }
  const page = await read(PAGE);
  assert.match(page, /member\.hasMeter === true[\s\S]*?member\.hasMeter === false[\s\S]*?has_meter_unknown/);
});

test('D45: an active member can be given a meter; anyone who may hold one can have it detached', () => {
  assert.deepEqual(meterAccess({ status: 'active', hasMeter: false }), { open: true, attach: true, label: 'members.meter.open_attach' });
  assert.deepEqual(meterAccess({ status: 'active', hasMeter: true }), { open: true, attach: true, label: 'members.meter.open_manage' });
  assert.deepEqual(meterAccess({ status: 'active', hasMeter: null }), { open: true, attach: true, label: 'members.meter.open_manage' });
  for (const status of ['pending', 'suspended', 'inactive']) {
    // A meter the list says they hold, or may hold, can still be freed.
    assert.deepEqual(meterAccess({ status, hasMeter: true }), { open: true, attach: false, label: 'members.meter.open_detach' }, status);
    assert.deepEqual(meterAccess({ status, hasMeter: null }), { open: true, attach: false, label: 'members.meter.open_detach' }, status);
    // Nothing to detach and nothing to attach: the button stays disabled.
    assert.equal(meterAccess({ status, hasMeter: false }).open, false, status);
  }
});

test('D45: the BFF refusing to attach to a member who is not active reads as its own sentence', async () => {
  stubFetch({ status: 409, body: { detail: { code: 'member_not_active' } } });
  const outcome = await attachMeter('example-rec', 'ex-00001', SENSOR);
  assert.equal(outcome.code, 'member_not_active');
  for (const locale of LOCALES) {
    const message = meterOutcomeMessage(outcome, translator(locale));
    assert.equal(message.text, bundles[locale]['members.meter.outcome.member_not_active'], locale);
    assert.ok(!message.text.includes(SENSOR), locale);
    assert.equal(message.retry, false);
  }
});
