import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, test } from 'node:test';

// Node strips the types; the module has no Svelte, `$lib` or `leaflet` import on purpose.
import {
  MAP_CODES,
  TILE_ATTRIBUTION,
  TILE_URL,
  areaFeatures,
  featureLabel,
  getAreaShapes,
  mapCodeOf,
  mapOutcomeMessage,
} from '../src/lib/areaMap.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const LOCALES = ['en', 'it', 'es'];
const bundles = Object.fromEntries(
  await Promise.all(
    LOCALES.map(async (locale) => [locale, JSON.parse(await read(`src/lib/i18n/${locale}.json`))]),
  ),
);
const COMPONENT = 'src/lib/components/AreaMap.svelte';
const MODULE = 'src/lib/areaMap.ts';

function translator(locale) {
  return (key, options = {}) => {
    const message = bundles[locale][key];
    if (message === undefined) return key;
    return message.replace(/\{(\w+)\}/g, (whole, name) => options.values?.[name] ?? whole);
  };
}

// Synthetic fixtures, never real ones: squares in the open sea at lat 0–0.1, lon 0–0.4,
// and placeholder substation codes.
const SHAPES_URL = '/api/communities/example-rec/areas/shapes';
const square = (lon, lat, size) => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
});
const SHAPES = {
  communityKey: 'example-rec',
  areas: [
    { areaKey: 'north', name: 'North', boundaryId: 'AC000E00001', geometry: square(0.1, 0.02, 0.05) },
    {
      areaKey: 'south',
      name: 'South',
      boundaryId: 'AC000E00002',
      geometry: { type: 'MultiPolygon', coordinates: [square(0.2, 0.03, 0.04).coordinates, square(0.26, 0.03, 0.02).coordinates] },
    },
    { areaKey: 'east', name: 'East', boundaryId: 'AC000E00003', geometry: null },
  ],
};

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

/** The source without comments, so a sentence about `leaflet` is not mistaken for code. */
const code = (source) => source.replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

// --- Codes and sentences ----------------------------------------------------

for (const locale of LOCALES) {
  const t = translator(locale);

  test(`${locale}: every code the shapes read can answer reads as a sentence`, () => {
    for (const mapCode of MAP_CODES) {
      const message = mapOutcomeMessage({ status: 502, code: mapCode }, t);
      assert.doesNotMatch(message.text, /^members\./, `${locale} ${mapCode}`);
      assert.doesNotMatch(message.text, /\{\w+\}/, `${locale} ${mapCode} left a placeholder`);
      assert.equal(message.tone, 'error');
    }
  });

  test(`${locale}: a Digital Twin outage, a refusal and no configuration read differently, and an outage can be retried`, () => {
    const text = (mapCode) => mapOutcomeMessage({ status: 502, code: mapCode }, t);
    const outage = text('digital_twin_unavailable');
    const refused = text('digital_twin_refused');
    const missing = text('digital_twin_not_configured');
    assert.equal(new Set([outage.text, refused.text, missing.text]).size, 3);
    assert.equal(outage.retry, true);
    assert.equal(refused.retry, false);
    assert.equal(missing.retry, false);
    assert.equal(text('network_error').retry, true);
  });

  test(`${locale}: the map's states, its read-only note and the tile server as a recipient are translated`, () => {
    for (const key of ['title', 'aria', 'loading', 'empty', 'missing', 'read_only']) {
      assert.ok(bundles[locale][`members.profile.map.${key}`], `${locale} ${key}`);
    }
    assert.match(bundles[locale]['members.profile.map.missing'], /\{areas\}/);
    // ADR-0001: the dashboard names the tile server as a recipient of managers' IP addresses.
    assert.match(bundles[locale]['members.profile.map.read_only'], /OpenStreetMap/);
    assert.match(bundles[locale]['members.profile.map.read_only'], /IP/);
  });

  test(`${locale}: an unknown code is shown raw`, () => {
    const message = mapOutcomeMessage({ status: 500, code: 'http_500' }, t);
    assert.ok(message.text.includes('http_500'), message.text);
  });

  test(`${locale}: an area on the map is labelled with its name and primary substation`, () => {
    const label = featureLabel({ areaKey: 'north', name: 'North', boundaryId: 'AC000E00001' }, t);
    assert.ok(label.includes('North') && label.includes('AC000E00001'), label);
  });
}

