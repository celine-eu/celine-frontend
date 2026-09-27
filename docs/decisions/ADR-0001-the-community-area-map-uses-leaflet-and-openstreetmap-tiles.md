# ADR-0001 — The community dashboard's area map uses leaflet and OpenStreetMap's public tiles, as `packages/roi-ui` does

**Date:** 2026-09-27
**Status:** accepted

Nothing in this record is implemented yet. The map is planned with the role and area dialog of
`apps/community` (see `celine-community`, ADR-0003 and ADR-0004 there); the meter dialog, which
has no map, is implemented.

## Context

`apps/community` is getting a read-only map of the REC's areas: each area's primary-substation
boundary, drawn from a GeoJSON shape the BFF returns, so a manager can see which area a member
belongs to before changing it. Nothing on the map is edited.

The monorepo already draws maps in one place. `packages/roi-ui` (`MapPicker.svelte`) uses
`leaflet` 1.9, imported lazily in `onMount` so server-side rendering never touches `window`, with
the public OpenStreetMap tile server (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`) and its
attribution. A second map library, or a self-hosted tile server, would be a new dependency and a
new service for one read-only layer.

A browser that draws a raster tile layer asks the tile server for every tile it shows. The tile
server therefore sees each request: the manager's IP address and user agent, the page's origin as
referrer, and which tiles, so roughly where the REC is and when its manager looks at it. It sees
no member, no name, no sensor id and no boundary shape: the shapes come from the BFF and are drawn
in the browser.

## Decision

**Draw the area map with `leaflet`, as `packages/roi-ui` does, with the same tile source.**

- `apps/community` depends on `leaflet` directly, in the version range `packages/roi-ui` uses, and
  imports it lazily on mount the same way. It does not depend on `@celine-eu/roi-ui`: that package
  is the ROI calculator, and its map is a picker.
- The base layer is OpenStreetMap's public tile server, with the OpenStreetMap attribution shown on
  the map, as in `MapPicker.svelte`.
- The boundaries are a GeoJSON layer from the BFF's answer. The map has no drawing or editing
  tools.

**Accept that the tile server sees each manager's map requests.** The requester accepted it on
2026-09-27. Only map tiles are requested from it; no participant data leaves the dashboard for it.

## Consequences

- **A third party learns that a manager is looking at an area, and from where.** The same is
  already true of the ROI calculator's map. The dashboard's personal-data notes must name the tile
  server as a recipient of managers' IP addresses.
- **The map depends on a public service and its usage policy** (attribution, fair use, a valid
  referrer). If the tile server is unreachable or throttles, the boundaries still draw on a blank
  base; the area select beside the map keeps working.
- **One map library in the monorepo.** A change of library or tile source is made for both apps
  together, in a record that supersedes this one.
- **What will tempt someone to undo this:**
  - switching to a commercial tile provider "for nicer tiles". That adds an API key to the browser
    and a second recipient of managers' requests; decide it with the requester.
  - self-hosting tiles "for privacy". It removes the third party, and adds a service to run and
    keep current. Worth it if the recipient ever stops being acceptable; not before.
