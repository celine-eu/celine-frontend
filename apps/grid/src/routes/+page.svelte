<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import maplibregl from 'maplibre-gl';
  import { themeOverride } from '$lib/stores';

  import FilterBar from '$lib/components/FilterBar.svelte';
  import TrendSparkline from '$lib/components/TrendSparkline.svelte';
  import RiskDonut from '$lib/components/RiskDonut.svelte';
  import LineInspectPanel from '$lib/components/LineInspectPanel.svelte';

  import {
    getWindMap,

    getWindAlertDistribution,
    getWindTrend,
    getHeatMap,
    getHeatAlertDistribution,
    getHeatTrend,
    getSubstationsMap,
    getFilters,
    type FeatureCollection,
    type AlertDistributionItem,
    type TrendItem,
    type GridFilters,
  } from '$lib/api';

  // ---------------------------------------------------------------------------
  // Network ID
  // ---------------------------------------------------------------------------
  const NETWORK_ID =
    (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('network')) ??
    import.meta.env.VITE_NETWORK_ID ??
    'default';

  // ---------------------------------------------------------------------------
  // Map state
  // ---------------------------------------------------------------------------
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let activeMapStyle = $state('');

  let showWind = $state(true);
  let showHeat = $state(true);
  let showCabine = $state(true);

  let inspectedFeature = $state<Record<string, unknown> | null>(null);

  let windTrend = $state<TrendItem[]>([]);
  let heatTrend = $state<TrendItem[]>([]);
  let windDist = $state<AlertDistributionItem[]>([]);
  let heatDist = $state<AlertDistributionItem[]>([]);

  let filterDates = $state<string[]>([]);
  let filterSubstations = $state<string[]>([]);
  let filterLines = $state<string[]>([]);
  let filterUnits = $state<string[]>([]);
  let filterRisk = $state<string[]>([]);

  let availDates = $state<string[]>([]);
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

  const NORMAL_COLOR = '#374151';

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

  function buildAvailDates(): string[] {
    const dates: string[] = [];
    for (let i = 0; i <= 2; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().slice(0, 10));
    }
    return dates;
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

  function addLineLayer(sourceId: string, layerId: string, visible = true) {
    if (!map || map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'risk_level'], 'NORMAL'], NORMAL_COLOR,
          ['==', ['get', 'risk_level'], 'GREEN'], NORMAL_COLOR,
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
      addLineLayer('wind', 'wind-lines', showWind);
    }
    if (heatData.features.length) {
      upsertGeoJsonSource('heat', heatData);
      addLineLayer('heat', 'heat-lines', showHeat);
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
    const f = buildFilters();
    const [wm, hm, cm, wd, hd, wt, ht] = await Promise.allSettled([
      getWindMap(f),
      getHeatMap(f),
      getSubstationsMap(NETWORK_ID),
      getWindAlertDistribution(f),
      getHeatAlertDistribution(f),
      getWindTrend(NETWORK_ID),
      getHeatTrend(NETWORK_ID),
    ]);

    if (wm.status === 'fulfilled') {
      windData = wm.value;
      upsertGeoJsonSource('wind', windData);
      addLineLayer('wind', 'wind-lines', showWind);
    }
    if (hm.status === 'fulfilled') {
      heatData = hm.value;
      upsertGeoJsonSource('heat', heatData);
      addLineLayer('heat', 'heat-lines', showHeat);
    }
    if (cm.status === 'fulfilled') {
      cabineData = cm.value;
      upsertGeoJsonSource('cabine', cabineData);
      addCircleLayer('cabine', 'cabine-points', showCabine);
    }
    if (wd.status === 'fulfilled') windDist = wd.value;
    if (hd.status === 'fulfilled') heatDist = hd.value;
    if (wt.status === 'fulfilled') windTrend = wt.value;
    if (ht.status === 'fulfilled') heatTrend = ht.value;

    fitToData(windData, heatData, cabineData);
  }

  function applyFilters(f: {
    dates: string[]; substations: string[]; lines: string[]; units: string[]; risk: string[];
  }) {
    filterDates = f.dates;
    filterSubstations = f.substations;
    filterLines = f.lines;
    filterUnits = f.units;
    filterRisk = f.risk;
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
      map.once('style.load', restoreLayers);
      map.setStyle(newStyle);
    }
  });;

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  onMount(() => {
    const initialStyle = currentStyleUrl();
    activeMapStyle = initialStyle;
    map = new maplibregl.Map({
      container: mapContainer,
      style: initialStyle,
      center: [0, 40],
      zoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', async () => {
      availDates = buildAvailDates();
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
  <!-- ── Top bar: KPI charts ─────────────────────────────────────── -->
  <div class="top-bar">
    <div class="chart-card">
      <TrendSparkline label={$_('kpi.wind_trend')} unit="m/s" data={windTrend} color="#3b82f6" />
    </div>
    <div class="chart-card">
      <TrendSparkline label={$_('kpi.heat_trend')} unit="°C" data={heatTrend} color="#ef4444" />
    </div>
    <div class="chart-card donut-card">
      <RiskDonut label={$_('layer.wind')} data={windDist} />
    </div>
    <div class="chart-card donut-card">
      <RiskDonut label={$_('layer.heat')} data={heatDist} />
    </div>
    <div class="top-bar-actions">
      <button class="export-btn" onclick={() => exportCsv(windData, 'wind_risk.csv')}>
        {$_('export.button')} (wind)
      </button>
      <button class="export-btn" onclick={() => exportCsv(heatData, 'heat_risk.csv')}>
        {$_('export.button')} (heat)
      </button>
    </div>
  </div>

  <!-- ── Body: sidebar + map ──────────────────────────────────────── -->
  <div class="body">
    <FilterBar
      dates={availDates}
      substations={availSubstations}
      lines={availLines}
      units={availUnits}
      bind:selectedDates={filterDates}
      bind:selectedSubstations={filterSubstations}
      bind:selectedLines={filterLines}
      bind:selectedUnits={filterUnits}
      bind:selectedRisk={filterRisk}
      onchange={applyFilters}
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

  /* ── Top bar ─────────────────────────────────── */
  .top-bar {
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--celine-bg-elevated, #fff);
    border-bottom: 1px solid var(--celine-border, #e2e8f0);
    flex-shrink: 0;
    overflow-x: auto;
  }

  .chart-card {
    flex: 1;
    min-width: 160px;
    max-width: 280px;
  }

  .chart-card.donut-card {
    min-width: 180px;
    max-width: 220px;
  }

  .top-bar-actions {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.375rem;
    flex-shrink: 0;
    padding-left: 0.5rem;
    border-left: 1px solid var(--celine-border, #e2e8f0);
  }

  .export-btn {
    padding: 0.375rem 0.75rem;
    background: var(--celine-bg, #f8fafc);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--celine-text, #1e293b);
    white-space: nowrap;
  }

  .export-btn:hover {
    background: var(--celine-bg-hover, #f1f5f9);
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
