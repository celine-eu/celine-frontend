# Community Manager

Standalone SvelteKit frontend for the CELINE REC Manager Dashboard. It is intentionally separate
from `apps/webapp`, following the deployment and role-gate pattern used by `apps/grid`.

## Run locally

```sh
pnpm --filter @celine-eu/community dev
```

The app runs at `http://localhost:3007` and always reads the standalone `celine-community` BFF. It
expects:

- `GET /api/me` for the authenticated manager and their `communityKey`;
- `GET /api/communities/{community_key}/overview?period=today|7d|30d` for the overview.
- `GET /api/communities/{community_key}/devices` and `/devices/{device_id}` for operational
  monitoring;
- `GET /api/communities/{community_key}/data-flow/pipelines` for coverage and pipeline freshness.
- points distribution, anti-gaming flags, and device ledgers for `/gamification`;
- read-only funnel, delivery health, reachability, and rule metrics for `/nudging`;
- the BFF-owned alert inbox and audited actions for `/alerts`.

The `/devices` page provides search, filters, pagination and a technical detail drawer. The
`/data-flow` page shows 15-minute interval coverage, detected gaps and the latest pipeline state.
Both views deliberately expose only `device_id`, never participant identity.

The phase-5 views retain the same boundary: the leaderboard and ledger use only `device_id`, the
nudging page contains no rule or message editor, and alert acknowledge/mute/assign actions are
persisted and audited by `celine-community`.

Device, flexibility, points, nudging and alert tables can be downloaded as authorized CSV or XLSX
exports from the BFF. The shell includes keyboard-visible focus, a skip-to-content link and reduced
motion support; technical detail drawers expose dialog semantics.

## Validate

```sh
pnpm --filter @celine-eu/community check
pnpm --filter @celine-eu/community test
pnpm --filter @celine-eu/community build
```
