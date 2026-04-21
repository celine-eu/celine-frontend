<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import maplibregl from 'maplibre-gl';
  import { themeOverride } from '$lib/stores';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  import FilterBar from '$lib/components/FilterBar.svelte';
  import LineInspectPanel from '$lib/components/LineInspectPanel.svelte';

  import {
    getWindMap,
    getHeatMap,
    getSubstationsMap,
    getFilters,
    type FeatureCollection,
    type GridFilters,
  } from '$lib/api';

  // ---------------------------------------------------------------------------
  // Network ID — derived from the authenticated user's DSO organisation
  // ---------------------------------------------------------------------------
  const NETWORK_ID = $derived(data.me?.network_id ?? '');

  // ---------------------------------------------------------------------------
  // Map state
  // ---------------------------------------------------------------------------
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let activeMapStyle = $state('');

  let showWind = $state(true);
  let showHeat = $state(true);
  let showCabine = $state(false);

  let inspectedFeature = $state<Record<string, unknown> | null>(null);
  let loading = $state(false);

  let filterDates = $state<string[]>([]);
  let filterSubstations = $state<string[]>([]);
  let filterLines = $state<string[]>([]);
  let filterUnits = $state<string[]>([]);
  let filterRisk = $state<string[]>([]);

  const selectedDate = $derived(filterDates[0] ?? '');

  // Date bounds: Jan 1 of current year → tomorrow (+1 day)
  const minDate = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  let availSubstations = $state<string[]>([]);
  let availLines = $state<string[]>([]);
  let availUnits = $state<string[]>([]);

  // ---------------------------------------------------------------------------
  // Line dash patterns
  // ---------------------------------------------------------------------------
  const DASH_BY_TYPE: Record<string, number[]> = {
    overhead_bare: [1],
    overhead_insulated: [6, 2, 1, 2],
    underground_cable: [4, 3],
    overhead_vegetated: [2, 2],
  };

  // Neutral colours for NORMAL/GREEN risk — aerial vs underground use different shades of grey
  const NORMAL_COLOR_WIND = '#9ca3af'; // lighter grey — overhead / aerial lines
  const NORMAL_COLOR_HEAT = '#374151'; // darker grey — underground cables

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function buildFilters(): GridFilters {
    return {
      networkId: NETWORK_ID,
      dates: filterDates,
      operational_unit: filterUnits,
      line_name: filterLines,
      substation_name: filterSubstations,
      risk_level: filterRisk,
    };
  }

  // ---------------------------------------------------------------------------
  // URL state sync
  // ---------------------------------------------------------------------------

  function syncUrl() {
    const params = new URLSearchParams();
    if (filterDates[0]) params.set('date', filterDates[0]);
    filterSubstations.forEach((v) => params.append('substation', v));
    filterLines.forEach((v) => params.append('line', v));
    filterUnits.forEach((v) => params.append('unit', v));
    filterRisk.forEach((v) => params.append('risk', v));
    if (map) {
      const c = map.getCenter();
      params.set('lat', c.lat.toFixed(5));
      params.set('lng', c.lng.toFixed(5));
      params.set('zoom', map.getZoom().toFixed(2));
    }
    history.replaceState(null, '', '?' + params.toString());
  }

  function readUrlFilters() {
    const p = new URLSearchParams(window.location.search);
    return {
      date: p.get('date') ?? undefined,
      substations: p.getAll('substation'),
      lines: p.getAll('line'),
      units: p.getAll('unit'),
      risk: p.getAll('risk'),
    };
  }

  function readUrlMapState(): { lat: number; lng: number; zoom: number } | null {
    const p = new URLSearchParams(window.location.search);
    const lat = p.get('lat');
    const lng = p.get('lng');
    const zoom = p.get('zoom');
    if (lat && lng && zoom) return { lat: parseFloat(lat), lng: parseFloat(lng), zoom: parseFloat(zoom) };
    return null;
  }

  function shareLink() {
    syncUrl();
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  }

  function exportCsv(fc: FeatureCollection, filename: string) {
    if (!fc.features.length) return;
    const keys = Object.keys(fc.features[0].properties);
    const rows = [
      keys.join(','),
      ...fc.features.map((f) =>
        keys.map((k) => JSON.stringify(f.properties[k] ?? '')).join(',')
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  // ---------------------------------------------------------------------------
  // Bounds fitting
  // ---------------------------------------------------------------------------
  let hasFit = false;

  function fitToData(...collections: FeatureCollection[]) {
    if (!map || hasFit) return;

    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

    function extendCoord(c: number[]) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    }

    function extendGeometry(geom: GeoJSON.Geometry) {
      if (geom.type === 'Point') {
        extendCoord(geom.coordinates as number[]);
      } else if (geom.type === 'LineString' || geom.type === 'MultiPoint') {
        (geom.coordinates as number[][]).forEach(extendCoord);
      } else if (geom.type === 'Polygon' || geom.type === 'MultiLineString') {
        (geom.coordinates as number[][][]).forEach((ring) => ring.forEach(extendCoord));
      } else if (geom.type === 'MultiPolygon') {
        (geom.coordinates as number[][][][]).forEach((poly) =>
          poly.forEach((ring) => ring.forEach(extendCoord))
        );
      }
    }

    for (const fc of collections) {
      for (const f of fc.features) {
        if (f.geometry) extendGeometry(f.geometry as GeoJSON.Geometry);
      }
    }

    if (!isFinite(minLng)) return;

    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, maxZoom: 14 });
    hasFit = true;
  }

  // ---------------------------------------------------------------------------
  // Map layer management
  // ---------------------------------------------------------------------------
  function upsertGeoJsonSource(id: string, data: FeatureCollection) {
    if (!map) return;
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(data as GeoJSON.FeatureCollection);
    } else {
      map.addSource(id, { type: 'geojson', data: data as GeoJSON.FeatureCollection });
    }
  }

  function addLineLayer(sourceId: string, layerId: string, visible = true, normalColor = '#374151') {
    if (!map || map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'risk_level'], 'NORMAL'], normalColor,
          ['coalesce', ['get', 'risk_color_hex'], '#808080'],
        ],
        'line-width': 3,
        'line-opacity': 0.9,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible ? 'visible' : 'none' },
    });
    map.on('click', layerId, (e) => {
      if (e.features?.[0]) inspectedFeature = e.features[0].properties as Record<string, unknown>;
    });
    map.on('mouseenter', layerId, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

  function addCircleLayer(sourceId: string, layerId: string, visible = true) {
    if (!map || map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 2,
        'circle-color': '#1E88E5',
        'circle-opacity': 0.8,
      },
      layout: { visibility: visible ? 'visible' : 'none' },
    });
    map.on('click', layerId, (e) => {
      if (e.features?.[0]) inspectedFeature = e.features[0].properties as Record<string, unknown>;
    });
    map.on('mouseenter', layerId, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

  function setLayerVisibility(layerId: string, visible: boolean) {
    if (!map || !map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }

  // ---------------------------------------------------------------------------
  // Map style (dark / light)
  // ---------------------------------------------------------------------------
  const STYLE_DARK = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const STYLE_LIGHT = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

  function currentStyleUrl(): string {
    const dark =
      document.documentElement.classList.contains('dark') ||
      (!document.documentElement.classList.contains('light') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    return dark ? STYLE_DARK : STYLE_LIGHT;
  }

  function restoreLayers() {
    if (!map) return;
    if (windData.features.length) {
      upsertGeoJsonSource('wind', windData);
      addLineLayer('wind', 'wind-lines', showWind, NORMAL_COLOR_WIND);
    }
    if (heatData.features.length) {
      upsertGeoJsonSource('heat', heatData);
      addLineLayer('heat', 'heat-lines', showHeat, NORMAL_COLOR_HEAT);
    }
    if (cabineData.features.length) {
      upsertGeoJsonSource('cabine', cabineData);
      addCircleLayer('cabine', 'cabine-points', showCabine);
    }
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------
  let windData: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let heatData: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let cabineData: FeatureCollection = { type: 'FeatureCollection', features: [] };

  async function loadAllData() {
    loading = true;
    const f = buildFilters();
    const [wm, hm, cm] = await Promise.allSettled([
      getWindMap(f),
      getHeatMap(f),
      getSubstationsMap(NETWORK_ID),
    ]);

    if (wm.status === 'fulfilled') {
      windData = wm.value;
      upsertGeoJsonSource('wind', windData);
      addLineLayer('wind', 'wind-lines', showWind, NORMAL_COLOR_WIND);
    }
    if (hm.status === 'fulfilled') {
      heatData = hm.value;
      upsertGeoJsonSource('heat', heatData);
      addLineLayer('heat', 'heat-lines', showHeat, NORMAL_COLOR_HEAT);
    }
    if (cm.status === 'fulfilled') {
      cabineData = cm.value;
      upsertGeoJsonSource('cabine', cabineData);
      addCircleLayer('cabine', 'cabine-points', showCabine);
    }

    fitToData(windData, heatData, cabineData);
    loading = false;
  }

  function applyFilters(f: {
    substations: string[]; lines: string[]; units: string[]; risk: string[];
  }) {
    filterSubstations = f.substations;
    filterLines = f.lines;
    filterUnits = f.units;
    filterRisk = f.risk;
    syncUrl();
    loadAllData();
  }

  function onDateChange(dateStr: string) {
    filterDates = dateStr ? [dateStr] : [];
    syncUrl();
    loadAllData();
  }

  // ---------------------------------------------------------------------------
  // Layer visibility reactivity
  // ---------------------------------------------------------------------------
  $effect(() => { setLayerVisibility('wind-lines', showWind); });
  $effect(() => { setLayerVisibility('heat-lines', showHeat); });
  $effect(() => { setLayerVisibility('cabine-points', showCabine); });

  // Swap basemap style when theme changes
  $effect(() => {
    $themeOverride; // subscribe to trigger on theme change
    if (!map) return;
    const newStyle = currentStyleUrl();
    if (newStyle !== activeMapStyle) {
      activeMapStyle = newStyle;
      map.setStyle(newStyle);
    }
  });

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  onMount(() => {
    const initialStyle = currentStyleUrl();
    activeMapStyle = initialStyle;

    const mapState = readUrlMapState();
    map = new maplibregl.Map({
      container: mapContainer,
      style: initialStyle,
      center: mapState ? [mapState.lng, mapState.lat] : [0, 40],
      zoom: mapState?.zoom ?? 2,
    });

    // Don't override URL-provided viewport with fitToData.
    if (mapState) hasFit = true;

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Sync URL whenever the user pans or zooms.
    map.on('moveend', syncUrl);

    // Re-add user layers whenever the basemap style is swapped (theme change).
    // Fires on initial load too, but restoreLayers is a no-op when data is empty.
    map.on('style.load', restoreLayers);

    map.on('load', async () => {
      // Apply URL filters if present, otherwise default to today.
      const urlFilters = readUrlFilters();
      if (urlFilters.substations.length) filterSubstations = urlFilters.substations;
      if (urlFilters.lines.length) filterLines = urlFilters.lines;
      if (urlFilters.units.length) filterUnits = urlFilters.units;
      if (urlFilters.risk.length) filterRisk = urlFilters.risk;

      const todayStr = new Date().toISOString().slice(0, 10);
      const dateFromUrl = urlFilters.date;
      filterDates = [dateFromUrl && dateFromUrl >= minDate && dateFromUrl <= maxDate
        ? dateFromUrl
        : todayStr];

      const f = await getFilters(NETWORK_ID).catch(() => null);
      if (f) {
        availSubstations = f.parent_substations;
        availLines = f.lines;
        availUnits = f.operational_units;
      }
      loadAllData();
    });

    return () => map?.remove();
  });
</script>

<div class="page">
  <!-- ── Body: sidebar + map ──────────────────────────────────────── -->
  <div class="body">
    <FilterBar
      substations={availSubstations}
      lines={availLines}
      units={availUnits}
      selectedDate={selectedDate}
      {minDate}
      {maxDate}
      bind:selectedSubstations={filterSubstations}
      bind:selectedLines={filterLines}
      bind:selectedUnits={filterUnits}
      bind:selectedRisk={filterRisk}
      onchange={applyFilters}
      ondatechange={onDateChange}
      onexport={(type) => exportCsv(type === 'wind' ? windData : heatData, `${type}_risk.csv`)}
      onshare={shareLink}
    />

    <div class="map-area">
      <!-- Layer toggles -->
      <div class="layer-controls">
        <label class="layer-toggle">
          <input type="checkbox" bind:checked={showWind} />
          <span class="swatch swatch-risk"></span>
          {$_('layer.wind')}
        </label>
        <label class="layer-toggle">
          <input type="checkbox" bind:checked={showHeat} />
          <span class="swatch swatch-risk"></span>
          {$_('layer.heat')}
        </label>
        <label class="layer-toggle">
          <input type="checkbox" bind:checked={showCabine} />
          <span class="swatch swatch-dot" style:background="#1E88E5"></span>
          {$_('layer.cabine')}
        </label>
      </div>

      <div class="map-container" bind:this={mapContainer}></div>

      {#if loading}
        <div class="map-loader" aria-label="Loading">
          <div class="spinner"></div>
        </div>
      {/if}

      <LineInspectPanel feature={inspectedFeature} onclose={() => (inspectedFeature = null)} />
    </div>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Body ────────────────────────────────────── */
  .body {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
  }

  /* ── Map area ────────────────────────────────── */
  .map-area {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  /* ── Loading overlay ─────────────────────── */
  .map-loader {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: blur(1px);
    z-index: 20;
    pointer-events: none;
  }

  :global(.dark) .map-loader {
    background: rgba(0, 0, 0, 0.35);
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(13, 148, 136, 0.25);
    border-top-color: var(--celine-primary, #0d9488);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Layer toggles — top-right overlay */
  .layer-controls {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: var(--celine-bg-elevated, rgba(255, 255, 255, 0.95));
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .layer-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--celine-text, #1e293b);
    cursor: pointer;
  }

  .layer-toggle input[type='checkbox'] {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: var(--celine-primary, #0d9488);
  }

  .swatch {
    width: 18px;
    height: 4px;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
  }

  .swatch.swatch-risk {
    background: linear-gradient(to right, #D00000 33%, #F08000 33% 66%, #16a34a 66%);
  }

  .swatch.swatch-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
</style>
