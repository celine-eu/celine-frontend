# Decisions

Architecture decision records: **why a technical choice was made here**, when the reason
is not derivable from the code and would otherwise be re-litigated.

One file per decision, named `ADR-####-short-slug.md`, with this shape:

```markdown
# ADR-0001 — <the decision, as a statement>

**Date:** <ISO-8601>
**Status:** accepted | superseded by ADR-####

## Context
<what forced a choice. The constraint, and what had already been tried.>

## Decision
<what was decided, in the imperative.>

## Consequences
<what this costs, what it forecloses, and what will tempt someone to undo it.>
```

## What is not an ADR

- **A requirement.** What the product must do belongs with the requirements, where it can
  be traced to a test. An ADR is measured by nothing.
- **A rule with a referent that something already measures.** If a statement could carry
  an identifier and a test that names it, put it where that measurement happens. Deciding
  it here hides it from the report.
- **A procedure.** That is a playbook, and playbooks live in the companion.
- **A fact about the code.** That is knowledge, and knowledge lives in the companion.

An ADR is immutable once accepted. It is superseded by a later ADR that names it, never
edited to say something else.

## The records

| ADR | Decision |
|---|---|
| [ADR-0001](ADR-0001-the-community-area-map-uses-leaflet-and-openstreetmap-tiles.md) | The community dashboard's area map uses leaflet and OpenStreetMap's public tiles, as `packages/roi-ui` does; the tile server seeing managers' requests is accepted |

### Implementation notes

An accepted ADR is not edited, so what has landed since it was written is recorded here.

- **ADR-0001 is implemented.** Its opening paragraph says nothing is implemented yet; that is no longer
  true. The map is `apps/community/src/lib/components/AreaMap.svelte` with
  `apps/community/src/lib/areaMap.ts`, drawn in the members page's role-and-area dialog
  (`apps/community/README.md`). `apps/community/tests/area-map.test.mjs` checks the module;
  `e2e/community-area-map.spec.ts` renders the map in Chromium against the UI dev server with
  the BFF and the tile server stubbed.
