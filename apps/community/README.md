# Community Manager

Standalone SvelteKit frontend for the CELINE REC Manager Dashboard. It is intentionally separate
from `apps/webapp`, following the deployment and role-gate pattern used by `apps/grid`.

## Run locally

```sh
pnpm --filter @celine-eu/community dev
```

The app runs at `http://localhost:3007` and always reads the standalone `celine-community` BFF. It
expects:

- `GET /api/me` for the authenticated manager and the RECs they manage, each with its
  capabilities;
- `GET /api/communities/{community_key}/overview?period=today|7d|30d` for the overview.
- `GET /api/communities/{community_key}/devices` and `/devices/{device_id}` for operational
  monitoring;
- `GET /api/communities/{community_key}/data-flow/pipelines` for coverage and pipeline freshness.
- points distribution, anti-gaming flags, and device ledgers for `/[community]/gamification`;
- read-only funnel, delivery health, reachability, and rule metrics for `/[community]/nudging`;
- the BFF-owned alert inbox and audited actions for `/[community]/alerts`.

## Which REC is on screen

The REC is a route parameter, so every dashboard page lives under `/[community]/…`. `/` is the
picker over the RECs `GET /api/me` returned; with exactly one it redirects straight into it, which
is the common case and the only case for an organization-scoped manager. Nothing reads the REC from
the session, so a reload, a bookmark and a shared link all open the REC they name.

Each REC carries its capabilities, and a section or action the caller has none for is absent from
the nav and the page rather than offered and then refused by the BFF. `/denied` distinguishes the
three ways in: managing no REC, asking for a REC that is not yours, and the REC registry being
unreachable — the last of which is temporary and says so.

The `/[community]/devices` page provides search, filters, pagination and a technical detail drawer. The
`/[community]/data-flow` page shows 15-minute interval coverage, detected gaps and the latest pipeline state.
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
