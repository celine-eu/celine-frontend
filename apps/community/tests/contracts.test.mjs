import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('all supported locales expose the same contract keys', async () => {
  const locales = await Promise.all(
    ['it', 'en', 'es'].map(async (locale) => JSON.parse(await read(`src/lib/i18n/${locale}.json`))),
  );
  const expected = Object.keys(locales[0]).sort();
  for (const locale of locales.slice(1)) {
    assert.deepEqual(Object.keys(locale).sort(), expected);
  }
});

test('manager datasets expose both authorized export formats', async () => {
  const routes = {
    devices: 'devices',
    flexibility: 'flexibility',
    gamification: 'points',
    nudging: 'nudging',
    alerts: 'alerts',
  };
  for (const [route, dataset] of Object.entries(routes)) {
    const source = await read(`src/routes/${route}/+page.svelte`);
    assert.match(source, /ExportButtons/);
    assert.match(source, new RegExp(`dataset="${dataset}"`));
  }
  const component = await read('src/lib/components/ExportButtons.svelte');
  assert.match(component, /href\('csv'\)/);
  assert.match(component, /href\('xlsx'\)/);
});

test('participant identity fields are absent from manager contracts and pages', async () => {
  const files = [
    'src/lib/api.ts',
    'src/routes/+page.svelte',
    'src/routes/devices/+page.svelte',
    'src/routes/flexibility/+page.svelte',
    'src/routes/gamification/+page.svelte',
    'src/routes/nudging/+page.svelte',
    'src/routes/alerts/+page.svelte',
  ];
  const forbidden = /participant(?:Name|Email|Phone|Address)|firstName|lastName|fiscalCode|taxCode/;
  for (const file of files) {
    assert.doesNotMatch(await read(file), forbidden, file);
  }
});

test('dashboard startup cannot race the manager store or turn API outages into login loops', async () => {
  const layout = await read('src/routes/+layout.svelte');
  const loader = await read('src/routes/+layout.ts');

  assert.doesNotMatch(layout, /meStore\.set/);
  assert.match(loader, /meStore\.set\(me\);[\s\S]*?return \{ me \};/);
  assert.match(loader, /message\.includes\('401'\)\) \{[\s\S]*?redirect\(302, `\/oauth2\/sign_in/);
  assert.match(loader, /throw error;/);
});

test('gamification formats numeric output and has no review queue', async () => {
  const page = await read('src/routes/gamification/+page.svelte');

  assert.match(page, /new Intl\.NumberFormat/);
  assert.match(page, /formatNumber\(distribution\.bottomDecilePoints\)/);
  assert.match(page, /formatNumber\(distribution\.topDecilePoints\)/);
  assert.doesNotMatch(page, /getAntiGamingFlags|gamification\.review|gamification\.flags/);
});

test('nudging explains every journey stage and identifies the active catalogue', async () => {
  const page = await read('src/routes/nudging/+page.svelte');
  const italian = JSON.parse(await read('src/lib/i18n/it.json'));

  assert.match(page, /nudge_step\.\$\{step\.id\}_description/);
  assert.match(page, /nudging\.from_previous_step/);
  assert.match(page, /nudging\.catalogue_filter/);
  assert.equal(italian['nudge_step.delivered'], 'Notifiche disponibili');
  assert.equal(italian['nudge_step.committed'], 'Impegni confermati');
});

test('manager dashboard reuses the full feedback flow and a larger base font', async () => {
  const layout = await read('src/routes/+layout.svelte');
  const api = await read('src/lib/api.ts');
  const diagnostics = await read('src/lib/feedback.ts');
  const styles = await read('src/app.css');

  assert.match(layout, /FeedbackWidget/);
  assert.match(layout, /collectFeedbackDiagnostics/);
  assert.match(layout, /\{submitFeedback\}/);
  assert.match(api, /request<FeedbackCreated>\('\/api\/feedback'/);
  assert.match(diagnostics, /html2canvas\(document\.documentElement/);
  assert.match(diagnostics, /data-feedback-widget-root/);
  assert.match(styles, /html\s*\{\s*font-size:\s*17px;/);
});
