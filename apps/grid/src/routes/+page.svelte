<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import maplibregl from 'maplibre-gl';

  import FilterBar from '$lib/components/FilterBar.svelte';
  import TrendSparkline from '$lib/components/TrendSparkline.svelte';
  import RiskDonut from '$lib/components/RiskDonut.svelte';
  import LineInspectPanel from '$lib/components/LineInspectPanel.svelte';

  import {
    getWindMap,
    getWindBosco,
    getWindAlertDistribution,
    getWindTrend,
    getHeatMap,
    getHeatAlertDistribution,
    getHeatTrend,
    getCabineMap,
    type FeatureCollection,
    type AlertDistributionItem,
    type TrendItem,
    type GridFilters,
  } from '$lib/api';

  // ---------------------------------------------------------------------------
  // Network ID — resolved from env or URL; fallback to 'default'
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

  // Layer visibility toggles
  let showWind = $state(true);
  let showHeat = $state(true);
  let showBosco = $state(false);
  let showCabine = $state(true);

  // Inspect panel
  let inspectedFeature = $state<Record<string, unknown> | null>(null);

  // Sidebar KPI data
  let windTrend = $state<TrendItem[]>([]);
  let heatTrend = $state<TrendItem[]>([]);
  let windDist = $state<AlertDistributionItem[]>([]);
  let heatDist = $state<AlertDistributionItem[]>([]);

  // Filter state
  let filterDates = $state<string[]>([]);
  let filterSubstations = $state<string[]>([]);
  let filterLines = $state<string[]>([]);
  let filterUnits = $state<string[]>([]);
  let filterRisk = $state<string[]>([]);

  // Available filter options (populated from initial data load)
  let availDates = $state<string[]>([]);
  let availSubstations = $state<string[]>([]);
  let availLines = $state<string[]>([]);
  let availUnits = $state<string[]>([]);

  // ---------------------------------------------------------------------------
  // Line dash patterns by conductor_type
  // ---------------------------------------------------------------------------
  // MapLibre line-dasharray: overhead_bare=solid, overhead_insulated=dot-dash, underground_cable=dashed
  const DASH_BY_TYPE: Record<string, number[]> = {
    overhead_bare: [1],
    overhead_insulated: [6, 2, 1, 2],
    underground_cable: [4, 3],
    overhead_vegetated: [2, 2],
  };

  // Non-critical lines (NORMAL risk) rendered in dark gray
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

  function extractOptions(features: FeatureCollection) {
    const dates = new Set<string>();
    const subs = new Set<string>();
    const lines = new Set<string>();
    const units = new Set<string>();
    for (const f of features.features) {
      const p = f.properties;
      if (p.date) dates.add(String(p.date));
      if (p.substation_name) subs.add(String(p.substation_name));
      if (p.line_name) lines.add(String(p.line_name));
      if (p.operational_unit) units.add(String(p.operational_unit));
    }
    availDates = [...dates].sort().reverse();
    availSubstations = [...subs].sort();
    availLines = [...lines].sort();
    availUnits = [...units].sort();
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

  function addLineLayer(sourceId: string, layerId: string) {
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
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });

    // Click handler — open inspect panel
    map.on('click', layerId, (e) => {
      if (e.features?.[0]) {
        inspectedFeature = e.features[0].properties as Record<string, unknown>;
      }
    });
    map.on('mouseenter', layerId, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

  function addCircleLayer(sourceId: string, layerId: string) {
    if (!map || map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 5,
        'circle-color': '#1E88E5',
        'circle-stroke-color': '#fff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.85,
      },
    });
    map.on('click', layerId, (e) => {
      if (e.features?.[0]) {
        inspectedFeature = e.features[0].properties as Record<string, unknown>;
      }
    });
    map.on('mouseenter', layerId, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

  function setLayerVisibility(layerId: string, visible: boolean) {
    if (!map || !map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  let windData: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let heatData: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let boscoData: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let cabineData: FeatureCollection = { type: 'FeatureCollection', features: [] };

  async function loadAllData() {
    const f = buildFilters();
    const [wm, hm, bm, cm, wd, hd, wt, ht] = await Promise.allSettled([
      getWindMap(f),
      getHeatMap(f),
      getWindBosco(f),
      getCabineMap(NETWORK_ID),
      getWindAlertDistribution(f),
      getHeatAlertDistribution(f),
      getWindTrend(NETWORK_ID),
      getHeatTrend(NETWORK_ID),
    ]);

    if (wm.status === 'fulfilled') {
      windData = wm.value;
      extractOptions(windData);
      upsertGeoJsonSource('wind', windData);
      addLineLayer('wind', 'wind-lines');
    }
    if (hm.status === 'fulfilled') {
      heatData = hm.value;
      upsertGeoJsonSource('heat', heatData);
      addLineLayer('heat', 'heat-lines');
    }
    if (bm.status === 'fulfilled') {
      boscoData = bm.value;
      upsertGeoJsonSource('bosco', boscoData);
      addLineLayer('bosco', 'bosco-lines');
    }
    if (cm.status === 'fulfilled') {
      cabineData = cm.value;
      upsertGeoJsonSource('cabine', cabineData);
      addCircleLayer('cabine', 'cabine-points');
    }

    if (wd.status === 'fulfilled') windDist = wd.value;
    if (hd.status === 'fulfilled') heatDist = hd.value;
    if (wt.status === 'fulfilled') windTrend = wt.value;
    if (ht.status === 'fulfilled') heatTrend = ht.value;
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
  $effect(() => { setLayerVisibility('bosco-lines', showBosco); });
  $effect(() => { setLayerVisibility('cabine-points', showCabine); });

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [11.5, 44.5], // roughly northern Italy
      zoom: 9,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('load', loadAllData);

    return () => map?.remove();
  });
</script>

<div class="page">
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
        <span class="swatch" style:background="#D00000"></span>
        {$_('layer.wind')}
      </label>
      <label class="layer-toggle">
        <input type="checkbox" bind:checked={showHeat} />
        <span class="swatch" style:background="#F7D000"></span>
        {$_('layer.heat')}
      </label>
      <label class="layer-toggle">
        <input type="checkbox" bind:checked={showBosco} />
        <span class="swatch" style:background="#22c55e"></span>
        {$_('layer.bosco')}
      </label>
      <label class="layer-toggle">
        <input type="checkbox" bind:checked={showCabine} />
        <span class="swatch" style:background="#1E88E5"></span>
        {$_('layer.cabine')}
      </label>
    </div>

    <!-- Map container -->
    <div class="map-container" bind:this={mapContainer}></div>

    <!-- Line inspect panel (floating, bottom-right) -->
    <LineInspectPanel feature={inspectedFeature} onclose={() => (inspectedFeature = null)} />

    <!-- KPI sidebar (bottom-left) -->
    <aside class="kpi-sidebar">
      <TrendSparkline
        label={$_('kpi.wind_trend')}
        unit="m/s"
        data={windTrend}
        color="#3b82f6"
      />
      <TrendSparkline
        label={$_('kpi.heat_trend')}
        unit="°C"
        data={heatTrend}
        color="#ef4444"
      />
      <RiskDonut label={$_('layer.wind')} data={windDist} />
      <RiskDonut label={$_('layer.heat')} data={heatDist} />

      <button
        class="export-btn"
        onclick={() => exportCsv(windData, 'wind_risk.csv')}
      >
        {$_('export.button')} (wind)
      </button>
      <button
        class="export-btn"
        onclick={() => exportCsv(heatData, 'heat_risk.csv')}
      >
        {$_('export.button')} (heat)
      </button>
    </aside>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

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

  /* KPI sidebar — bottom-left overlay */
  .kpi-sidebar {
    position: absolute;
    bottom: 2.5rem; /* above scale control */
    left: 0.75rem;
    width: 220px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 10;
    max-height: 55vh;
    overflow-y: auto;
  }

  .export-btn {
    padding: 0.375rem 0.75rem;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    color: var(--celine-text, #1e293b);
    text-align: left;
  }

  .export-btn:hover {
    background: var(--celine-bg-hover, #f1f5f9);
  }
</style>
