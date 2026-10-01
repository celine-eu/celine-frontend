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
  measurements dialog, offered only with `members.meter`;
- `PATCH /api/communities/{community_key}/members/{member_key}` (`{role?, area?}`),
  `GET /api/communities/{community_key}/areas` and `GET …/areas/shapes` for the edit dialog and its
  area map, offered only with `members.edit`.

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

The `/[community]/devices` page (**Meters**) provides search, filters, pagination and a technical detail drawer. The
`/[community]/data-flow` page shows 15-minute interval coverage, detected gaps and the latest pipeline state.
Both views deliberately expose only `device_id`, never participant identity.

`/[community]/members` is the one page that shows participants by name: name, key, role, area,
status, and a **Measurements** column with two flags: whether the member has a delivery point
(POD) and whether they have a meter (each yes, no, or unknown when the BFF could not tell), read from
the REC registry through the BFF. The list never shows a POD or a sensor id. The names live in the page's state only. They
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

Two measurement sources are kept apart in every word the dashboard uses:

| Term (EN) | IT | ES | What it is |
|---|---|---|---|
| **Delivery point (POD)** | Punto di prelievo (POD) | Punto de suministro (POD) | The DSO's grid connection. Read-only here; set and corrected through onboarding |
| **Meter** | Misuratore | Medidor | A REC- or member-provided device (IoT, say). Optional |
| **Measurements** | Misure | Medidas | Both, together: the column, the button and the dialog |

"Contatore" and "smart meter" are not used. Wherever the dashboard shows the IoT meters (by
`device_id`), it calls them meters, never devices: the navigation entry and the page at
`/[community]/devices` are **Meters** (Misuratori / Medidores), with a **Meter ID** column, and so
are the overview's "Monitored meters" and meter health, and the alert source. The route path stays
`/devices`, as does the BFF's `/api/…/devices`. Flexibility and gamification keep their own
wording: their "devices" count participants in a campaign or a points ledger, identified by
`device_id`, not meters as measurement sources.

With `members.meter`, every member has a **Measurements** button that opens the measurements dialog
(`celine-community` ADR-0004, ADR-0005). Every member's measurements can be reviewed. **Detach is
offered for every member; attach only for active members** (plan D45), so a manager can free a meter
still held by a suspended or inactive member. The BFF enforces the same and answers
`member_not_active` to an attach for anyone else; for a member who is not active the dialog shows
no attach form, and says why.

- The dialog reads that one member's measurements (`GET …/meter`). It has two independent sections:
  - **Delivery point (POD)**: the member's POD ids, read-only, an inactive one marked. With none, it
    says the POD is entered through onboarding, where an operator checks it. The dashboard never
    edits a POD. The section is hidden when the BFF sends no `deliveryPoints` (an older BFF).
  - **Meter**: each meter's sensor id, type and linked POD, with **Detach**. With none, it says a
    meter is optional. A member with a POD and no meter is the normal case.
- This dialog is the only place a name meets a POD or a sensor id.
- A new meter's sensor id is **typed as free text**. There is no picker, no suggestion list and no
  lookup of unattached meters: an unattached meter belongs to no REC, so any list would show one
  REC's manager another's meters. The registry's answer is the only check. The field takes at most
  122 characters (`SENSOR_ID_MAX_LENGTH`), so the registry key `meter-<id>` fits its 128.
- The meter type is a select of the registry's vocabulary. It defaults from the role: `bidirectional`
  for a prosumer, `consumption` otherwise.
- **Linked POD** is an optional select of the member's own PODs, with "none". It is preselected when
  the member has exactly one; "none" sends no `pod`. A POD the member does not hold is the BFF's
  `pod_not_held`.
- **Attach** and **Detach** ask for confirmation, and nothing is sent until the manager confirms.
  Only one request is in flight at a time. A blank id is refused before any request.
