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
    const source = await read(`src/routes/[community]/${route}/+page.svelte`);
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
    'src/routes/[community]/+page.svelte',
    'src/routes/[community]/devices/+page.svelte',
    'src/routes/[community]/flexibility/+page.svelte',
    'src/routes/[community]/gamification/+page.svelte',
    'src/routes/[community]/nudging/+page.svelte',
    'src/routes/[community]/alerts/+page.svelte',
  ];
  const forbidden = /participant(?:Name|Email|Phone|Address)|firstName|lastName|fiscalCode|taxCode/;
  for (const file of files) {
    assert.doesNotMatch(await read(file), forbidden, file);
  }
});

test('dashboard startup cannot race the manager store or turn API outages into login loops', async () => {
  const layout = await read('src/routes/[community]/+layout.svelte');
  const loader = await read('src/routes/+layout.ts');

  assert.doesNotMatch(layout, /meStore\.set/);
  assert.match(loader, /meStore\.set\(me\);[\s\S]*?return \{ me \};/);
  assert.match(loader, /message\.includes\('401'\)\) \{[\s\S]*?redirect\(302, `\/oauth2\/sign_in/);
  assert.match(loader, /throw error;/);
});

test('the REC comes from the URL, never from the session', async () => {
  // A manager of several RECs must not be one stale store away from reading the
  // wrong community's numbers, and a bookmark must reopen the REC it names.
  const pages = [
    'src/routes/[community]/+page.svelte',
    'src/routes/[community]/devices/+page.svelte',
    'src/routes/[community]/flexibility/+page.svelte',
    'src/routes/[community]/gamification/+page.svelte',
    'src/routes/[community]/data-flow/+page.svelte',
    'src/routes/[community]/nudging/+page.svelte',
    'src/routes/[community]/alerts/+page.svelte',
    'src/routes/[community]/members/+page.svelte',
  ];
  for (const path of pages) {
    const source = await read(path);
    assert.doesNotMatch(source, /communityKey\s*:/, path);
    assert.doesNotMatch(source, /\$meStore\.community/, path);
  }

  const loader = await read('src/routes/[community]/+layout.ts');
  assert.match(loader, /params\.community/);
  assert.match(loader, /redirect\(\s*302,\s*`\/denied\?reason=not-your-rec/);
});

test('one REC skips the picker and several offer one', async () => {
  const picker = await read('src/routes/+page.ts');

  assert.match(picker, /me\.communities\.length === 1/);
  assert.match(picker, /redirect\(302, `\/\$\{encodeURIComponent\(me\.communities\[0\]\.key\)\}`\)/);
  assert.match(picker, /reason=no-recs/);
});

test('a refusal, a wrong REC and a downstream outage read differently', async () => {
  const denied = await read('src/routes/denied/+page.svelte');
  const loader = await read('src/routes/+layout.ts');
  const english = JSON.parse(await read('src/lib/i18n/en.json'));

  for (const reason of ['no-recs', 'not-your-rec', 'registry']) {
    assert.match(denied, new RegExp(reason.replace('-', '\\-')), reason);
  }
  // 503 is a downstream being down, not a refusal, and must not be phrased as one.
  assert.match(loader, /includes\('503'\)[\s\S]*?reason=registry/);
  assert.notEqual(english['denied.registry'], english['denied.no_recs']);
  assert.notEqual(english['denied.not_your_rec'], english['denied.no_recs']);
});

test('surfaces the caller cannot use are absent, not offered and refused', async () => {
  const layout = await read('src/routes/[community]/+layout.svelte');
  const alerts = await read('src/routes/[community]/alerts/+page.svelte');

  assert.match(layout, /data\.community\.capabilities\.includes\(section\.capability\)/);
  assert.match(alerts, /includes\('alerts\.write'\)/);
  assert.match(alerts, /\{#if canAct\}/);
});

test('gamification formats numeric output and has no review queue', async () => {
  const page = await read('src/routes/[community]/gamification/+page.svelte');

  assert.match(page, /new Intl\.NumberFormat/);
  assert.match(page, /formatNumber\(distribution\.bottomDecilePoints\)/);
  assert.match(page, /formatNumber\(distribution\.topDecilePoints\)/);
  assert.doesNotMatch(page, /getAntiGamingFlags|gamification\.review|gamification\.flags/);
});

test('nudging explains every journey stage and identifies the active catalogue', async () => {
  const page = await read('src/routes/[community]/nudging/+page.svelte');
  const italian = JSON.parse(await read('src/lib/i18n/it.json'));

  assert.match(page, /nudge_step\.\$\{step\.id\}_description/);
  assert.match(page, /nudging\.from_previous_step/);
  assert.match(page, /nudging\.catalogue_filter/);
  assert.equal(italian['nudge_step.delivered'], 'Notifiche disponibili');
  assert.equal(italian['nudge_step.committed'], 'Impegni confermati');
});

test('manager dashboard reuses the full feedback flow and a larger base font', async () => {
  const layout = await read('src/routes/[community]/+layout.svelte');
  const api = await read('src/lib/api.ts');
  const diagnostics = await read('src/lib/feedback.ts');
  const styles = await read('src/app.css');

  assert.match(layout, /FeedbackWidget/);
  assert.match(layout, /collectFeedbackDiagnostics/);
  assert.match(layout, /submitFeedback\(\{ \.\.\.payload, communityKey: data\.community\.key \}\)/);
  assert.match(api, /request<FeedbackCreated>\('\/api\/feedback'/);
  assert.match(diagnostics, /html2canvas\(document\.documentElement/);
  assert.match(diagnostics, /data-feedback-widget-root/);
  assert.match(styles, /html\s*\{\s*font-size:\s*17px;/);
});

test('members are listed by name, and by nothing else that identifies them', async () => {
  // Requester, 2026-09-14 (A1): the one page that shows participants by name.
  const page = await read('src/routes/[community]/members/+page.svelte');
  const api = await read('src/lib/api.ts');
  const summary = api.match(/export interface MemberSummary \{[\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(summary, /name\?: string \| null;/);
  // Fields, not words: the page does send an email, it never reads an address.
  const fields = /^\s*(userId|user_id|did|email|deliveryPoints?|fiscalCode|taxCode|phone)\??:/im;
  assert.doesNotMatch(summary.replace(/\/\*\*[\s\S]*?\*\//g, ''), fields);
  const reads = /\.(userId|user_id|did|email|deliveryPoints?|fiscalCode|taxCode|phone)\b/i;
  assert.doesNotMatch(page.replace(/<!--[\s\S]*?-->|\/\/.*$/gm, ''), reads);
});

test('a member whose registry name only repeats the key reads as having no name', async () => {
  const page = await read('src/routes/[community]/members/+page.svelte');

  assert.match(page, /\{#if member\.name\}[\s\S]*?\{:else\}[\s\S]*?members\.no_name/);
  assert.match(page, /<code>\{member\.key\}<\/code>/);
});

test('member names are neither stored nor exported by the dashboard', async () => {
  const page = await read('src/routes/[community]/members/+page.svelte');

  assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB|ExportButtons/);
});

test('the members page is offered only with members.read', async () => {
  const layout = await read('src/routes/[community]/+layout.svelte');

  assert.match(layout, /path: '\/members'[^}]*capability: 'members\.read'/);
});
