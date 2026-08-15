# What this repository depends on, and what depends on it

The minimum perimeter for working here. Paths are written `../<repo>`, which resolves when
this repository is checked out inside the `celine-dev` workspace and not otherwise.

**Working on this repository alone, your visibility is limited to it.** Every app here is
a front end for a service owned elsewhere, and nothing in this tree can tell you whether
one of those APIs has changed. If a change touches a backend call, get the `celine-dev`
workspace and read the component-model entry in its `.agents/knowledge/` — named rather
than linked, because a path into the workspace does not resolve from inside a member.

## Consumed

Four apps, four backends, one each:

| App | Port | Backend |
|---|--:|---|
| `apps/assistant` | 3003 | `../celine-ai-assistant` |
| `apps/roi` | 3004 | `../celine-roi` |
| `apps/webapp` | 3005 | `../celine-webapp` — a backend-for-frontend, not a domain service |
| `apps/grid` | 3006 | `../celine-grid` |

`webapp` is the odd one: it talks to a BFF that fans out to several services, so a change
behind it can reach `../rec-registry`, `../digital-twin` or `../flexibility-api` without
anything here referring to them.

Apps reach backends via `host.docker.internal` or `*.celine.localhost` depending on the
environment. Authentication is handled at the edge by oauth2-proxy, which is **not** in
this repository — the session guard here (`@celine-eu/ui/session`) notices expiry; it does
not perform login.

## Consumed by

Nothing in the platform imports this repository. Its consumers are **people**, through
four container images that CI publishes as `ghcr.io/celine-eu/celine-frontend-<app>`.

## Which seams this repository sits on

Two of the five, both inbound:

- **API contract** — every app is a client of one. A response shape changed upstream
  breaks a page and nothing here fails to compile. This is the seam that matters.
- **Identity and policy** — apps run behind oauth2-proxy and follow the platform's session
  behaviour rather than defining their own.

It owns no data schema, publishes no governance metadata, and maps nothing to an ontology.

## Related

- `the-monorepo-is-not-uniform.md` — which packages are actually reused, and where `grid`
  deliberately differs from the other three apps.