test('the code comes from the answer, never from its message', () => {
  assert.equal(mapCodeOf(502, { detail: { code: 'digital_twin_unavailable' } }), 'digital_twin_unavailable');
  assert.equal(mapCodeOf(403, { detail: 'REC admins or managers group required' }), 'forbidden');
  assert.equal(mapCodeOf(500, null), 'http_500');
});

// --- The shapes the map is given ------------------------------------------------

test("the dashboard map renders the community's shapes: one feature per area with a polygon, in order", () => {
  const { collection, missing } = areaFeatures(SHAPES.areas);

  assert.equal(collection.type, 'FeatureCollection');
  assert.deepEqual(
    collection.features.map((feature) => feature.properties),
    [
      { areaKey: 'north', name: 'North', boundaryId: 'AC000E00001' },
      { areaKey: 'south', name: 'South', boundaryId: 'AC000E00002' },
    ],
  );
  assert.equal(collection.features[0].geometry, SHAPES.areas[0].geometry);
  assert.equal(collection.features[1].geometry.type, 'MultiPolygon');
  // An area the Digital Twin has no shape for is named, not drawn.
  assert.deepEqual(missing.map((area) => area.areaKey), ['east']);
});

test('a shape that is not a polygon is not drawn, and an area without a name is labelled by its key', () => {
  const { collection, missing } = areaFeatures([
    { areaKey: 'dot', name: 'Dot', boundaryId: 'AC000E00004', geometry: { type: 'Point', coordinates: [0.1, 0.05] } },
    { areaKey: 'hollow', name: 'Hollow', boundaryId: 'AC000E00005', geometry: { type: 'Polygon', coordinates: [] } },
    { areaKey: 'unnamed', name: '  ', boundaryId: 'AC000E00006', geometry: square(0.3, 0.05, 0.03) },
  ]);
  assert.deepEqual(missing.map((area) => area.areaKey), ['dot', 'hollow']);
  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].properties.name, 'unnamed');
  assert.deepEqual(areaFeatures([]), { collection: { type: 'FeatureCollection', features: [] }, missing: [] });
});

// --- The request ------------------------------------------------------------

test("the map reads the BFF's shapes route, with a GET and the session", async () => {
  const calls = stubFetch({ status: 200, body: SHAPES });

  assert.deepEqual(await getAreaShapes('example-rec'), { ok: true, shapes: SHAPES });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SHAPES_URL);
  assert.equal(calls[0].init.method, undefined);
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.credentials, 'include');
});

test('outages and refusals resolve with their code, so the dialog keeps working', async () => {
  const cases = [
    [{ status: 502, body: { detail: { code: 'digital_twin_unavailable' } } }, 'digital_twin_unavailable'],
    [{ status: 502, body: { detail: { code: 'digital_twin_refused' } } }, 'digital_twin_refused'],
    [{ status: 503, body: { detail: { code: 'digital_twin_not_configured' } } }, 'digital_twin_not_configured'],
    [{ status: 502, body: { detail: { code: 'registry_unavailable' } } }, 'registry_unavailable'],
    [{ status: 502, body: { detail: { code: 'registry_refused' } } }, 'registry_refused'],
    [{ status: 404, body: { detail: { code: 'community_not_found' } } }, 'community_not_found'],
    [{ status: 403, body: { detail: 'REC admins or managers group required' } }, 'forbidden'],
    [{ status: 200, body: { communityKey: 'example-rec' } }, 'http_200'],
    [new TypeError('offline'), 'network_error'],
  ];
  for (const [answer, expected] of cases) {
    stubFetch(answer);
    const result = await getAreaShapes('example-rec');
    assert.equal(result.ok, false, expected);
    assert.equal(result.outcome.code, expected);
  }
});

test('a 401 leaves for sign-in', async () => {
  stubFetch({ status: 401 });
  const pending = getAreaShapes('example-rec');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.match(globalThis.window.location.href, /^\/oauth2\/sign_in\?rd=/);
  assert.equal(await Promise.race([pending.then(() => 'resolved'), Promise.resolve('pending')]), 'pending');
});

// --- The component (ADR-0001) ------------------------------------------------

