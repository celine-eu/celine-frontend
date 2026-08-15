# What the packages/apps split actually buys, and where an app deliberately differs

The monorepo was set up so reusable components live in `packages/` and full UIs live in
`apps/`. That is the intent. This entry records what is **true today**, measured
2026-08-15, because the gap between the two is where wrong assumptions come from.

## One package is genuinely shared; the others are not

Measured by actual imports under `apps/*/src`, not by declared dependencies:

| Package | Imported by | What that makes it |
|---|---|---|
| `@celine-eu/ui` | assistant, grid, roi, webapp | a design system. Shared by construction |
| `@celine-eu/assistant-ui` | **assistant, webapp** | the only component library reused across two different apps |
| `@celine-eu/roi-ui` | roi | a reuse boundary with exactly one consumer |

**`assistant-ui` is the case the split was built for**: the chat widget is developed in
`apps/assistant` and embedded in `apps/webapp`. It is the one place where extracting a
package paid for itself.

`roi-ui` is not reused. That is not a defect — separating a widget from its app shell is a
reasonable thing to do for its own sake — but do not reason from "it is in `packages/`,
therefore several apps depend on it". Before changing `roi-ui`, the blast radius is
`apps/roi` and nothing else. Before changing `assistant-ui`, **check `apps/webapp` too**;
that is the one that gets forgotten.

## `grid` opts out of the shared theme, deliberately

Confirmed by the operator, 2026-08-15. **This is a decision, not drift. Do not "fix" it.**

| | assistant | roi | webapp | grid |
|---|---|---|---|---|
| imports `@celine-eu/ui/theme.css` | yes | yes | yes | **no** |
| imports `@celine-eu/ui/session` | yes | yes | yes | yes |
| `ThemeToggle` present | no | no | **yes** | no |
| locales shipped | en, es, it | en, es, it | en, es, it | **en, it** |

`grid`'s `+layout.svelte` imports only its own `app.css`, which pulls in maplibre's own
stylesheet from `node_modules`. It takes the shared *session* module but not the shared
*theme*.

The reason for the opt-out is not recorded here, and this entry does not invent one. What
matters operationally: **a change to `packages/ui/src/theme.css` does not reach `grid`**,
so "I updated the shared theme" is not a statement about all four apps. If you believe
`grid` should adopt it, that is a conversation, not a cleanup.

The missing `es` translation in `grid` is part of the same confirmed decision.

## Dark/light is only switchable in one app

`ThemeToggle` ships in `@celine-eu/ui` and is used **only by `webapp`**. The other apps
render whatever the theme resolves to and offer the user no control. Adding a toggle to an
app is therefore a product change, not a wiring change.

## Where app-specific code belongs

Shared logic goes in the matching `packages/` library; app-specific components stay in
`apps/<app>/src/lib/`. `packages/*/src/internal/` holds components deliberately **not**
re-exported from the package index — importing from `internal` across a package boundary
is reaching past a decision someone made on purpose.

Packages export through `packages/<name>/src/index.ts` (or `.js`) and declare
`peerDependencies` on `svelte` and `svelte-i18n`. None are published to npm; they are
consumed only through `workspace:*`.
