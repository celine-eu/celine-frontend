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


---

# Working in this repository

Added when the agent harness was adopted. Everything above is this repository's own
guidance and is unchanged.

## Read in this order

1. This file.
2. `.agents/README.md` — the rulebook: where work is recorded, and how.
3. `.agents/knowledge/` — what is true of the code and not visible in it.
4. `docs/`, on demand. Never speculatively.

## Where things are

| Looking for | Go to |
|---|---|
| a repeatable procedure | `.agents/playbooks/` |
| a trap that is true of the code and not obvious from it | `.agents/knowledge/` |
| why a technical choice was made | `docs/decisions/` |
| what is being worked on, and how far it has got | `.agents/plans/`, `.agents/work/` |
| what is broken | the issue tracker — `gh issue list`. Not a file in this repository |

## Behavioural settings

- **Ask rather than decide** when a request needs a requirement that does not exist yet.
- **Write the plan first** for anything non-trivial, and create its work directory before
  the first change of any phase.
- **Report faithfully.** Name what ran, what did not, and what was skipped.
- **Establish the baseline before changing anything**, so a pre-existing failure is never
  attributed to your change.

## Crossing a seam

This repository is one component of a platform assembled from separate repositories.
Before changing anything exposed to another one, check whether it moves an API contract, a
data schema, governance metadata, an ontology mapping, or identity and policy behaviour.
