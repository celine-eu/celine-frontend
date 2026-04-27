<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import maplibregl from 'maplibre-gl';
  import { themeOverride } from '$lib/stores';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  import FilterBar from '$lib/components/FilterBar.svelte';

  import {
    getFilters,
    getShapes,
    getRisks,
    getRisksNow,
    type FeatureCollection,
    type GeoFeature,
    type GridFilters,
    type GridShapeProperties,
    type GridRisk,
  } from '$lib/api';

  type DataMode = 'forecast' | 'nowcasting';

  // ---------------------------------------------------------------------------
  // Network ID
  // ---------------------------------------------------------------------------
  const NETWORK_ID = $derived(data.me?.network_id ?? '');

  // ---------------------------------------------------------------------------
  // Map state
  // ---------------------------------------------------------------------------
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let activeMapStyle = $state('');
  let currentPopup: maplibregl.Popup | null = null;
  let hoveredFeatureId: number | null = null;
  let hoveredSourceId: string | null = null;

  let showOverheadBare = $state(true);
  let showOverheadInsulated = $state(true);
  let showUndergroundCable = $state(true);
  let showCabine = $state(true);

  let loading = $state(false);
  let loadError = $state<string | null>(null);

  let dataMode = $state<DataMode>('forecast');
  let filterDates = $state<string[]>([]);
  let filterSubstations = $state<string[]>([]);
  let filterSecondarySubstations = $state<string[]>([]);
  let filterLines = $state<string[]>([]);
  let filterUnits = $state<string[]>([]);
  let filterMunicipalities = $state<string[]>([]);
  let filterRisk = $state<string[]>([]);

  const selectedDate = $derived(filterDates[0] ?? '');

  const minDate = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const maxDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  let availSubstations = $state<string[]>([]);
  let availLines = $state<string[]>([]);
  let availUnits = $state<string[]>([]);
  let availMunicipalities = $state<string[]>([]);

  // ---------------------------------------------------------------------------
  // Conductor-type layer config
  // ---------------------------------------------------------------------------
  const UNIFORM_GREY = '#6b7280';

  const LINE_LAYER_DEFS = [
    { sourceId: 'overhead-bare',      layerId: 'lines-overhead-bare',      dash: undefined as number[] | undefined },
    { sourceId: 'overhead-insulated', layerId: 'lines-overhead-insulated', dash: [2, 4] },
    { sourceId: 'underground-cable',  layerId: 'lines-underground-cable',  dash: [8, 4] },
  ] as const;

  function emptyFC(): FeatureCollection { return { type: 'FeatureCollection', features: [] }; }

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
    if (dataMode === 'nowcasting') params.set('mode', 'nowcasting');
    if (filterDates[0]) params.set('date', filterDates[0]);
    filterSubstations.forEach((v) => params.append('substation', v));
    filterSecondarySubstations.forEach((v) => params.append('secondary', v));
    filterLines.forEach((v) => params.append('line', v));
    filterUnits.forEach((v) => params.append('unit', v));
    filterMunicipalities.forEach((v) => params.append('municipality', v));
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
      mode: (p.get('mode') === 'nowcasting' ? 'nowcasting' : 'forecast') as DataMode,
      date: p.get('date') ?? undefined,
      substations: p.getAll('substation'),
      secondarySubstations: p.getAll('secondary'),
      lines: p.getAll('line'),
      units: p.getAll('unit'),
      municipalities: p.getAll('municipality'),
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
      map.addSource(id, { type: 'geojson', data: data as GeoJSON.FeatureCollection, generateId: true });
    }
  }

  function clearHover() {
    if (!map || hoveredFeatureId === null || !hoveredSourceId) return;
    map.setFeatureState({ source: hoveredSourceId, id: hoveredFeatureId }, { hover: false });
    hoveredFeatureId = null;
    hoveredSourceId = null;
  }

  function addLineLayer(sourceId: string, layerId: string, visible: boolean, dashArray?: number[]) {
    if (!map || map.getLayer(layerId)) return;

    const paint: Record<string, unknown> = {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        // hovered
        ['match', ['get', 'risk_level'],
          'ALERT',   '#D00000',
          'WARNING', '#F7D000',
          '#16a34a',
        ],
        // default
        ['match', ['get', 'risk_level'],
          'ALERT',   '#D00000',
          'WARNING', '#F7D000',
          UNIFORM_GREY,
        ],
      ],
      'line-width': [
        'case',
        ['boolean', ['feature-state', 'hover'], false],
        5, 3,
      ],
      'line-opacity': 0.9,
    };

    if (dashArray) {
      paint['line-dasharray'] = dashArray;
    }

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible ? 'visible' : 'none' },
    });

    map.on('click', layerId, (e) => {
      if (!map || !e.features?.[0]) return;
      showLinePopup(e.lngLat, e.features[0].properties as Record<string, unknown>);
    });

    map.on('mouseenter', layerId, (e) => {
      if (!map) return;
      map.getCanvas().style.cursor = 'pointer';
      if (e.features?.[0]) {
        clearHover();
        hoveredFeatureId = e.features[0].id as number;
        hoveredSourceId = sourceId;
        map.setFeatureState({ source: sourceId, id: hoveredFeatureId }, { hover: true });
      }
    });

    map.on('mouseleave', layerId, () => {
      if (!map) return;
      map.getCanvas().style.cursor = '';
      clearHover();
    });
  }

  function addCircleLayer(sourceId: string, layerId: string, visible = true) {
    if (!map || map.getLayer(layerId)) return;
    map.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 5,
        'circle-color': '#1E88E5',
        'circle-opacity': 0.9,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
      layout: { visibility: visible ? 'visible' : 'none' },
    });
    map.on('click', layerId, (e) => {
      if (!map || !e.features?.[0]) return;
      showCabinePopup(e.lngLat, e.features[0].properties as Record<string, unknown>);
    });
    map.on('mouseenter', layerId, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

  function addCabineLabelsLayer(visible = true) {
    if (!map || map.getLayer('cabine-labels')) return;
    const isDark =
      document.documentElement.classList.contains('dark') ||
      (!document.documentElement.classList.contains('light') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);

    map.addLayer({
      id: 'cabine-labels',
      type: 'symbol',
      source: 'cabine',
      minzoom: 12,
      layout: {
        'text-field': ['concat',
          ['coalesce', ['get', 'name'], ''], ' - ', ['coalesce', ['get', 'label_id'], ''],
          '\nLMT: ', ['coalesce', ['get', 'line_name'], ['get', 'asset_key']],
          '\nCP: ', ['coalesce', ['get', 'parent_substation_name'], '-'],
        ],
        'text-size': 10,
        'text-offset': [0, 1.8],
        'text-anchor': 'top',
        'text-max-width': 18,
        'text-allow-overlap': false,
        visibility: visible ? 'visible' : 'none',
      },
      paint: {
        'text-color': isDark ? '#e2e8f0' : '#374151',
        'text-halo-color': isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        'text-halo-width': 1.5,
      },
    });
  }

  function setLayerVisibility(layerId: string, visible: boolean) {
    if (!map || !map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
  }

  // ---------------------------------------------------------------------------
  // Popup / Tooltip
  // ---------------------------------------------------------------------------
  function popupRow(label: string, value: unknown, filterType?: string): string {
    if (value === null || value === undefined || value === '') return '';
    const v = typeof value === 'number' ? value.toFixed(2).replace(/\.?0+$/, '') : String(value);
    const valHtml = filterType
      ? `<a href="#" data-filter-type="${filterType}" data-filter-value="${v}" style="font-weight:500;color:#0d9488;cursor:pointer;text-decoration:none">${v}</a>`
      : `<span style="font-weight:500">${v}</span>`;
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:12px"><span style="color:#64748b">${label}</span>${valHtml}</div>`;
  }

  function handlePopupFilterClick(e: Event) {
    const link = (e.target as HTMLElement).closest('[data-filter-type]') as HTMLElement | null;
    if (!link) return;
    e.preventDefault();
    const type = link.dataset.filterType!;
    const value = link.dataset.filterValue!;
    currentPopup?.remove();

    function addUnique(arr: string[], val: string): string[] {
      return arr.includes(val) ? arr : [...arr, val];
    }

    switch (type) {
      case 'substation':
        filterSubstations = addUnique(filterSubstations, value);
        break;
      case 'line':
        filterLines = addUnique(filterLines, value);
        break;
      case 'municipality':
        filterMunicipalities = addUnique(filterMunicipalities, value);
        break;
    }

    syncUrl();
    loadAllData();
  }

  function attachPopupLinks() {
    currentPopup?.getElement()?.addEventListener('click', handlePopupFilterClick);
  }

  function showLinePopup(lngLat: maplibregl.LngLat, props: Record<string, unknown>) {
    if (!map) return;
    currentPopup?.remove();

    const riskLevel = String(props.risk_level ?? 'NORMAL');
    const riskColors: Record<string, string> = { ALERT: '#D00000', WARNING: '#F7D000', NORMAL: '#00A000' };
    const lineName = String(props.line_name ?? props.asset_key ?? '—');
    const conductorType = String(props.conductor_type ?? '');
    const isHeat = conductorType === 'underground_cable';

    let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">${lineName}</div>`;
    html += `<div style="margin-bottom:8px"><span style="background:${riskColors[riskLevel] ?? '#808080'};color:#fff;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">${riskLevel}</span></div>`;
    html += popupRow($_('panel.conductor_type'), $_(`conductor.${conductorType}`, { default: conductorType }));
    html += popupRow($_('panel.substation_name'), props.parent_substation_name, 'substation');
    html += popupRow($_('panel.operational_unit'), props.operational_unit);
    html += popupRow($_('panel.municipality'), props.municipality, 'municipality');
    html += popupRow($_('panel.line_mt'), lineName, 'line');

    if (isHeat) {
      html += popupRow($_('panel.temp_max_c'), props.temp_max_c);
      html += popupRow($_('panel.p90_threshold'), props.p90_threshold);
      html += popupRow($_('panel.consecutive_heat_days'), props.consecutive_heat_days);
    } else {
      html += popupRow($_('panel.gust_excess'), props.gust_excess);
      html += popupRow($_('panel.wind_speed_max'), props.wind_speed_max);
      html += popupRow($_('panel.wind_gusts_max'), props.wind_gusts_max);
    }

    currentPopup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '280px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    attachPopupLinks();
  }

  function showCabinePopup(lngLat: maplibregl.LngLat, props: Record<string, unknown>) {
    if (!map) return;
    currentPopup?.remove();

    const cabName = String(props.name ?? '—');
    const lineName = props.line_name
      ?? secondarySubIndex.get(cabName)?.lineNames[0]
      ?? null;
    let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;border-bottom:1px solid #e2e8f0;padding-bottom:6px">${cabName}</div>`;
    html += popupRow($_('panel.code'), props.label_id ?? props.asset_key);
    html += popupRow($_('panel.line_mt'), lineName, 'line');
    html += popupRow($_('panel.primary_substation'), props.parent_substation_name, 'substation');
    html += popupRow($_('panel.operational_unit'), props.operational_unit);
    html += popupRow($_('panel.municipality'), props.municipality, 'municipality');

    currentPopup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '280px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    attachPopupLinks();
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
    if (overheadBareData.features.length) {
      upsertGeoJsonSource('overhead-bare', overheadBareData);
      addLineLayer('overhead-bare', 'lines-overhead-bare', showOverheadBare);
    }
    if (overheadInsulatedData.features.length) {
      upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);
      addLineLayer('overhead-insulated', 'lines-overhead-insulated', showOverheadInsulated, [2, 4]);
    }
    if (undergroundCableData.features.length) {
      upsertGeoJsonSource('underground-cable', undergroundCableData);
      addLineLayer('underground-cable', 'lines-underground-cable', showUndergroundCable, [8, 4]);
    }
    if (cabineData.features.length) {
      upsertGeoJsonSource('cabine', cabineData);
      addCircleLayer('cabine', 'cabine-points', showCabine);
      addCabineLabelsLayer(showCabine);
    }
    updateLayerFilters();
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  let overheadBareData: FeatureCollection = emptyFC();
  let overheadInsulatedData: FeatureCollection = emptyFC();
  let undergroundCableData: FeatureCollection = emptyFC();
  let cabineData: FeatureCollection = emptyFC();

  let baseOverheadBareData: FeatureCollection = emptyFC();
  let baseOverheadInsulatedData: FeatureCollection = emptyFC();
  let baseUndergroundCableData: FeatureCollection = emptyFC();

  let shapesLoaded = false;

  // Lightweight lookup for secondary substations — populated once in loadShapes
  // Maps substation name → { parent, lineNames }
  let secondarySubIndex = $state<Map<string, { parent: string; lineNames: string[] }>>(new Map());

  const availSecondarySubstations = $derived.by(() => {
    if (!secondarySubIndex.size) return [] as string[];
    if (!filterSubstations.length) return [...secondarySubIndex.keys()].sort();
    return [...secondarySubIndex.entries()]
      .filter(([, info]) => filterSubstations.includes(info.parent))
      .map(([name]) => name)
      .sort();
  });

  // Clean up invalid secondary selections when available list changes
  $effect(() => {
    if (!filterSecondarySubstations.length) return;
    const valid = new Set(availSecondarySubstations);
    const cleaned = filterSecondarySubstations.filter((s) => valid.has(s));
    if (cleaned.length !== filterSecondarySubstations.length) {
      filterSecondarySubstations = cleaned;
    }
  });

  async function loadShapes() {
    if (shapesLoaded) return;

    let fc: FeatureCollection;
    try {
      fc = await getShapes(NETWORK_ID);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[grid] Failed to load shapes:', msg);
      loadError = `Failed to load grid topology: ${msg}`;
      loading = false;
      throw err;
    }

    const bare: GeoFeature[] = [];
    const insulated: GeoFeature[] = [];
    const underground: GeoFeature[] = [];
    const substations: GeoFeature[] = [];

    for (const f of fc.features) {
      if (!f.geometry) continue;
      const p = f.properties as unknown as GridShapeProperties;
      const base = { ...f, properties: { ...p, risk_level: 'NORMAL', risk_color_hex: null } };
      if (p.asset_type === 'substation') {
        substations.push(base);
      } else {
        switch (p.conductor_type) {
          case 'overhead_insulated': insulated.push(base); break;
          case 'underground_cable': underground.push(base); break;
          default: bare.push(base); break;
        }
      }
    }

    shapesLoaded = true;

    baseOverheadBareData = { type: 'FeatureCollection', features: bare };
    overheadBareData = baseOverheadBareData;
    upsertGeoJsonSource('overhead-bare', overheadBareData);
    addLineLayer('overhead-bare', 'lines-overhead-bare', showOverheadBare);

    baseOverheadInsulatedData = { type: 'FeatureCollection', features: insulated };
    overheadInsulatedData = baseOverheadInsulatedData;
    upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);
    addLineLayer('overhead-insulated', 'lines-overhead-insulated', showOverheadInsulated, [2, 4]);

    baseUndergroundCableData = { type: 'FeatureCollection', features: underground };
    undergroundCableData = baseUndergroundCableData;
    upsertGeoJsonSource('underground-cable', undergroundCableData);
    addLineLayer('underground-cable', 'lines-underground-cable', showUndergroundCable, [8, 4]);

    cabineData = { type: 'FeatureCollection', features: substations };
    upsertGeoJsonSource('cabine', cabineData);
    addCircleLayer('cabine', 'cabine-points', showCabine);
    addCabineLabelsLayer(showCabine);

    // Build secondary substation index for hierarchical filter
    const subIdx = new Map<string, { parent: string; lineNames: string[] }>();
    for (const f of substations) {
      const p = f.properties as unknown as GridShapeProperties;
      if (!p.name) continue;
      const existing = subIdx.get(p.name);
      const ln = p.line_name ?? p.asset_key;
      if (existing) {
        if (ln && !existing.lineNames.includes(ln)) existing.lineNames.push(ln);
      } else {
        subIdx.set(p.name, { parent: p.parent_substation_name ?? '', lineNames: ln ? [ln] : [] });
      }
    }
    secondarySubIndex = subIdx;

    fitToData(overheadBareData, overheadInsulatedData, undergroundCableData, cabineData);
  }

  function applyRisks(risks: GridRisk[]) {
    const byId = new Map<string, GridRisk>();
    for (const r of risks) byId.set(r.segment_id, r);

    function recolor(base: FeatureCollection): FeatureCollection {
      if (!byId.size) return base;
      return {
        type: 'FeatureCollection',
        features: base.features.map((f) => {
          const r = byId.get((f.properties as unknown as GridShapeProperties).segment_id);
          if (!r) return f;
          return { ...f, properties: { ...f.properties, risk_level: r.risk_level, risk_color_hex: r.risk_color_hex, ...r.metrics as object } };
        }),
      };
    }

    overheadBareData = recolor(baseOverheadBareData);
    upsertGeoJsonSource('overhead-bare', overheadBareData);

    overheadInsulatedData = recolor(baseOverheadInsulatedData);
    upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);

    undergroundCableData = recolor(baseUndergroundCableData);
    upsertGeoJsonSource('underground-cable', undergroundCableData);
  }

  async function loadAllData() {
    loading = true;
    loadError = null;
    try {
      await loadShapes();
    } catch {
      return;
    }

    let risks: GridRisk[];
    if (dataMode === 'nowcasting') {
      risks = await getRisksNow(NETWORK_ID).catch(() => [] as GridRisk[]);
    } else {
      const f = buildFilters();
      risks = await getRisks(f).catch(() => [] as GridRisk[]);
    }

    applyRisks(risks);
    updateLayerFilters();
    loading = false;
  }

  // ---------------------------------------------------------------------------
  // Client-side layer filtering via MapLibre filter expressions
  // ---------------------------------------------------------------------------
  function updateLayerFilters() {
    if (!map) return;

    const lineConditions: unknown[] = [];
    if (filterSubstations.length) {
      lineConditions.push(['in', ['get', 'parent_substation_name'], ['literal', filterSubstations]]);
    }
    if (filterSecondarySubstations.length) {
      const lineNames = new Set<string>();
      for (const name of filterSecondarySubstations) {
        const info = secondarySubIndex.get(name);
        if (info) info.lineNames.forEach((ln) => lineNames.add(ln));
      }
      if (lineNames.size) {
        lineConditions.push(['in', ['get', 'asset_key'], ['literal', [...lineNames]]]);
      }
    }
    if (filterLines.length) {
      lineConditions.push(['in', ['get', 'asset_key'], ['literal', filterLines]]);
    }
    if (filterUnits.length) {
      lineConditions.push(['in', ['get', 'operational_unit'], ['literal', filterUnits]]);
    }
    if (filterMunicipalities.length) {
      lineConditions.push(['in', ['get', 'municipality'], ['literal', filterMunicipalities]]);
    }
    if (filterRisk.length) {
      lineConditions.push(['in', ['get', 'risk_level'], ['literal', filterRisk]]);
    }

    const lineFilter: unknown = lineConditions.length ? ['all', ...lineConditions] : null;

    for (const def of LINE_LAYER_DEFS) {
      if (map.getLayer(def.layerId)) {
        map.setFilter(def.layerId, lineFilter as maplibregl.FilterSpecification | null);
      }
    }

    // Cabine filter — same filters as lines (except risk), plus secondary name
    const cabineConditions: unknown[] = [];
    if (filterSubstations.length) {
      cabineConditions.push(['in', ['get', 'parent_substation_name'], ['literal', filterSubstations]]);
    }
    if (filterSecondarySubstations.length) {
      cabineConditions.push(['in', ['get', 'name'], ['literal', filterSecondarySubstations]]);
    }
    if (filterLines.length) {
      cabineConditions.push([
        'any',
        ['in', ['get', 'line_name'], ['literal', filterLines]],
        ['in', ['get', 'asset_key'], ['literal', filterLines]],
      ]);
    }
    if (filterUnits.length) {
      cabineConditions.push(['in', ['get', 'operational_unit'], ['literal', filterUnits]]);
    }
    if (filterMunicipalities.length) {
      cabineConditions.push(['in', ['get', 'municipality'], ['literal', filterMunicipalities]]);
    }
    const cabineFilter: unknown = cabineConditions.length ? ['all', ...cabineConditions] : null;
    if (map.getLayer('cabine-points')) {
      map.setFilter('cabine-points', cabineFilter as maplibregl.FilterSpecification | null);
    }
    if (map.getLayer('cabine-labels')) {
      map.setFilter('cabine-labels', cabineFilter as maplibregl.FilterSpecification | null);
    }
  }

  // ---------------------------------------------------------------------------
  // Filter callbacks
  // ---------------------------------------------------------------------------
  function applyFilters(f: {
    substations: string[]; secondarySubstations: string[]; lines: string[]; units: string[]; municipalities: string[]; risk: string[];
  }) {
    filterSubstations = f.substations;
    filterSecondarySubstations = f.secondarySubstations;
    filterLines = f.lines;
    filterUnits = f.units;
    filterMunicipalities = f.municipalities;
    filterRisk = f.risk;
    syncUrl();
    loadAllData();
  }

  function onDateChange(dateStr: string) {
    filterDates = dateStr ? [dateStr] : [];
    syncUrl();
    loadAllData();
  }

  function onModeChange(newMode: DataMode) {
    if (newMode === dataMode) return;
    dataMode = newMode;
    syncUrl();
    loadAllData();
  }

  // ---------------------------------------------------------------------------
  // Layer visibility reactivity
  // ---------------------------------------------------------------------------
  $effect(() => { setLayerVisibility('lines-overhead-bare', showOverheadBare); });
  $effect(() => { setLayerVisibility('lines-overhead-insulated', showOverheadInsulated); });
  $effect(() => { setLayerVisibility('lines-underground-cable', showUndergroundCable); });
  $effect(() => {
    setLayerVisibility('cabine-points', showCabine);
    setLayerVisibility('cabine-labels', showCabine);
  });

  $effect(() => {
    $themeOverride;
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

    if (mapState) hasFit = true;

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('moveend', syncUrl);
    map.on('style.load', restoreLayers);

    map.on('load', async () => {
      const urlFilters = readUrlFilters();
      dataMode = urlFilters.mode;
      if (urlFilters.substations.length) filterSubstations = urlFilters.substations;
      if (urlFilters.secondarySubstations.length) filterSecondarySubstations = urlFilters.secondarySubstations;
      if (urlFilters.lines.length) filterLines = urlFilters.lines;
      if (urlFilters.units.length) filterUnits = urlFilters.units;
      if (urlFilters.municipalities.length) filterMunicipalities = urlFilters.municipalities;
      if (urlFilters.risk.length) filterRisk = urlFilters.risk;

      const todayStr = new Date().toISOString().slice(0, 10);
      const dateFromUrl = urlFilters.date;
      filterDates = [dateFromUrl && dateFromUrl >= minDate && dateFromUrl <= maxDate
        ? dateFromUrl
        : todayStr];

      const filters = await getFilters(NETWORK_ID).catch(() => null);
      if (filters) {
        availSubstations = filters.parent_substations;
        availLines = filters.lines;
        availUnits = filters.operational_units;
        availMunicipalities = filters.municipalities;

        if (!hasFit && filters.extent_min_lng != null) {
          map!.fitBounds(
            [[filters.extent_min_lng, filters.extent_min_lat!], [filters.extent_max_lng!, filters.extent_max_lat!]],
            { padding: 48, maxZoom: 14, animate: false }
          );
          hasFit = true;
        }
      }

      loadAllData();
    });

    return () => map?.remove();
  });
