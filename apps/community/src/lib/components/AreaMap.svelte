<script lang="ts">
  // A read-only map of the REC's areas: each area's primary-substation boundary, from
  // the BFF's `GET …/areas/shapes` (celine-frontend ADR-0001). Nothing on it is edited:
  // no drawing, no handles, no dragging of shapes. `leaflet` is imported on mount, as
  // `packages/roi-ui` does, so server-side rendering never touches `window`, and only
  // when there is at least one shape to draw: no shape, no tile request.
  import { onMount, tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import type { Map as LeafletMap, GeoJSON as LeafletGeoJSON, Path } from 'leaflet';
  import {
    TILE_ATTRIBUTION,
    TILE_URL,
    areaFeatures,
    featureLabel,
    getAreaShapes,
    mapOutcomeMessage,
    type AreaFeature,
    type AreaFeatureCollection,
    type AreaShape,
  } from '$lib/areaMap';

  interface Props {
    communityKey: string;
    /** The area the dialog's select shows: drawn highlighted. */
    selected?: string;
  }

  let { communityKey, selected = '' }: Props = $props();

  let mapEl = $state<HTMLDivElement | null>(null);
  let phase = $state<'loading' | 'ready' | 'empty' | 'failed'>('loading');
  let failure = $state('');
  let missing = $state<AreaShape[]>([]);
  let collection = $state<AreaFeatureCollection | null>(null);

  let map: LeafletMap | null = null;
  let layer: LeafletGeoJSON | null = null;
  let destroyed = false;

  const translate = (key: string, options?: { values?: Record<string, string> }) => $_(key, options);

  function styleFor(feature: AreaFeature | undefined, chosenKey: string) {
    const chosen = !!feature && feature.properties.areaKey === chosenKey;
    return {
      color: chosen ? '#0f766e' : '#0d9488',
      weight: chosen ? 3 : 1.5,
      fillOpacity: chosen ? 0.3 : 0.1,
    };
  }

  async function draw(shapes: AreaFeatureCollection) {
    const mod = await import('leaflet');
    await import('leaflet/dist/leaflet.css');
    await tick();
    if (destroyed || !mapEl) return;
    const L = (mod.default ?? mod) as typeof import('leaflet');

    map = L.map(mapEl, { maxZoom: 18, boxZoom: false, keyboard: true });
    // Tiles are only the base: when the tile server is unreachable the boundaries
    // still draw on a blank background, and the select beside the map keeps working.
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);

    layer = L.geoJSON(shapes as unknown as Parameters<typeof L.geoJSON>[0], {
      style: (feature) => styleFor(feature as unknown as AreaFeature, selected),
      onEachFeature: (feature, target) => {
        // Text content, never HTML: an area name is data.
        const label = document.createElement('span');
        label.textContent = featureLabel((feature as unknown as AreaFeature).properties, translate);
        target.bindTooltip(label, { permanent: true, direction: 'center', className: 'area-map-label' });
      },
    }).addTo(map);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] });
  }

  onMount(() => {
    (async () => {
      const read = await getAreaShapes(communityKey);
      if (destroyed) return;
      if (!read.ok) {
        failure = mapOutcomeMessage(read.outcome, translate).text;
        phase = 'failed';
        return;
      }
      const drawn = areaFeatures(read.shapes.areas);
      missing = drawn.missing;
      if (drawn.collection.features.length === 0) {
        phase = 'empty';
        return;
      }
      collection = drawn.collection;
      phase = 'ready';
      await draw(drawn.collection);
    })();

    return () => {
      destroyed = true;
      map?.remove();
      map = null;
      layer = null;
    };
  });

  // The selected area follows the dialog's select.
  $effect(() => {
    const current = selected;
    layer?.eachLayer((item) => {
      const feature = (item as unknown as { feature?: AreaFeature }).feature;
      (item as Path).setStyle?.(styleFor(feature, current));
    });
  });
</script>

<section class="area-map" aria-label={$_('members.profile.map.title')}>
  <h3>{$_('members.profile.map.title')}</h3>
  {#if phase === 'loading'}
    <p class="hint">{$_('members.profile.map.loading')}</p>
  {:else if phase === 'failed'}
    <p class="outcome error" role="status">{failure}</p>
  {:else if phase === 'empty' && missing.length === 0}
    <p class="hint">{$_('members.profile.map.empty')}</p>
  {/if}
  {#if phase === 'ready' && collection}
    <div bind:this={mapEl} class="map" role="img" aria-label={$_('members.profile.map.aria')}></div>
  {/if}
  {#if missing.length}
    <p class="hint">{$_('members.profile.map.missing', { values: { areas: missing.map((area) => area.name?.trim() || area.areaKey).join(', ') } })}</p>
  {/if}
  <p class="hint">{$_('members.profile.map.read_only')}</p>
</section>

<style>
  .area-map { grid-column:1 / -1; display:grid; gap:.3rem; }
  .area-map h3 { margin:.4rem 0 0; font-size:.72rem; }
  .map { height:240px; width:100%; border:1px solid var(--community-border); border-radius:9px; overflow:hidden; }
  .hint { margin:0; color:var(--community-muted); font-size:.62rem; line-height:1.4; }
  .outcome { margin:0; font-size:.62rem; line-height:1.4; } .outcome.error { color:var(--community-danger); }
  :global(.area-map-label) { font-size:10px; font-weight:700; }
</style>
