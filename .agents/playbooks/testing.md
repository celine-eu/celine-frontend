# Playbook — testing a change

**There is no test tooling in this repository.** No Playwright, no Vitest, no test runner
in any of the seven `package.json` files — verified 2026-08-15. Nothing asserts that a
component renders, that a store transitions, or that a page loads.

What exists are two static checks and a build. Use them, and be precise about what they
prove, because none of them opens a browser.

## Before touching anything

```bash
pnpm install          # or: task setup
pnpm -r check         # svelte-check + tsc, every app and package
```

Record the result. `check` is the closest thing to a suite here and it is fast enough that
skipping it has no excuse.

For one workspace member:

```bash
pnpm --filter @celine-eu/webapp check
```

## The layers

| Layer | Command | Proves |
|---|---|---|
| types | `pnpm -r check` | Svelte components typecheck and props match their declarations |
| build | `pnpm -r build` or `task build:<app>` | each app compiles under `adapter-node` and Vite resolves every import |
| container | `task docker:<app>` | the image builds |
| unit | **none exists** | — |
| component | **none exists** | — |
| end-to-end | **none exists** | see `.agents/plans/end-to-end-testing.md` |
| by hand | `task dev:<app>` | that the change works, for you, once |

**A green `pnpm -r check` says the types line up. It says nothing about whether the page
renders**, whether a request succeeds, or whether a translation key exists at runtime.
Report it as what it is.

## The trap: types do not cross the API boundary

Every app is a client of a backend owned by another repository, and **nothing here
typechecks against those APIs**. A response shape that changed upstream passes `check`,
passes `build`, and fails in the browser. When your change touches a backend call, say so
explicitly and say that no automated layer covered it.

## The other trap: shared packages have uneven blast radius

`pnpm -r check` covers everything, so it will catch a type break in a package's consumers.
It will not tell you a *behavioural* change reached an app you did not think about —
particularly `@celine-eu/assistant-ui`, which `apps/webapp` uses as well as
`apps/assistant`. See `.agents/knowledge/the-monorepo-is-not-uniform.md`.

Changing `packages/ui/src/theme.css` does **not** affect `apps/grid`, which does not import
it. That is deliberate.

## Checking a change by hand

```bash
task dev:webapp     # or dev:assistant, dev:roi, dev:grid
```

The app's backend must be running for anything past the shell to work; ports and backends
are in `.agents/knowledge/what-this-repository-depends-on.md`. Without it you are testing
that the layout renders, which is worth saying rather than implying.

If the change touches i18n, check more than English — `en`, `es` and `it` for three apps,
`en` and `it` for `grid`. A missing key does not fail the build.

## Reporting

Name which of `check`, `build` and by-hand you ran, and name the layers that do not exist.
"Tested" is not available in this repository yet; "typechecks and builds, exercised by hand
against a running backend" is, and it is a different claim.
