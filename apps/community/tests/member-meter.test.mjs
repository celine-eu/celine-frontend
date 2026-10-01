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
  defaultPod,
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

// Fixture ids, never real ones.
const SENSOR = 'ex-sensor-00001';
const POD = 'IT001E00000001';
const OTHER_POD = 'IT001E00000002';
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
  assert.doesNotMatch(outsideDialog, /sensorId|sensorInput|meterList|meterConfirm|podList|podChoice|meter\.pod|point\.id/);
  assert.match(outsideDialog, /meterFlag\(member\)/);
  // Closing the dialog clears what was typed and read.
  const close = page.match(/function closeMeter\(\)[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(close, /meterList = \[\];/);
  assert.match(close, /podList = null;/);
  assert.match(close, /podChoice = '';/);
  assert.match(close, /sensorInput = '';/);
  assert.match(close, /meterConfirm = null;/);
});

test('M7: the Measurements column says yes, no or unknown for the POD and the meter, in every locale', async () => {
  for (const locale of LOCALES) {
    for (const key of [
      'members.measurements',
      'members.measurements_delivery_point',
      'members.measurements_meter',
      'members.has_meter_yes',
      'members.has_meter_no',
      'members.has_meter_unknown',
      'members.has_meter_unknown_hint',
      'members.has_delivery_point_unknown_hint',
    ]) {
      assert.ok(bundles[locale][key], `${locale} ${key}`);
    }
    assert.notEqual(bundles[locale]['members.has_meter_yes'], bundles[locale]['members.has_meter_unknown']);
  }
  assert.equal(bundles.it['members.measurements'], 'Misure');
  assert.equal(bundles.es['members.measurements'], 'Medidas');
  const page = await read(PAGE);
  assert.match(page, /<th>\{\$_\('members\.measurements'\)\}<\/th>/);
  assert.match(page, /member\.hasMeter === true[\s\S]*?member\.hasMeter === false[\s\S]*?has_meter_unknown/);
  assert.match(page, /member\.hasDeliveryPoint === true[\s\S]*?member\.hasDeliveryPoint === false[\s\S]*?has_meter_unknown/);
  assert.match(page, /deliveryPointFlag\(member\)/);
});

test('M3, D45: every member can be reviewed; only an active member can be given a meter', () => {
  for (const hasMeter of [true, false, null]) {
    assert.deepEqual(meterAccess({ status: 'active', hasMeter }), { open: true, attach: true, label: 'members.meter.open' });
  }
  for (const status of ['pending', 'suspended', 'inactive']) {
    // The dialog opens to review the POD and free a meter, but offers no attach.
    for (const hasMeter of [true, false, null]) {
      assert.deepEqual(meterAccess({ status, hasMeter }), { open: true, attach: false, label: 'members.meter.open' }, status);
    }
  }
});

test('M1: the button and the dialog say Measurements, and no locale says contatore, contador or smart meter', () => {
  assert.equal(bundles.it['members.meter.open'], 'Misure');
  assert.equal(bundles.en['members.meter.open'], 'Measurements');
  assert.equal(bundles.es['members.meter.open'], 'Medidas');
  assert.equal(bundles.it['members.meter.dialog_title'], 'Misure di {member}');
  assert.equal(bundles.it['members.meter.delivery_points'], 'Punto di prelievo (POD)');
  assert.equal(bundles.es['members.meter.delivery_points'], 'Punto de suministro (POD)');
  assert.equal(bundles.en['members.meter.delivery_points'], 'Delivery point (POD)');
  assert.equal(bundles.it['members.meter.current'], 'Misuratore');
  assert.equal(bundles.es['members.meter.current'], 'Medidor');
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(bundles[locale])) {
      assert.doesNotMatch(value, /contator|contador|smart[ -]?meter/i, `${locale} ${key}`);
    }
    for (const key of ['members.meter.open_attach', 'members.meter.open_manage', 'members.meter.open_detach', 'members.has_meter']) {
      assert.equal(bundles[locale][key], undefined, `${locale} ${key} is gone`);
    }
  }
});

test('M2: the device wording on the overview, the devices page and the alert source says meter', () => {
  assert.equal(bundles.it['overview.meters'], 'Stato misuratori');
  assert.equal(bundles.it['devices.meter_status'], 'Stato misuratore');
  assert.equal(bundles.it['alert_source.meter-health'], 'Misuratori');
  assert.equal(bundles.it['population.unregistered'], 'Misuratori non registrati');
  assert.equal(bundles.es['overview.meters'], 'Estado de medidores');
  assert.equal(bundles.es['alert_source.meter-health'], 'Medidores');
});

test('M2 (requester, 2026-10-01): the pages that show IoT meters call them meters, in every locale', async () => {
  const expected = {
    'nav.devices': ['Misuratori', 'Meters', 'Medidores'],
    'devices.title': ['Misuratori della comunità', 'Community meters', 'Medidores de la comunidad'],
    'population.devices': ['Misuratori monitorati', 'Monitored meters', 'Medidores monitorizados'],
    'devices.meter_id': ['ID misuratore', 'Meter ID', 'ID de medidor'],
  };
  for (const [key, values] of Object.entries(expected)) {
    ['it', 'en', 'es'].forEach((locale, index) => assert.equal(bundles[locale][key], values[index], `${locale} ${key}`));
  }
  // The devices page, its overview card and the navigation carry no "device" word for the meter.
  const pageKeys = Object.keys(bundles.en).filter(
    (key) => key === 'nav.devices' || key === 'population.devices' || key.startsWith('devices.') || key.startsWith('device_engagement.'),
  );
  for (const locale of LOCALES) {
    for (const key of pageKeys) {
      // `device_id` is the technical field the privacy note names, not UI wording.
      const text = bundles[locale][key].replace(/device_id/g, '');
      assert.doesNotMatch(text, /\bdevices?\b|dispositiv/i, `${locale} ${key}`);
    }
  }
  const devices = await read('src/routes/[community]/devices/+page.svelte');
  assert.doesNotMatch(devices, />Device ID</);
  assert.equal(devices.match(/\$_\('devices\.meter_id'\)/g)?.length, 2);
  // The route path stays `/devices`; only its label changes.
  const layout = await read('src/routes/[community]/+layout.svelte');
  assert.match(layout, /path: '\/devices', label: 'nav\.devices'/);
});

