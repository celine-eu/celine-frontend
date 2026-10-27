import assert from 'node:assert/strict';
import { test } from 'node:test';

// Node strips the types; the module imports nothing from Svelte or SvelteKit on purpose.
import { isProduction, productionHref } from '../src/environment.ts';

test('only prod is production', () => {
  assert.equal(isProduction('prod'), true);
  assert.equal(isProduction(' PROD '), true);
  for (const value of [undefined, null, '', 'dev', 'staging', 'production', 'prod-like']) {
    assert.equal(isProduction(value), false, String(value));
  }
});

test('the prod link keeps the path', () => {
  assert.equal(
    productionHref('https://webapp.example.org', '/suggestions'),
    'https://webapp.example.org/suggestions'
  );
  assert.equal(
    productionHref('https://webapp.example.org/', '/'),
    'https://webapp.example.org/'
  );
});

test('the prod link keeps a base path on the prod URL', () => {
  assert.equal(
    productionHref('https://example.org/app/', '/settings'),
    'https://example.org/app/settings'
  );
});

test('the prod link drops anything but the path', () => {
  assert.equal(
    productionHref('https://webapp.example.org', '/a?token=x#frag'),
    'https://webapp.example.org/a'
  );
});

test('no valid http(s) prod URL gives no link', () => {
  for (const value of [undefined, null, '', '  ', 'webapp.example.org', 'javascript:alert(1)', 'ftp://x.org']) {
    assert.equal(productionHref(value, '/'), null, String(value));
  }
});