</script>

<div class="page">
  <div class="body">
    <FilterBar
      mode={dataMode}
      substations={availSubstations}
      secondarySubstations={availSecondarySubstations}
      lines={availLines}
      units={availUnits}
      municipalities={availMunicipalities}
      selectedDate={selectedDate}
      {minDate}
      {maxDate}
      bind:selectedSubstations={filterSubstations}
      bind:selectedSecondarySubstations={filterSecondarySubstations}
      bind:selectedLines={filterLines}
      bind:selectedUnits={filterUnits}
      bind:selectedMunicipalities={filterMunicipalities}
      bind:selectedRisk={filterRisk}
      onchange={applyFilters}
      ondatechange={onDateChange}
      onmodechange={onModeChange}
      onexport={(type) => {
        if (type === 'wind') {
          const merged = { type: 'FeatureCollection' as const, features: [...overheadBareData.features, ...overheadInsulatedData.features] };
          exportCsv(merged, 'wind_risk.csv');
        } else {
          exportCsv(undergroundCableData, 'heat_risk.csv');
        }
      }}
      onshare={shareLink}
    />

    <div class="map-area">
      <!-- Layer toggles -->
      <div class="layer-controls">
        <label class="layer-toggle">
          <input type="checkbox" bind:checked={showOverheadBare} />
          <span class="swatch swatch-line-solid"></span>
          {$_('conductor.overhead_bare')}
        </label>
        <label class="layer-toggle">
          <input type="checkbox" bind:checked={showOverheadInsulated} />
          <span class="swatch swatch-line-dotted"></span>
          {$_('conductor.overhead_insulated')}
        </label>
        <label class="layer-toggle">
          <input type="checkbox" bind:checked={showUndergroundCable} />
          <span class="swatch swatch-line-dashed"></span>
          {$_('conductor.underground_cable')}
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

      {#if loadError}
        <div class="map-error">
          <span class="error-text">{loadError}</span>
          <button class="error-retry" onclick={() => loadAllData()}>Retry</button>
          <button class="error-dismiss" onclick={() => (loadError = null)}>✕</button>
        </div>
      {/if}
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

  .body {
    flex: 1;
    display: flex;
    flex-direction: row;
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

  .map-error {
    position: absolute;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #fef2f2;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
    z-index: 30;
    max-width: 90%;
  }

  :global(.dark) .map-error {
    background: #450a0a;
    border-color: #991b1b;
  }

  .error-text {
    font-size: 0.8rem;
    color: #991b1b;
  }

  :global(.dark) .error-text {
    color: #fca5a5;
  }

  .error-retry {
    padding: 0.25rem 0.625rem;
    border-radius: 6px;
    border: 1px solid #fca5a5;
    background: none;
    color: #991b1b;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .error-retry:hover {
    background: #fee2e2;
  }

  :global(.dark) .error-retry {
    color: #fca5a5;
    border-color: #991b1b;
  }

  :global(.dark) .error-retry:hover {
    background: #7f1d1d;
  }

  .error-dismiss {
    background: none;
    border: none;
    color: #991b1b;
    cursor: pointer;
    font-size: 0.875rem;
    padding: 0 0.125rem;
    line-height: 1;
  }

  :global(.dark) .error-dismiss {
    color: #fca5a5;
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

  .swatch-line-solid {
    background: #6b7280;
  }

  .swatch-line-dotted {
    background: repeating-linear-gradient(90deg, #6b7280 0 2px, transparent 2px 5px);
    height: 4px;
  }

  .swatch-line-dashed {
    background: repeating-linear-gradient(90deg, #6b7280 0 6px, transparent 6px 10px);
    height: 4px;
  }

  .swatch.swatch-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  /* MapLibre popup styling */
  :global(.maplibregl-popup-content) {
    padding: 12px 14px;
    border-radius: 10px;
    font-family: inherit;
    font-size: 12px;
    color: var(--celine-text, #1e293b);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
</style>