test('M5: the only POD of a member is preselected; with none or several, none is', () => {
  assert.equal(defaultPod([{ id: POD, active: true }]), POD);
  assert.equal(defaultPod([]), null);
  assert.equal(defaultPod([{ id: POD, active: true }, { id: OTHER_POD, active: true }]), null);
  assert.equal(defaultPod(undefined), null);
});

test('M5: an attach with a POD sends it as chosen; "none" sends no pod', async () => {
  let calls = stubFetch({ status: 201, body: { outcome: 'attached', sensorId: SENSOR, meterType: 'consumption' } });
  await attachMeter('example-rec', 'ex-00001', SENSOR, 'consumption', POD);
  assert.deepEqual(JSON.parse(calls[0].init.body), { sensorId: SENSOR, meterType: 'consumption', pod: POD });
  assert.ok(!calls[0].url.includes(POD));

  for (const none of [null, undefined, '']) {
    calls = stubFetch({ status: 201, body: { outcome: 'attached' } });
    await attachMeter('example-rec', 'ex-00001', SENSOR, 'consumption', none);
    assert.deepEqual(JSON.parse(calls[0].init.body), { sensorId: SENSOR, meterType: 'consumption' }, String(none));
  }
});

test('M6: a POD the member does not hold reads as its own sentence, naming no POD', async () => {
  stubFetch({ status: 422, body: { detail: { code: 'pod_not_held' } } });
  const outcome = await attachMeter('example-rec', 'ex-00001', SENSOR, 'consumption', OTHER_POD);
  assert.deepEqual(outcome, { status: 422, code: 'pod_not_held', press: 'attach' });
  for (const locale of LOCALES) {
    const message = meterOutcomeMessage(outcome, translator(locale));
    assert.equal(message.text, bundles[locale]['members.meter.outcome.pod_not_held'], locale);
    assert.doesNotMatch(message.text, /\{\w+\}/, locale);
    assert.ok(!message.text.includes(OTHER_POD), locale);
    assert.equal(message.tone, 'error');
    assert.equal(message.retry, false);
  }
});

test("M3: the dialog's read carries the member's PODs and each meter's link", async () => {
  const read = {
    memberKey: 'ex-00001',
    defaultMeterType: 'consumption',
    deliveryPoints: [{ id: POD, active: true }],
    meters: [{ sensorId: SENSOR, meterType: 'consumption', pod: POD }],
  };
  stubFetch({ status: 200, body: read });
  assert.deepEqual(await getMemberMeters('example-rec', 'ex-00001'), { ok: true, meters: read });
});

test('M3, M9: the POD section is read-only, independent of the meters, and hidden when the BFF sends none', async () => {
  const page = await read(PAGE);
  const dialog = page.match(/\{#if meterFor\}[\s\S]*?\n\{\/if\}/)?.[0] ?? '';

  // Shown only when the BFF sent delivery points; a BFF without them leaves `podList` null.
  assert.match(page, /podList = read\.meters\.deliveryPoints \?\? null;/);
  const section = dialog.match(/\{#if podList\}\s*<h3>\{\$_\('members\.meter\.delivery_points'\)\}<\/h3>[\s\S]*?\n {10}\{\/if\}/)?.[0] ?? '';
  assert.ok(section, 'POD section');
  // POD only: the empty sentence points to onboarding (M9); the section shows ids and nothing to press.
  assert.match(section, /members\.meter\.delivery_points_none/);
  assert.doesNotMatch(section, /<button|<input|<select|onclick/);
  // The meter section follows, whether or not there is a POD.
  assert.match(dialog, /\{\/if\}\s*<h3>\{\$_\('members\.meter\.current'\)\}<\/h3>\s*\{#if meterList\.length === 0\}/);
  // POD + meter: each meter shows its linked POD, or that it has none.
  const list = dialog.match(/\{#each meterList as meter\}[\s\S]*?\{\/each\}/)?.[0] ?? '';
  assert.match(list, /meter\.pod[\s\S]*?members\.meter\.no_linked_pod/);
  for (const locale of LOCALES) {
    assert.match(bundles[locale]['members.meter.delivery_points_none'], /onboarding/i, locale);
    assert.ok(bundles[locale]['members.meter.none'], locale);
  }
});

test('M5: the attach form offers the POD select with "none", preselected from the only POD', async () => {
  const page = await read(PAGE);
  const form = page.match(/<form class="attach"[\s\S]*?<\/form>/)?.[0] ?? '';

  assert.match(form, /\{#if podList && podList\.length > 0\}[\s\S]*?<select bind:value=\{podChoice\}><option value="">\{\$_\('members\.meter\.pod_option_none'\)\}<\/option>\{#each podList as point\}/);
  assert.match(page, /podChoice = defaultPod\(podList\) \?\? '';/);
  assert.match(page, /meterConfirm = \{ press: 'attach', sensorId, meterType, pod: podChoice \|\| null \};/);
  assert.match(page, /attachMeter\(community\.key, member\.key, request\.sensorId, request\.meterType, request\.pod\)/);
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
