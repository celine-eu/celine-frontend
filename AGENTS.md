## celine-frontend

pnpm monorepo containing all CELINE frontend applications and shared UI packages. Built with SvelteKit 2, Svelte 5, Vite, and TypeScript. Apps are deployed as Node.js Docker images via `@sveltejs/adapter-node`.

## Structure

`apps/**` are deployable SvelteKit applications, each with its own Dockerfile, release config, and dev server port. `packages/**` are reusable Svelte component libraries consumed by apps via `workspace:*` dependencies.

### Apps

| App | Package | Port | Backend |
|---|---|---|---|
| `apps/assistant` | `@celine-eu/assistant` | 3003 | `celine-ai-assistant` |
| `apps/roi` | `@celine-eu/roi` | 3004 | `celine-roi` |
| `apps/webapp` | `@celine-eu/webapp` | 3005 | `celine-webapp` (BFF) |
| `apps/grid` | `@celine-eu/grid` | 3006 | `celine-grid` |

### Packages

| Package | Scope | Consumers |
|---|---|---|
| `packages/ui` | `@celine-eu/ui` — shared design system (Button, Modal, Panel, Icon, Skeleton, ThemeToggle, FeedbackWidget) and `theme.css` | all apps |
| `packages/assistant-ui` | `@celine-eu/assistant-ui` — chat widget components (AssistantWidget, ChatCore, Composer, MessageList, history, attachments) | assistant, webapp |
| `packages/roi-ui` | `@celine-eu/roi-ui` — ROI calculator components (RoiCore, RoiResults, MapPicker, RoiWidget) | roi |

Packages export via `src/index.ts` (or `.js`) and use `peerDependencies` on `svelte` and `svelte-i18n`. They are not published to npm — consumed only within the workspace.

## Development

```sh
pnpm install            # or: task setup
task dev:<app>          # eg task dev:webapp — starts vite on the app's port
pnpm --filter @celine-eu/<app> check   # svelte-check + tsc
```

## i18n

Apps using `svelte-i18n` store translations in `src/lib/i18n/{en,it,es}.json`. Setup is in `src/lib/i18n/index.ts`, loaded from `+layout.ts`.

## Releasing

Each app is independently versioned via `release-it` with conventional commits. Tags follow the pattern `<app>-v<version>` (e.g. `roi-v0.13.0`). Commits use `chore(<app>): release v<version>`.

```sh
task release:<app>          # bump, changelog, tag, push
task release:<app>:dry      # preview
```

## CI/CD

`release.yaml` triggers on push to `main` and on version tags. It detects which apps changed (including `packages/**` changes) and builds + pushes Docker images to `ghcr.io/celine-eu/celine-frontend-<app>`. Tagged pushes also update the `latest` tag.

## Conventions

- Scope commits to the affected app: `feat(webapp): ...`, `fix(roi): ...`. Use no scope for cross-cutting changes.
- Keep shared logic in the appropriate package under `packages/`. App-specific components stay in `apps/<app>/src/lib/`.
- Package `src/internal/` contains components not re-exported from the package index.
- Apps connect to backends via `host.docker.internal` or `*.celine.localhost` depending on the environment.
