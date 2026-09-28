# Apps

## apps/assistant

Standalone full-page AI assistant application. Provides a single-route SvelteKit app that renders `ChatCore` in full-viewport mode.

**Entry point:** `apps/assistant/src/routes/+page.svelte`

**Backend:** `celine-ai-assistant` (port 8012)

**Docker image:** `ghcr.io/celine-eu/celine-assistant`

**Environment:**

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_PRIVACY_POLICY_URL` | `/privacy` | Privacy policy linked from the AI notice under the chat input. This app has no `/privacy` route, so set it in any deployment where that path is not served by another app on the same host |

**Dev:**
```bash
task dev:assistant
# http://localhost:3003
```

---

## apps/webapp

REC participant webapp. A full SvelteKit application for community members, including energy overview, weather, forecast, suggestions, gamification, notifications, settings, feedback, and the embedded assistant.

**Routes:**

| Route | Description |
|---|---|
| `/` | Energy overview — production, consumption, incentives |
| `/suggestions` | Flexibility window suggestions with accept/reject |
| `/assistant` | Embedded `ChatCore` in full mode |
| `/notifications` | Notification list and read/delete |
| `/settings` | User preferences (language, units) |
| `/profile` | User profile |
| `/privacy` | Privacy policy |
| `/terms` | Terms of service |
| `/accept-terms` | Terms acceptance flow |
| `/not-a-participant` | Non-participant landing |
| `/no-smart-meter` | No smart meter landing |

**Key components:** `EnergyChart`, `ForecastCard`, `WeatherWidget`, `StatCard`, `SuggestionCard`, `GamificationPanel`, `PointsChart`

**Layout:** The root layout loads `GET /api/me` (redirecting to `/accept-terms` when terms are required, except on `/privacy`, `/terms` and `/accept-terms`), then the community and unread notifications. There is no floating assistant widget: `AskAssistantButton`s on `/` and `/suggestions` navigate to `/assistant?prompt=…`.

**Backend:** `celine-webapp` BFF (port 8014)

**Environment:**

| Variable | Default | Description |
|---|---|---|
| `PUBLIC_PRIVACY_POLICY_URL` | `/privacy` | Privacy policy linked from the AI notice under the assistant's chat input |

**Dev:**
```bash
task dev:webapp
# http://localhost:3005
```

---

## apps/grid

Grid resilience dashboard for DSO operators. Displays wind and heat risk maps, alert distributions, trend charts, substation topology, CIM asset topology, and manages alert rules and notification settings.

**Routes:**

| Route | Description |
|---|---|
| `/` | Main grid dashboard — risk maps, filters, trends |
| `/management` | Alert rules and notification settings management |
| `/denied` | Access denied page (non-DSO users) |

**Key components:** `AutocompleteSelect`, `FilterBar`, `LineInspectPanel`, `RiskDonut`, `TrendSparkline`

**Backend:** `celine-grid` (port 8015)

**Docker image:** `ghcr.io/celine-eu/celine-grid-ui`

**Dev:**
```bash
task dev:grid
# http://localhost:3006
```

---

## apps/community

REC Manager Dashboard. A SvelteKit application for the managers of a renewable energy community: energy overview, devices and data flow, flexibility, gamification, nudging, alerts, members and feedback. It is separate from `apps/webapp`, and follows the deployment and role-gate pattern of `apps/grid`.

**Routes:**

| Route | Description |
|---|---|
| `/` | REC picker over the RECs `GET /api/me` returned; redirects straight into the only one |
| `/denied` | No REC managed, a REC that is not yours, or the REC registry unreachable |
| `/[community]` | Overview for the REC in the path |
| `/[community]/devices` | Device board and technical detail drawer, by `device_id` only |
| `/[community]/data-flow` | Interval coverage, gaps and pipeline freshness |
| `/[community]/flexibility` | Flexibility windows and the offered → points pathway |
| `/[community]/gamification` | Points distribution, anti-gaming flags, device ledgers |
| `/[community]/nudging` | Read-only nudging metrics |
| `/[community]/alerts` | Alert inbox with acknowledge, mute and assign |
| `/[community]/members` | Members by name, with invitation and password-reset sends, the meter dialog and the role and area dialog with its area map |
| `/[community]/feedback` | Manager-dashboard and participant-dashboard feedback inbox |

**Capabilities:** each REC in `GET /api/me` carries the caller's capabilities, and a section or action the caller has none for is absent rather than offered and refused. The members page needs `members.read`; its actions need `members.invite` (sends), `members.meter` (attach and detach a meter) and `members.edit` (role and area). The BFF enforces every one of them again.

**Key components:** `AreaMap`, `EnergyChart`, `ExportButtons`, `KpiCard`, `MemberSends`. Outcome codes become sentences in `src/lib/memberSend.ts`, `memberMeter.ts` and `memberProfile.ts`, in `en`, `it` and `es`.

**Map:** the role and area dialog draws a read-only map of the REC's areas with `leaflet` on OpenStreetMap's public tiles ([ADR-0001](decisions/ADR-0001-the-community-area-map-uses-leaflet-and-openstreetmap-tiles.md)). The tile server sees the manager's IP address and the tiles shown; no member data is sent to it.

**Privacy:** member names and a member's sensor ids live in page state only, never in browser storage, a URL or an export. A sensor id is typed as free text in the meter dialog; nothing lists or suggests meters.

**Backend:** `celine-community` BFF (port 8019). See `apps/community/README.md` for the routes the app reads and what each dialog does.

**Docker image:** `ghcr.io/celine-eu/celine-frontend-community`

**Tests:** `pnpm --filter @celine-eu/community test` (`node --test`), `check` and `build`; `e2e/community-area-map.spec.ts` renders the map in Chromium with the BFF and the tile server stubbed.

**Dev:**
```bash
task dev:community
# http://localhost:3007
```

---

## apps/roi

PV installation ROI calculator. Single-page application for estimating the financial return of a photovoltaic installation, including production estimates, CER incentives, CAPEX, and financial analysis. Supports PDF export of results and map-based location selection.

**Routes:**

| Route | Description |
|---|---|
| `/` | ROI calculator — input form, map picker, results |

**Package dependency:** Uses `@celine-eu/roi-ui` (`RoiCore`, `RoiWidget`) from `packages/roi-ui`.

**Backend:** `celine-roi` (port 8013)

**Dev:**
```bash
task dev:roi
# http://localhost:3004
```
