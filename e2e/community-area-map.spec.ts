import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * The read-only map of a REC's areas in the members page's role-and-area dialog
 * (ADR-0001; `apps/community/src/lib/components/AreaMap.svelte`), rendered in a real
 * browser: leaflet is imported on mount, each area's primary-substation boundary is drawn
 * with its label, the selected area is highlighted and follows the select, an area with no
 * shape is named under the map, and nothing on it can be edited.
 *
 * **Against the UI dev server, with every BFF answer stubbed** (`page.route`), so it runs
 * without the platform: the app fetches everything in the browser (`ssr = false`), which is
 * what makes the stubs reach it. The tile server is stubbed too and **refused**, so no
 * request leaves the machine, and the boundaries must still draw on a blank background.
 * What this does not settle: that the BFF's `GET …/areas/shapes` answers this shape from a
 * real Digital Twin — that is celine-community's contract test, and the recorded run.
 *
 * Geometries are synthetic and off land (the Gulf of Guinea at 0° / 0°).
 *
 *   E2E_COMMUNITY_UI_URL  http://127.0.0.1:3007  (`task dev:community`; any free port with
 *                         `pnpm --filter @celine-eu/community exec vite dev --port <n>`)
 */
const UI_URL = process.env.E2E_COMMUNITY_UI_URL ?? 'http://127.0.0.1:3007';
const REC = 'example-rec';
const MEMBER_KEY = 'ex-00001';

const square = (lon: number, lat: number, size: number) => ({
  type: 'Polygon',
  coordinates: [[[lon, lat], [lon + size, lat], [lon + size, lat + size], [lon, lat + size], [lon, lat]]],
});

const AREAS = [
  { key: 'area-a', name: 'Area A', boundary: { source: 'dt', id: 'ex-ps-a' }, primarySubstation: 'ex-ps-a' },
  { key: 'area-b', name: 'Area B', boundary: { source: 'dt', id: 'ex-ps-b' }, primarySubstation: 'ex-ps-b' },
  { key: 'area-c', name: 'Area C', boundary: { source: 'dt', id: 'ex-ps-c' }, primarySubstation: 'ex-ps-c' },
];

const SHAPES = [
  { areaKey: 'area-a', name: 'Area A', boundaryId: 'ex-ps-a', geometry: square(0.02, 0.02, 0.06) },
  { areaKey: 'area-b', name: 'Area B', boundaryId: 'ex-ps-b', geometry: square(0.2, 0.02, 0.06) },
  // The Digital Twin has no shape for this one: named under the map, not drawn.
  { areaKey: 'area-c', name: 'Area C', boundaryId: 'ex-ps-c', geometry: null },
];

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Stubs the BFF and the tile server; returns the tile URLs the page asked for. */
async function stub(page: Page, shapes: unknown[]): Promise<string[]> {
  const tiles: string[] = [];
  await page.route(/tile\.openstreetmap\.org/, (route) => {
    tiles.push(route.request().url());
    return route.abort('blockedbyclient');
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') {
      return json(route, {
        user: {
          sub: 'example-manager',
          email: 'manager@example.test',
          name: 'Example Manager',
          locale: 'en',
          organizations: [],
          platformRoles: [],
          scopes: [],
          communities: [
            { key: REC, name: 'Example REC', capabilities: ['community.read', 'members.read', 'members.edit'] },
          ],
        },
        registryAvailable: true,
      });
    }
    if (path === `/api/communities/${REC}/members`) {
      return json(route, {
        communityKey: REC,
        items: [{ key: MEMBER_KEY, role: 'consumer', status: 'active', area: 'area-a', hasMeter: false }],
        nextCursor: null,
      });
    }
    if (path === `/api/communities/${REC}/areas`) return json(route, { communityKey: REC, areas: AREAS });
    if (path === `/api/communities/${REC}/areas/shapes`) return json(route, { communityKey: REC, areas: shapes });
    return json(route, { detail: 'not stubbed' }, 404);
  });
  return tiles;
}

async function openDialog(page: Page) {
  await page.addInitScript(() => localStorage.setItem('locale', 'en'));
  await page.goto(`${UI_URL}/${REC}/members`);
  const row = page.locator('tr', { has: page.locator(`code:text-is("${MEMBER_KEY}")`) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.use({ locale: 'en-GB' });

test('the dialog draws each area with a boundary, labelled, read-only, on refused tiles', async ({ page }, testInfo) => {
  const tiles = await stub(page, SHAPES);
  const dialog = await openDialog(page);
  const map = dialog.locator('.area-map .map');

  await expect(map).toHaveClass(/leaflet-container/, { timeout: 30_000 });
  const box = await map.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
  expect(box?.height ?? 0).toBeGreaterThan(100);

  // One drawn boundary per area with a polygon; the one without is named instead.
  const paths = map.locator('path.leaflet-interactive');
  await expect(paths).toHaveCount(2);
  await expect(map.locator('.area-map-label')).toHaveText([
    'Area A · primary substation ex-ps-a',
    'Area B · primary substation ex-ps-b',
  ]);
  await expect(dialog.getByText('No shape is available for: Area C.')).toBeVisible();

  // The member's area is highlighted, and the highlight follows the select.
  await expect(paths.nth(0)).toHaveAttribute('stroke-width', '3');
  await expect(paths.nth(1)).toHaveAttribute('stroke-width', '1.5');
  await dialog.locator('select').last().selectOption('area-b');
  await expect(paths.nth(0)).toHaveAttribute('stroke-width', '1.5');
  await expect(paths.nth(1)).toHaveAttribute('stroke-width', '3');

  // Read-only: no drawing toolbar, no edit handles, no draggable markers.
  await expect(map.locator('.leaflet-draw, .leaflet-editing-icon, .leaflet-marker-draggable, .leaflet-marker-icon')).toHaveCount(0);
  await expect(dialog.getByText(/The map is read-only/)).toBeVisible();

  // The tiles were asked for, refused, and carried nothing but a tile address.
  await expect.poll(() => tiles.length).toBeGreaterThan(0);
  for (const url of tiles) {
    expect(new URL(url).pathname).toMatch(/^\/\d+\/\d+\/\d+\.png$/);
    expect(url).not.toContain(MEMBER_KEY);
  }
  await expect(map.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');

  await testInfo.attach('area-map', { body: await dialog.screenshot(), contentType: 'image/png' });
});

test('with no boundary at all the map says so and asks for no tile', async ({ page }) => {
  const tiles = await stub(page, []);
  const dialog = await openDialog(page);

  await expect(dialog.getByText(/there is nothing to draw/)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.locator('.leaflet-container')).toHaveCount(0);
  expect(tiles).toEqual([]);
});
