---
slug: end-to-end-testing
created: 2026-08-15
status: proposed
requires-new-spec: false
---

# Plan — end-to-end tests for the four apps

## Where this came from

The agent-harness migration pass, 2026-08-15. The repository has **no test tooling at
all** — no Playwright, no Vitest, no runner in any of its seven `package.json` files. The
only checks are `pnpm -r check` and `pnpm -r build`, neither of which opens a browser.

## Why this is not simply "add Playwright"

Stated by the operator during the pass, and it is the whole reason this is a plan rather
than a task:

> There are no Playwright tests, since it would require the full API running and datasets
> populated. Not impossible but requires some level of orchestration.

That is the honest shape of the problem. Every app here is a thin client of a service in
another repository:

| App | Needs running |
|---|---|
| `apps/assistant` | `celine-ai-assistant`, plus Qdrant and an LLM |
| `apps/roi` | `celine-roi` |
| `apps/webapp` | `celine-webapp`, which fans out to the registry, digital twin and flexibility services |
| `apps/grid` | `celine-grid` |

And behind those: Postgres with **populated** data, Keycloak, and oauth2-proxy — because
every app's first action is a session check. A browser test that cannot log in tests
nothing.

So the cost is not the tests. It is standing up a reproducible platform with known data,
and that is not this repository's to own.

## The dependency, and where it lands

**The orchestration lands in `celine-dev`, after the agent-harness migration completes.**
That is the operator's decision, 2026-08-15, and it is the correct home: the workspace
already composes the stacks and already knows which component owns which service.

This plan therefore **stays `proposed` until that exists**. Writing browser tests first
would produce a suite that only runs on one machine, which is the failure mode the
repository already has by hand.

## What can be done before then, and is not blocked

These need no orchestration and are worth doing independently — but they are a different
plan if anyone picks them up, not a quiet substitute for this one:

- **Component tests** for `packages/ui` and `packages/assistant-ui`, with no backend at
  all. `assistant-ui` is the highest-value target: it is the only package consumed by two
  apps, so a regression there has the widest blast radius and the least visibility.
- **A runtime check for i18n keys.** A missing translation key fails at render, not at
  build, and three apps ship three locales while `grid` ships two.

## Open, and for the operator

1. **Which journeys?** End-to-end tests are only worth their cost against journeys people
   actually perform. That list is the operator's, not something to infer from the routes.
2. **How is the data fixed?** A seeded dataset that the assertions can depend on, or
   assertions loose enough to tolerate whatever is there. The first is more work and the
   only one that catches regressions.
3. **Does it gate CI, or run nightly?** A suite needing the whole platform is a slow one;
   gating every push on it is a decision with a cost.

None of these is inferred, and the plan does not execute until they are answered.

## Not a defect

The absence of tests here is owed work, not a fault in anything that exists. Nothing is
broken. If a defect is found while closing this, it is an issue (`gh issue create`), not
an entry in this file.
