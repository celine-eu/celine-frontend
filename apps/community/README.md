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
- the BFF-owned alert inbox and audited actions for `/[community]/alerts`;
- `GET /api/communities/{community_key}/members` for `/[community]/members`, shown only with
  `members.read`;
- `GET`, `PUT` and `DELETE /api/communities/{community_key}/members/{member_key}/meter` for the
  meter dialog, offered only with `members.meter`.

## Which REC is on screen

The REC is a route parameter, so every dashboard page lives under `/[community]/…`. `/` is the
picker over the RECs `GET /api/me` returned; with exactly one it redirects straight into it, which
is the common case. A manager of several REC organizations, or a realm administrator, gets the
picker. Nothing reads the REC from the session, so a reload, a bookmark and a shared link all open
the REC they name.

Each REC carries its capabilities, and a section or action the caller has none for is absent from
the nav and the page rather than offered and then refused by the BFF. `/denied` distinguishes the
three ways in: managing no REC, asking for a REC that is not yours, and the REC registry being
unreachable — the last of which is temporary and says so.

The `/[community]/devices` page provides search, filters, pagination and a technical detail drawer. The
`/[community]/data-flow` page shows 15-minute interval coverage, detected gaps and the latest pipeline state.
Both views deliberately expose only `device_id`, never participant identity.

`/[community]/members` is the one page that shows participants by name: name, key, role, area,
status and whether the member has a meter (yes, no, or unknown when the BFF could not read the
community's meters), read from the REC registry through the BFF. The list never shows a sensor id. The names live in the page's state only. They
are not stored in the browser and not exported. A member whose registry name is just their key is
shown by key with "no name on record". Search narrows one registry page at a time, and "Load more"
fetches the next.

With `members.invite`, each active member has **Send invitation** and **Reset password**. A press
opens a confirmation dialog, and nothing is requested until the manager confirms. Only one request
is in flight at a time. The BFF's code becomes a sentence through `src/lib/memberSend.ts`, in the
three locales: the link's validity comes from `lifespanSeconds`, and a cooldown's wait from
`retryAfterSeconds`. A mismatch names the other button, and an unknown code is shown raw. The
"Sent emails" tab lists past presses from the BFF's audit rows, filterable by member key, sender,
email, outcome and date.

With `members.meter`, each member has **Attach meter** (or **Attach or detach meter** when they
may already hold one), which opens the meter dialog (`celine-community` ADR-0004):

- The dialog reads that one member's meters (`GET …/meter`) and shows their sensor ids, each with
  **Detach**. This is the only place a name meets a sensor id.
- A new meter's sensor id is **typed as free text**. There is no picker, no suggestion list and no
  lookup of unattached meters: an unattached meter belongs to no REC, so any list would show one
  REC's manager another's meters. The registry's answer is the only check. The field takes at most
  122 characters (`SENSOR_ID_MAX_LENGTH`), so the registry key `meter-<id>` fits its 128.
- The meter type is a select of the registry's vocabulary. It defaults from the role: `bidirectional`
  for a prosumer, `consumption` otherwise.
- **Attach** and **Detach** ask for confirmation, and nothing is sent until the manager confirms.
  Only one request is in flight at a time. A blank id is refused before any request.
- The BFF's code becomes a sentence through `src/lib/memberMeter.ts`, in the three locales:
  - attached;
  - already attached, where nothing changed;
  - `sensor_held`: "held by another member", naming nobody;
  - `asset_key_taken`: the registry already has another record under this meter's key, including
    one this member holds for a different sensor id; nothing changed, and an administrator is told;
  - `asset_key_too_long`: the id is too long for the registry;
  - an unanswered registry, which asks the manager to reopen the dialog and check;
  - a missing registry grant, which is a configuration problem and not a refusal of the manager;
  - an unknown code, shown raw.
- The sensor id is never stored in the browser:
  - it lives in the dialog's state and is cleared when the dialog closes;
  - it travels in request bodies, never in a URL;
  - the dialog's read is `cache: 'no-store'`;
  - no outcome sentence contains it.

Planned, not implemented: role and area editing on the members page, with a read-only map of the
REC's area boundaries drawn with `leaflet` on OpenStreetMap's public tiles, as `packages/roi-ui`
draws its map ([ADR-0001](../../docs/decisions/ADR-0001-the-community-area-map-uses-leaflet-and-openstreetmap-tiles.md)).

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