- The BFF's code becomes a sentence through `src/lib/memberMeter.ts`, in the three locales:
  - attached;
  - already attached, where nothing changed;
  - `sensor_held`: "held by another member", naming nobody;
  - `asset_key_taken`: the registry already has another record under this meter's key, including
    one this member holds for a different sensor id; nothing changed, and an administrator is told;
  - `asset_key_too_long`: the id is too long for the registry;
  - `member_not_active`: the member is not active, so nothing was attached;
  - `pod_not_held`: the POD is not one of the member's, so nothing was attached;
  - an unanswered registry, which asks the manager to reopen the dialog and check;
  - a missing registry grant, which is a configuration problem and not a refusal of the manager;
  - an unknown code, shown raw.
- The sensor id and the POD are never stored in the browser:
  - they live in the dialog's state and are cleared when the dialog closes;
  - they travel in request and response bodies, never in a URL;
  - the dialog's read is `cache: 'no-store'`;
  - no outcome sentence contains either.

With `members.edit`, each **active** member has **Edit**, which opens the role and area dialog
(`celine-community` ADR-0003). For a member who is not active the button is disabled and says why;
the BFF refuses the same (`member_not_active`, plan D45):

- **Role** is a select of `consumer` and `prosumer` only. Settlement counts a meter's production
  only for a prosumer. A member whose role is anything else (`producer`, an imported `operator` or
  `admin`) sees that role read-only, and only their area can change. The BFF refuses the same
  (`role_not_allowed`, `role_read_only`), so the dialog is not the enforcement.
- **Area** is a select of the REC's areas from `GET …/areas`, each shown with its primary
  substation id: the BFF's `primarySubstation` (the area's first topology node, the node the
  pipelines attribute its meters to), else its boundary's id. A member whose area the registry no
  longer lists keeps it in the select. If the areas cannot be read, the area stays as it is and the
  role can still be changed.
- **Only what changed is sent.** **Save** is disabled while nothing differs. It opens a
  confirmation that lists the changes and warns what they do to the meter's data:
  - a role change decides whether the meter's production counts, from the next pipeline run;
  - an area change moves the meter's new rows to the new area's substation, from the next
    pipeline run;
  - rows already computed keep the old values, and a later full refresh rewrites the whole
    history with the new values.
- Nothing is sent until the manager confirms, and only one request is in flight at a time. The row
  then shows the role and area the BFF answered.
- The BFF's code becomes a sentence through `src/lib/memberProfile.ts`, in the three locales:
  `updated`, `unchanged` (nothing was written), `role_not_allowed`, `role_read_only`,
  `member_not_active`,
  `invalid_role`, `unknown_area`, `member_not_found`, `community_not_found`, `profile_rejected`,
  `registry_unavailable`, `registry_refused` (a configuration problem, not a refusal of the
  manager), `profile_writes_not_configured`, and an unknown code, shown raw.

Below the area select, the dialog shows a **read-only map of the REC's areas**
(`src/lib/components/AreaMap.svelte`, `src/lib/areaMap.ts`;
[ADR-0001](../../docs/decisions/ADR-0001-the-community-area-map-uses-leaflet-and-openstreetmap-tiles.md)):

- The shapes come from the BFF's `GET …/areas/shapes`: each area that has a boundary, with its
  primary-substation boundary as GeoJSON, which the BFF reads from the Digital Twin. Each area is
  drawn with its name and substation id as a label; the area the select shows is highlighted.
- Nothing on the map is edited: no drawing tools, no handles, no draggable shapes. Boundaries are
  admin-driven.
- `leaflet` is imported lazily on mount, as `packages/roi-ui`'s `MapPicker.svelte` does, so
  server-side rendering never touches `window`, and only when there is at least one shape to draw.
  The base layer is OpenStreetMap's public tiles with its attribution. The tile server sees the
  manager's IP address and which tiles are shown, and nothing else: the dialog says so, and no
  member data is sent to it. If the tiles fail, the boundaries still draw on a blank background.
- An area whose boundary the Digital Twin has no shape for is named under the map instead of drawn.
  With no boundary at all, the map says there is nothing to draw and requests no tiles.
- When the shapes cannot be read (`digital_twin_unavailable`, `digital_twin_refused`,
  `digital_twin_not_configured`, a registry failure, the network), a sentence in the three locales
  takes the map's place and the area select keeps working.
- No shape or coordinate is logged or kept in the browser; the answer lives in the component while
  the dialog is open.

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