test('the map uses the shapes route and draws its answer as one GeoJSON layer', async () => {
  const component = code(await read(COMPONENT));
  const client = code(await read(MODULE));

  assert.match(client, /\/areas\/shapes`/);
  assert.match(component, /getAreaShapes\(communityKey\)/);
  assert.match(component, /areaFeatures\(read\.shapes\.areas\)/);
  assert.match(component, /L\.geoJSON\(shapes/);
  assert.match(component, /fitBounds\(/);
  // The shapes are the only request: nothing else is fetched from the component.
  assert.doesNotMatch(component, /\bfetch\(/);
});

test('leaflet is imported lazily on mount, as packages/roi-ui does, and only when there is a shape to draw', async () => {
  const component = code(await read(COMPONENT));

  // Only types are imported statically; the library itself comes in with a dynamic import.
  for (const line of component.match(/^\s*import\s.*leaflet.*$/gm) ?? []) {
    assert.match(line, /^\s*import type /, line);
  }
  assert.match(component, /await import\('leaflet'\)/);
  assert.match(component, /await import\('leaflet\/dist\/leaflet\.css'\)/);
  assert.match(component, /onMount\(/);
  const mount = component.slice(component.indexOf('onMount('));
  assert.ok(mount.indexOf('features.length === 0') < mount.indexOf('await draw('), 'no shape, no map');
  assert.match(component, /\{#if phase === 'ready' && collection\}\s*<div bind:this=\{mapEl\}/);
  // The map is removed with the dialog.
  assert.match(component, /map\?\.remove\(\)/);
});

test('the tiles are OpenStreetMap with its attribution, the same source as MapPicker', async () => {
  const component = code(await read(COMPONENT));
  const picker = await readFile(new URL('../../../packages/roi-ui/src/MapPicker.svelte', import.meta.url), 'utf8');

  assert.equal(TILE_URL, 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.ok(picker.includes(`'${TILE_URL}'`), 'same tile source as roi-ui');
  assert.match(TILE_ATTRIBUTION, /OpenStreetMap/);
  assert.ok(picker.includes(`'${TILE_ATTRIBUTION}'`), 'same attribution as roi-ui');
  assert.match(component, /L\.tileLayer\(TILE_URL, \{ attribution: TILE_ATTRIBUTION/);
  // The attribution control is never switched off.
  assert.doesNotMatch(component, /attributionControl:\s*false/);
});

test('nothing on the map is edited: no drawing, no handles, no draggable shapes, no writes', async () => {
  const component = code(await read(COMPONENT));
  const client = code(await read(MODULE));

  for (const pattern of [
    /draggable/,
    /L\.marker|L\.rectangle|L\.polygon|L\.circle/,
    /\.pm\b|Draw|editable|enableEdit/,
    /\bon\(\s*'(click|mousedown|mouseup|mousemove|dblclick|drag)/,
    /addEventListener\(/,
  ]) {
    assert.doesNotMatch(component, pattern, String(pattern));
  }
  assert.doesNotMatch(client, /method:\s*'(POST|PUT|PATCH|DELETE)'/);
});

test('an area name is put on the map as text, never as HTML', async () => {
  const component = code(await read(COMPONENT));
  assert.match(component, /label\.textContent = featureLabel\(/);
  assert.doesNotMatch(component, /innerHTML|\{@html/);
});

test('a Digital Twin outage leaves a sentence in place of the map, and the dialog keeps its select', async () => {
  const component = code(await read(COMPONENT));
  assert.match(component, /failure = mapOutcomeMessage\(read\.outcome, translate\)\.text;\s*phase = 'failed';/);
  assert.match(component, /\{:else if phase === 'failed'\}\s*<p class="outcome error" role="status">\{failure\}<\/p>/);
});

test('no shape, coordinate or area is logged or kept in the browser', async () => {
  for (const [name, source] of [['component', await read(COMPONENT)], ['client', await read(MODULE)]]) {
    const body = code(source);
    assert.doesNotMatch(body, /console\./, name);
    assert.doesNotMatch(body, /localStorage|sessionStorage|indexedDB|document\.cookie/, name);
  }
});

test('the app depends on leaflet in the range packages/roi-ui uses, and not on roi-ui', async () => {
  const app = JSON.parse(await read('package.json'));
  const roi = JSON.parse(await readFile(new URL('../../../packages/roi-ui/package.json', import.meta.url), 'utf8'));
  assert.equal(app.dependencies.leaflet, roi.dependencies.leaflet);
  assert.equal(app.dependencies['@celine-eu/roi-ui'], undefined);
});
