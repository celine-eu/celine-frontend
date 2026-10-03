<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import maplibregl from 'maplibre-gl';
  import { themeOverride } from '$lib/stores';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();

  import FilterBar from '$lib/components/FilterBar.svelte';
  import LayerMenu from '$lib/components/LayerMenu.svelte';
  import { layers, loadLayers, persistLayers } from '$lib/stores/layers.svelte';
  import { riskColorExpr, esc, TREE_TIER_COLORS, jointColorExpr } from '$lib/mapPaint';
  import { shouldShowUnmodelledSuffix, thermalTierKey } from '$lib/thermal';
  import { indexRisks, mergeRisksIntoFeatures, fetchRisksOrError } from '$lib/risks';
  import { nearestSpan, strikeKmBreakdown } from '$lib/treeStrike';
  import { popupRow, popupTitle, popupCallout, cabinaPopupRows, cabinaLabel } from '$lib/popup';
  import { resolveStyle, isImagery, type StyleKey } from '$lib/mapStyles';
  import { parseSlot, type Slot } from '$lib/timeWindows';

  import {
    getFilters,
    getShapes,
    getTileIndex,
    getRisks,
    getRisksNow,
    getRisks8h,
    getTreeStrikeSpans,
    type FeatureCollection,
    type GeoFeature,
    type GridFilters,
    type GridShapeProperties,
    type GridRisk,
    type TileInfo,
    type TreeStrikeSpanProperties,
  } from '$lib/api';

  type DataMode = 'forecast' | 'nowcasting';

  // Restore the persisted layer menu before any effect can persist the defaults.
  if (browser) loadLayers();

  // ---------------------------------------------------------------------------
  // Network ID
  // ---------------------------------------------------------------------------
  const NETWORK_ID = $derived(data.me?.network_id ?? '');

  // ---------------------------------------------------------------------------
  // Map state
  // ---------------------------------------------------------------------------
  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let activeMapStyle = $state<StyleKey | ''>('');
  let currentPopup: maplibregl.Popup | null = null;
  let hoveredFeatureId: number | null = null;
  let hoveredSourceId: string | null = null;

  let loading = $state(false);
  let loadError = $state<string | null>(null);

  let dataMode = $state<DataMode>('forecast');
  let filterDates = $state<string[]>([]);
  let filterSlot = $state<Slot | null>(null); // null = daily view
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
  // Each conductor layer is coloured by exactly one risk vector:
  // overhead lines by wind, underground cables by heat.
  const LINE_LAYER_DEFS = [
    { sourceId: 'overhead-bare',      layerId: 'lines-overhead-bare',      vector: 'wind' as const, dash: undefined as number[] | undefined },
    { sourceId: 'overhead-insulated', layerId: 'lines-overhead-insulated', vector: 'wind' as const, dash: [2, 4] },
    { sourceId: 'underground-cable',  layerId: 'lines-underground-cable',  vector: 'heat' as const, dash: [8, 4] },
  ] as const;

  const onImagery = () => activeMapStyle !== '' && isImagery(activeMapStyle);

  // Tree-strike exposure overlay: the analysis spans (own geometry, ~100 m), drawn
  // under the conductor layers. Exposure only — wind escalation stays on the tratte.
  const TREE_STRIKE_LAYER_ID = 'tree-strike-spans';

  function addTreeStrikeSpansLayer(visible: boolean) {
    if (!map || map.getLayer(TREE_STRIKE_LAYER_ID)) return;
    map.addLayer({
      id: TREE_STRIKE_LAYER_ID,
      type: 'line',
      source: 'tree-strike-spans',
      paint: {
        'line-color': ['match', ['get', 'tier'],
          'high', TREE_TIER_COLORS.high,
          'mid',  TREE_TIER_COLORS.mid,
          'low',  TREE_TIER_COLORS.low,
          'rgba(0,0,0,0)',
        ],
        'line-width': 7,
        'line-opacity': 0.55,
      },
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: visible ? 'visible' : 'none' },
    });
    map.on('click', TREE_STRIKE_LAYER_ID, (e) => {
      if (!map || !e.features?.[0]) return;
      // a conductor line on top wins the click
      const onLine = map.queryRenderedFeatures(e.point, { layers: LINE_LAYER_DEFS.map((d) => d.layerId).filter((id) => map!.getLayer(id)) });
      if (onLine.length) return;
      showSpanPopup(e.lngLat, e.features[0].properties as Record<string, unknown>);
    });
    map.on('mouseenter', TREE_STRIKE_LAYER_ID, () => { if (map) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', TREE_STRIKE_LAYER_ID, () => { if (map) map.getCanvas().style.cursor = ''; });
  }

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
    if (filterSlot !== null) params.set('slot', String(filterSlot));
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
    replaceState('?' + params.toString(), {});
  }

  function readUrlFilters() {
    const p = new URLSearchParams(window.location.search);
    return {
      mode: (p.get('mode') === 'nowcasting' ? 'nowcasting' : 'forecast') as DataMode,
      date: p.get('date') ?? undefined,
      slot: parseSlot(p.get('slot')),
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

  function addLineLayer(sourceId: string, layerId: string, visible: boolean, riskEnabled: boolean, dashArray?: number[]) {
    if (!map || map.getLayer(layerId)) return;

    const paint: Record<string, unknown> = {
      'line-color': riskColorExpr(riskEnabled, onImagery()),
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
      showLinePopup(e.lngLat, e.features[0].properties as Record<string, unknown>, e.point);
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

  const JOINTS_LAYER_ID = 'joints-points';

  /** Thermal joints layer, drawn last so it sits above every line layer. */
  function addJointsLayer(visible: boolean) {
    if (!map || map.getLayer(JOINTS_LAYER_ID)) return;
    map.addLayer({
      id: JOINTS_LAYER_ID,
      type: 'circle',
      source: 'joints',
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'hover'], false], 6, 4],
        'circle-color': jointColorExpr(layers.heatRisk, onImagery()),
        'circle-opacity': 0.95,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
      layout: { visibility: visible ? 'visible' : 'none' },
    });
    map.on('click', JOINTS_LAYER_ID, (e) => {
      if (!map || !e.features?.[0]) return;
      showJointPopup(e.lngLat, e.features[0].properties as Record<string, unknown>);
    });
    map.on('mouseenter', JOINTS_LAYER_ID, (e) => {
      if (!map) return;
      map.getCanvas().style.cursor = 'pointer';
      if (e.features?.[0]) {
        clearHover();
        hoveredFeatureId = e.features[0].id as number;
        hoveredSourceId = 'joints';
        map.setFeatureState({ source: 'joints', id: hoveredFeatureId }, { hover: true });
      }
    });
    map.on('mouseleave', JOINTS_LAYER_ID, () => {
      if (!map) return;
      map.getCanvas().style.cursor = '';
      clearHover();
    });
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
        // Only "code - name" on the map; everything else on click (DSO request).
        'text-field': ['get', 'cabina_label'],
        'text-size': 10,
        'text-offset': [0, 1.8],
        'text-anchor': 'top',
        'text-max-width': 18,
        'text-allow-overlap': false,
        visibility: visible ? 'visible' : 'none',
      },
      paint: onImagery()
        ? { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.9)', 'text-halo-width': 1.5 }
        : {
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
  /** "22.1 °C (P90 21.5)": the 7-day soil mean alongside the P90 threshold it is compared against. */
  function formatSoilRow(mean: unknown, p90: unknown): string {
    const m = typeof mean === 'number' ? mean : Number(mean);
    if (!Number.isFinite(m)) return '';
    const p = typeof p90 === 'number' ? p90 : Number(p90);
    const p90Str = Number.isFinite(p) ? ` (P90 ${p.toFixed(1)})` : '';
    return `${m.toFixed(1)} °C${p90Str}`;
  }

  /** Thermal tier label, flagged "non modellato" when the tier was defaulted rather than measured. */
  function thermalTierLabel(tier: unknown, modelled: unknown): string {
    const t = thermalTierKey(tier);
    const label = $_(`thermal_tier.${t}`, { default: t });
    // The 'unmodelled' tier's own label already says "not modelled"; do not duplicate the suffix.
    return shouldShowUnmodelledSuffix(modelled, tier) ? `${label} (${$_('panel.thermal_unmodelled')})` : label;
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

  /** "2.3 km high · 1.7 km mid · 0.5 km low" */
  function formatStrikeKm(props: Record<string, unknown>): string {
    return strikeKmBreakdown(props)
      .map(({ tier, km }) => `${km.toFixed(km < 1 ? 2 : 1)} km ${$_(`tree_tier.${tier}`, { default: tier }).toLowerCase()}`)
      .join(' · ');
  }

  /** Tier of the tree-strike span under the clicked pixel, if one runs within 8 px of it. */
  function strikeTierAt(point: maplibregl.Point | undefined): string | null {
    if (!map || !point || !treeStrikeData.features.length) return null;
    const m = map;
    const span = nearestSpan(treeStrikeData.features, (ll) => m.project(ll), point, 8);
    const tier = span?.properties.tier;
    return typeof tier === 'string' ? tier : null;
  }

  function showLinePopup(lngLat: maplibregl.LngLat, props: Record<string, unknown>, point?: maplibregl.Point) {
    if (!map) return;
    currentPopup?.remove();

    const riskLevel = String(props.risk_level ?? 'NORMAL');
    const riskColors: Record<string, string> = { ALERT: '#D00000', WARNING: '#F7D000', NORMAL: '#00A000' };
    const lineName = String(props.line_name ?? props.asset_key ?? '—');
    const conductorType = String(props.conductor_type ?? '');
    const isHeat = conductorType === 'underground_cable';

    let html = popupTitle(lineName);
    html += `<div style="margin-bottom:8px"><span style="background:${riskColors[riskLevel] ?? '#808080'};color:#fff;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">${esc(riskLevel)}</span></div>`;
    html += popupRow($_('panel.conductor_type'), $_(`conductor.${conductorType}`, { default: conductorType }));
    html += popupRow($_('panel.substation_name'), props.parent_substation_name, 'substation');
    html += popupRow($_('panel.operational_unit'), props.operational_unit);
    html += popupRow($_('panel.municipality'), props.municipality, 'municipality');
    html += popupRow($_('panel.line_mt'), lineName, 'line');

    if (isHeat) {
      html += popupRow($_('panel.temp_max_c'), props.temp_max_c);
      html += popupRow($_('panel.p90_threshold'), props.p90_threshold);
      html += popupRow($_('panel.consecutive_heat_days'), props.consecutive_heat_days);
      html += popupRow($_('panel.heat_status'), props.heat_status ? $_(`heat_status.${props.heat_status}`, { default: String(props.heat_status) }) : null);
      html += popupRow($_('panel.soil7_mean_c'), formatSoilRow(props.soil7_mean_c, props.soil7_p90_c) || null);
      html += popupRow($_('panel.soil_asof_date'), props.soil_asof_date);
      html += popupRow($_('panel.thermal_tier'), thermalTierLabel(props.thermal_tier, props.thermal_modelled));
      html += popupRow($_('panel.thermal_margin_c'), props.thermal_margin_c);
      html += popupRow($_('panel.thermal_theta_max_c'), props.thermal_theta_max_c);
      html += popupRow($_('panel.thermal_insulation'), props.thermal_insulation);
      if (props.escalated_by_thermal === true || props.escalated_by_thermal === 'true') {
        html += popupCallout($_('panel.escalated_by_thermal'));
      }
    } else {
      html += popupRow($_('panel.gust_excess'), props.gust_excess);
      html += popupRow($_('panel.wind_speed_max'), props.wind_speed_max);
      html += popupRow($_('panel.wind_gusts_max'), props.wind_gusts_max);
      if (props.strike_tree_tier) {
        // The tratta tier is the worst of its fragments; say so, and show the
        // tier of the span actually under the cursor next to the km per tier.
        const here = strikeTierAt(point);
        if (here) html += popupRow($_('panel.strike_tier_here'), $_(`tree_tier.${here}`, { default: here }));
        html += popupRow($_('panel.strike_tree_tier_worst'), $_(`tree_tier.${props.strike_tree_tier}`, { default: String(props.strike_tree_tier) }));
        html += popupRow($_('panel.strike_km_breakdown'), formatStrikeKm(props) || null);
        html += popupRow($_('panel.strike_density_per_km_avg'), props.strike_density_per_km);
      }
      if (props.escalated_by_tree_strike === true || props.escalated_by_tree_strike === 'true') {
        html += popupCallout($_('panel.escalated_by_tree_strike'));
      }
    }

    currentPopup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '280px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    attachPopupLinks();
  }

  function showSpanPopup(lngLat: maplibregl.LngLat, props: Record<string, unknown>) {
    if (!map) return;
    currentPopup?.remove();
    const p = props as unknown as TreeStrikeSpanProperties;
    const tier = String(p.tier ?? '');
    let html = popupTitle(`${$_('panel.span')} — ${p.line_name ?? '—'}`);
    html += `<div style="margin-bottom:8px"><span style="background:${TREE_TIER_COLORS[tier] ?? '#808080'};color:#fff;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">${esc($_(`tree_tier.${tier}`, { default: tier }))}</span></div>`;
    html += popupRow($_('panel.line_mt'), p.line_name, 'line');
    html += popupRow($_('panel.conductor_type'), $_(`conductor.${p.conductor_type}`, { default: p.conductor_type ?? '' }));
    html += popupRow($_('panel.substation_name'), p.parent_substation_name, 'substation');
    html += popupRow($_('panel.operational_unit'), p.operational_unit);
    html += popupRow($_('panel.municipality'), p.municipality, 'municipality');
    html += popupRow($_('panel.strike_density_per_km'), p.strike_density_km);
    html += popupRow($_('panel.n_strike'), p.n_strike);
    html += popupRow($_('panel.strike_tree_multiplier'), p.multiplier);
    html += popupRow($_('panel.length_m'), p.length_m);
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
    // Only the six fields the DSO asked for (see cabinaPopupRows).
    const withLine = {
      ...props,
      line_name: props.line_name ?? secondarySubIndex.get(cabName)?.lineNames[0] ?? null,
    };
    let html = popupTitle(cabinaLabel(withLine) || cabName);
    for (const row of cabinaPopupRows(withLine)) html += popupRow($_(row.key), row.value, row.filter);

    currentPopup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '280px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    attachPopupLinks();
  }

  function showJointPopup(lngLat: maplibregl.LngLat, props: Record<string, unknown>) {
    if (!map) return;
    currentPopup?.remove();

    const jointId = String(props.asset_key ?? props.segment_id ?? '-');
    const riskLevel = props.risk_level ? String(props.risk_level) : null;
    const riskColors: Record<string, string> = { ALERT: '#D00000', WARNING: '#F7D000', NORMAL: '#00A000' };

    let html = popupTitle(`${$_('panel.joint')} ${jointId}`);
    if (riskLevel) {
      html += `<div style="margin-bottom:8px"><span style="background:${riskColors[riskLevel] ?? '#808080'};color:#fff;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">${esc(riskLevel)}</span></div>`;
    }
    html += popupRow($_('panel.thermal_tier'), thermalTierLabel(props.thermal_tier, props.thermal_modelled));
    html += popupRow($_('panel.thermal_insulation'), props.thermal_insulation);
    html += popupRow($_('panel.anno_posa'), props.anno_posa);
    html += popupRow($_('panel.technology'), props.technology);
    html += popupRow($_('panel.thermal_margin_c'), props.thermal_margin_c);
    html += popupRow($_('panel.m_r_critico'), props.m_r_critico);
    html += popupRow($_('panel.thermal_theta_max_c'), props.thermal_theta_max_c);
    html += popupRow($_('panel.is_asphalt'), props.is_asphalt);
    html += popupRow($_('panel.municipality'), props.municipality, 'municipality');

    if (riskLevel) {
      html += popupRow($_('panel.heat_status'), props.heat_status ? $_(`heat_status.${props.heat_status}`, { default: String(props.heat_status) }) : null);
      html += popupRow($_('panel.soil7_mean_c'), formatSoilRow(props.soil7_mean_c, props.soil7_p90_c) || null);
      html += popupRow($_('panel.soil_asof_date'), props.soil_asof_date);
      if (props.escalated_by_thermal === true || props.escalated_by_thermal === 'true') {
        html += popupCallout($_('panel.escalated_by_thermal'));
      }
    }

    currentPopup = new maplibregl.Popup({ closeOnClick: true, maxWidth: '280px' })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    attachPopupLinks();
  }

  // ---------------------------------------------------------------------------
  // Map style (dark / light / satellite)
  // ---------------------------------------------------------------------------
  function isDarkTheme(): boolean {
    return (
      document.documentElement.classList.contains('dark') ||
      (!document.documentElement.classList.contains('light') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    );
  }

  function currentStyle() {
    return resolveStyle(layers.basemap, isDarkTheme());
  }

  function restoreLayers() {
    if (!map) return;
    // the exposure overlay goes in first so every conductor layer draws above it
    upsertGeoJsonSource('tree-strike-spans', treeStrikeData);
    addTreeStrikeSpansLayer(layers.treeStrike);
    if (overheadBareData.features.length) {
      upsertGeoJsonSource('overhead-bare', overheadBareData);
      addLineLayer('overhead-bare', 'lines-overhead-bare', layers.overheadBare, layers.windRisk);
    }
    if (overheadInsulatedData.features.length) {
      upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);
      addLineLayer('overhead-insulated', 'lines-overhead-insulated', layers.overheadInsulated, layers.windRisk, [2, 4]);
    }
    if (undergroundCableData.features.length) {
      upsertGeoJsonSource('underground-cable', undergroundCableData);
      addLineLayer('underground-cable', 'lines-underground-cable', layers.undergroundCable, layers.heatRisk, [8, 4]);
    }
    if (cabineData.features.length) {
      upsertGeoJsonSource('cabine', cabineData);
      addCircleLayer('cabine', 'cabine-points', layers.cabine);
      addCabineLabelsLayer(layers.cabine);
    }
    // joints go in last so they draw above every line layer
    if (jointsData.features.length) {
      upsertGeoJsonSource('joints', jointsData);
      addJointsLayer(layers.joints);
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
  let jointsData: FeatureCollection = emptyFC();

  let baseOverheadBareData: FeatureCollection = emptyFC();
  let baseOverheadInsulatedData: FeatureCollection = emptyFC();
  let baseUndergroundCableData: FeatureCollection = emptyFC();
  let baseJointsData: FeatureCollection = emptyFC();

  let shapesLoaded = false;

  // Tile-based progressive loading state
  let tileIndex: TileInfo[] = [];
  let loadedTileIds = new Set<string>();
  let loadedSegmentIds = new Set<string>();
  let loadedJointIds = new Set<string>();
  let loadedSpanIds = new Set<string>();
  let treeStrikeData: FeatureCollection = { type: 'FeatureCollection', features: [] };
  let tilesReady = false;
  let tileLoadInProgress = false;
  let currentRisks: GridRisk[] = [];

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

  // ---------------------------------------------------------------------------
  // Tile viewport helpers
  // ---------------------------------------------------------------------------
  function tileIntersectsViewport(tile: TileInfo, bounds: maplibregl.LngLatBounds): boolean {
    const coords = tile.tile_bbox_geojson.coordinates[0];
    let tMinLng = Infinity, tMinLat = Infinity, tMaxLng = -Infinity, tMaxLat = -Infinity;
    for (const c of coords) {
      if (c[0] < tMinLng) tMinLng = c[0];
      if (c[1] < tMinLat) tMinLat = c[1];
      if (c[0] > tMaxLng) tMaxLng = c[0];
      if (c[1] > tMaxLat) tMaxLat = c[1];
    }
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return tMinLng <= ne.lng && tMaxLng >= sw.lng && tMinLat <= ne.lat && tMaxLat >= sw.lat;
  }

  function categorizeFeature(f: GeoFeature): 'bare' | 'insulated' | 'underground' | 'substation' | 'joint' | null {
    if (!f.geometry) return null;
    const p = f.properties as unknown as GridShapeProperties;
    if (p.asset_type === 'joint') return 'joint';
    if (p.asset_type === 'substation') return 'substation';
    switch (p.conductor_type) {
      case 'overhead_insulated': return 'insulated';
      case 'underground_cable': return 'underground';
      default: return 'bare';
    }
  }

  // ---------------------------------------------------------------------------
  // Progressive tile loading
  // ---------------------------------------------------------------------------
  async function loadVisibleTiles() {
    if (!map || !tilesReady || !tileIndex.length || tileLoadInProgress) return;

    const bounds = map.getBounds();
    const newTileIds = tileIndex
      .filter((t) => !loadedTileIds.has(t.tile_id) && tileIntersectsViewport(t, bounds))
      .map((t) => t.tile_id);

    if (!newTileIds.length) return;

    tileLoadInProgress = true;
    newTileIds.forEach((id) => loadedTileIds.add(id));

    let fc: FeatureCollection;
    let spansFc: FeatureCollection = emptyFC();
    try {
      [fc, spansFc] = await Promise.all([
        getShapes(NETWORK_ID, undefined, newTileIds),
        getTreeStrikeSpans(NETWORK_ID, newTileIds).catch((err) => {
          console.warn('[grid] Tree-strike spans unavailable for tiles:', err);
          return emptyFC();
        }),
      ]);
    } catch (err) {
      newTileIds.forEach((id) => loadedTileIds.delete(id));
      console.error('[grid] Failed to load tiles:', err);
      tileLoadInProgress = false;
      return;
    }

    const bare: GeoFeature[] = [];
    const insulated: GeoFeature[] = [];
    const underground: GeoFeature[] = [];
    const substations: GeoFeature[] = [];
    const joints: GeoFeature[] = [];

    for (const f of fc.features) {
      const p = f.properties as unknown as GridShapeProperties;
      const cat = categorizeFeature(f);

      if (cat === 'joint') {
        if (loadedJointIds.has(p.segment_id)) continue;
        loadedJointIds.add(p.segment_id);
        joints.push({ ...f, properties: { ...p, risk_level: 'NORMAL', risk_color_hex: null } });
        continue;
      }

      if (loadedSegmentIds.has(p.segment_id)) continue;
      loadedSegmentIds.add(p.segment_id);

      const base = { ...f, properties: { ...p, risk_level: 'NORMAL', risk_color_hex: null } };
      if (cat === 'substation') substations.push({ ...base, properties: { ...base.properties, cabina_label: cabinaLabel(p as unknown as Record<string, unknown>) } });
      else if (cat === 'insulated') insulated.push(base);
      else if (cat === 'underground') underground.push(base);
      else if (cat === 'bare') bare.push(base);
    }

    baseOverheadBareData = { type: 'FeatureCollection', features: [...baseOverheadBareData.features, ...bare] };
    baseOverheadInsulatedData = { type: 'FeatureCollection', features: [...baseOverheadInsulatedData.features, ...insulated] };
    baseUndergroundCableData = { type: 'FeatureCollection', features: [...baseUndergroundCableData.features, ...underground] };
    cabineData = { type: 'FeatureCollection', features: [...cabineData.features, ...substations] };
    baseJointsData = { type: 'FeatureCollection', features: [...baseJointsData.features, ...joints] };

    const spans: GeoFeature[] = [];
    for (const f of spansFc.features) {
      const id = String((f.properties as unknown as TreeStrikeSpanProperties).span_id ?? '');
      if (!id || loadedSpanIds.has(id)) continue;
      loadedSpanIds.add(id);
      spans.push(f);
    }
    if (spans.length) {
      treeStrikeData = { type: 'FeatureCollection', features: [...treeStrikeData.features, ...spans] };
      upsertGeoJsonSource('tree-strike-spans', treeStrikeData);
    }

    if (currentRisks.length) {
      applyRisks(currentRisks);
    } else {
      overheadBareData = baseOverheadBareData;
      overheadInsulatedData = baseOverheadInsulatedData;
      undergroundCableData = baseUndergroundCableData;
      jointsData = baseJointsData;
      upsertGeoJsonSource('overhead-bare', overheadBareData);
      upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);
      upsertGeoJsonSource('underground-cable', undergroundCableData);
      upsertGeoJsonSource('joints', jointsData);
    }
    upsertGeoJsonSource('cabine', cabineData);

    // Extend secondary substation index
    for (const f of substations) {
      const p = f.properties as unknown as GridShapeProperties;
      if (!p.name) continue;
      const existing = secondarySubIndex.get(p.name);
      const ln = p.line_name ?? p.asset_key;
      if (existing) {
        if (ln && !existing.lineNames.includes(ln)) existing.lineNames.push(ln);
      } else {
        secondarySubIndex.set(p.name, { parent: p.parent_substation_name ?? '', lineNames: ln ? [ln] : [] });
      }
    }
    if (substations.length) secondarySubIndex = new Map(secondarySubIndex);

    if (!hasFit) {
      fitToData(overheadBareData, overheadInsulatedData, undergroundCableData, cabineData, jointsData);
    }

    updateLayerFilters();
    tileLoadInProgress = false;
  }

  async function loadShapes() {
    if (shapesLoaded) return;

    // Fetch tile index for progressive loading
    try {
      tileIndex = await getTileIndex(NETWORK_ID);
    } catch (err) {
      console.warn('[grid] Tile index unavailable, falling back to full load:', err);
    }

    // Set up empty sources + layers once (overlay first, so it draws under the lines)
    upsertGeoJsonSource('tree-strike-spans', emptyFC());
    addTreeStrikeSpansLayer(layers.treeStrike);
    upsertGeoJsonSource('overhead-bare', emptyFC());
    addLineLayer('overhead-bare', 'lines-overhead-bare', layers.overheadBare, layers.windRisk);
    upsertGeoJsonSource('overhead-insulated', emptyFC());
    addLineLayer('overhead-insulated', 'lines-overhead-insulated', layers.overheadInsulated, layers.windRisk, [2, 4]);
    upsertGeoJsonSource('underground-cable', emptyFC());
    addLineLayer('underground-cable', 'lines-underground-cable', layers.undergroundCable, layers.heatRisk, [8, 4]);
    upsertGeoJsonSource('cabine', emptyFC());
    addCircleLayer('cabine', 'cabine-points', layers.cabine);
    addCabineLabelsLayer(layers.cabine);
    upsertGeoJsonSource('joints', emptyFC());
    addJointsLayer(layers.joints);

    shapesLoaded = true;

    if (tileIndex.length) {
      tilesReady = true;
      await loadVisibleTiles();
    } else {
      // Fallback: load all shapes at once (no tile_ids)
      try {
        const fc = await getShapes(NETWORK_ID);
        for (const f of fc.features) {
          const p = f.properties as unknown as GridShapeProperties;
          const base = { ...f, properties: { ...p, risk_level: 'NORMAL', risk_color_hex: null } };
          const cat = categorizeFeature(f);
          if (cat === 'substation') cabineData.features.push({ ...base, properties: { ...base.properties, cabina_label: cabinaLabel(p as unknown as Record<string, unknown>) } });
          else if (cat === 'insulated') baseOverheadInsulatedData.features.push(base);
          else if (cat === 'underground') baseUndergroundCableData.features.push(base);
          else if (cat === 'bare') baseOverheadBareData.features.push(base);
          else if (cat === 'joint') baseJointsData.features.push(base);
        }
        overheadBareData = baseOverheadBareData;
        overheadInsulatedData = baseOverheadInsulatedData;
        undergroundCableData = baseUndergroundCableData;
        jointsData = baseJointsData;
        upsertGeoJsonSource('overhead-bare', overheadBareData);
        upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);
        upsertGeoJsonSource('underground-cable', undergroundCableData);
        upsertGeoJsonSource('joints', jointsData);
        upsertGeoJsonSource('cabine', cabineData);

        const subIdx = new Map<string, { parent: string; lineNames: string[] }>();
        for (const f of cabineData.features) {
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
        fitToData(overheadBareData, overheadInsulatedData, undergroundCableData, cabineData, jointsData);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[grid] Failed to load shapes:', msg);
        loadError = `Failed to load grid topology: ${msg}`;
        loading = false;
        throw err;
      }
    }
  }

  function applyRisks(risks: GridRisk[]) {
    // Overhead layers take the wind vector, the underground layer the heat vector,
    // so a segment carrying both rows is never overwritten by the "wrong" one.
    const byKey = indexRisks(risks);

    overheadBareData = mergeRisksIntoFeatures(baseOverheadBareData, byKey, 'wind');
    upsertGeoJsonSource('overhead-bare', overheadBareData);

    overheadInsulatedData = mergeRisksIntoFeatures(baseOverheadInsulatedData, byKey, 'wind');
    upsertGeoJsonSource('overhead-insulated', overheadInsulatedData);

    undergroundCableData = mergeRisksIntoFeatures(baseUndergroundCableData, byKey, 'heat');
    upsertGeoJsonSource('underground-cable', undergroundCableData);

    jointsData = mergeRisksIntoFeatures(baseJointsData, byKey, 'heat');
    upsertGeoJsonSource('joints', jointsData);
  }

  async function loadAllData() {
    loading = true;
    loadError = null;
    try {
      await loadShapes();
    } catch {
      return;
    }

    const f = buildFilters();
    const result = await fetchRisksOrError(() =>
      dataMode === 'nowcasting'
        ? getRisksNow(NETWORK_ID)
        // intra-day view: same rows as /risks for the selected 8-hour window
        : filterSlot !== null
          ? getRisks8h({ ...f, slots: [filterSlot] })
          : getRisks(f),
    );

    if (result.ok) {
      currentRisks = result.risks;
    } else {
      // Never apply an empty list as if valid: show the network with no risk
      // levels (neutral, not "all normal") and surface the error banner.
      console.error('[grid] Failed to load risks:', result.error);
      currentRisks = [];
      loadError = result.error;
    }
    applyRisks(currentRisks);
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

    // Tree-strike spans — same topology filters as the conductor layers (no risk level:
    // exposure is static). Spans carry line_name rather than asset_key.
    const spanConditions: unknown[] = [];
    if (filterSubstations.length) {
      spanConditions.push(['in', ['get', 'parent_substation_name'], ['literal', filterSubstations]]);
    }
    if (filterLines.length) {
      spanConditions.push(['in', ['get', 'line_name'], ['literal', filterLines]]);
    }
    if (filterUnits.length) {
      spanConditions.push(['in', ['get', 'operational_unit'], ['literal', filterUnits]]);
    }
    if (filterMunicipalities.length) {
      spanConditions.push(['in', ['get', 'municipality'], ['literal', filterMunicipalities]]);
    }
    if (map.getLayer(TREE_STRIKE_LAYER_ID)) {
      map.setFilter(
        TREE_STRIKE_LAYER_ID,
        (spanConditions.length ? ['all', ...spanConditions] : null) as maplibregl.FilterSpecification | null
      );
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

    // Joints carry no line/unit/substation attributes: only municipality and risk level apply.
    const jointConditions: unknown[] = [];
    if (filterMunicipalities.length) {
      jointConditions.push(['in', ['get', 'municipality'], ['literal', filterMunicipalities]]);
    }
    if (filterRisk.length) {
      jointConditions.push(['in', ['get', 'risk_level'], ['literal', filterRisk]]);
    }
    if (map.getLayer(JOINTS_LAYER_ID)) {
      map.setFilter(
        JOINTS_LAYER_ID,
        (jointConditions.length ? ['all', ...jointConditions] : null) as maplibregl.FilterSpecification | null
      );
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

  function onSlotChange(slot: Slot | null) {
    if (slot === filterSlot) return;
    filterSlot = slot;
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
  $effect(() => { setLayerVisibility('lines-overhead-bare', layers.overheadBare); });
  $effect(() => { setLayerVisibility('lines-overhead-insulated', layers.overheadInsulated); });
  $effect(() => { setLayerVisibility('lines-underground-cable', layers.undergroundCable); });
  $effect(() => {
    setLayerVisibility('cabine-points', layers.cabine);
    setLayerVisibility('cabine-labels', layers.cabine);
  });
  $effect(() => { setLayerVisibility(TREE_STRIKE_LAYER_ID, layers.treeStrike); });
  $effect(() => { setLayerVisibility(JOINTS_LAYER_ID, layers.joints); });

  // Risk colouring on/off — repaint, geometry stays visible.
  $effect(() => {
    const wind = layers.windRisk;
    const heat = layers.heatRisk;
    const imagery = onImagery();
    if (!map) return;
    for (const def of LINE_LAYER_DEFS) {
      if (!map.getLayer(def.layerId)) continue;
      map.setPaintProperty(def.layerId, 'line-color', riskColorExpr(def.vector === 'wind' ? wind : heat, imagery));
    }
    if (map.getLayer(JOINTS_LAYER_ID)) {
      map.setPaintProperty(JOINTS_LAYER_ID, 'circle-color', jointColorExpr(heat, imagery));
    }
  });

  // Persist the menu state whenever any toggle changes.
  $effect(() => {
    JSON.stringify({ ...layers });
    persistLayers();
  });

  // Basemap follows the theme (auto) or the explicit satellite choice.
  $effect(() => {
    $themeOverride;
    layers.basemap;
    if (!map) return;
    const next = currentStyle();
    if (next.key !== activeMapStyle) {
      activeMapStyle = next.key;
      // diff:false forces a full style reload so `style.load` fires and
      // restoreLayers() re-adds our sources/layers on top of the new basemap.
      map.setStyle(next.style, { diff: false });
    }
  });

  // ---------------------------------------------------------------------------
  // Mount
  // ---------------------------------------------------------------------------
  onMount(() => {
    const initialStyle = currentStyle();
    activeMapStyle = initialStyle.key;

    const mapState = readUrlMapState();
    map = new maplibregl.Map({
      container: mapContainer,
      style: initialStyle.style,
      center: mapState ? [mapState.lng, mapState.lat] : [0, 40],
      zoom: mapState?.zoom ?? 2,
    });

    if (mapState) hasFit = true;

    map.addControl(new maplibregl.NavigationControl(), 'top-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('moveend', () => { syncUrl(); loadVisibleTiles(); });
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
      filterSlot = urlFilters.slot;

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
      selectedSlot={filterSlot}
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
      onslotchange={onSlotChange}
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
      <LayerMenu />

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

  /* MapLibre popup styling */
  :global(.maplibregl-popup-content) {
    padding: 12px 14px;
    border-radius: 10px;
    font-family: inherit;
    font-size: 12px;
    color: var(--celine-text, #1e293b);
    background: var(--celine-bg-elevated, #ffffff);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
  /* MapLibre paints the tip white; follow the popup background in dark mode too. */
  :global(.maplibregl-popup-anchor-top .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-top-left .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-top-right .maplibregl-popup-tip) {
    border-bottom-color: var(--celine-bg-elevated, #ffffff);
  }
  :global(.maplibregl-popup-anchor-bottom .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip) {
    border-top-color: var(--celine-bg-elevated, #ffffff);
  }
  :global(.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
    border-right-color: var(--celine-bg-elevated, #ffffff);
  }
  :global(.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
    border-left-color: var(--celine-bg-elevated, #ffffff);
  }
  :global(.maplibregl-popup-close-button) {
    color: var(--celine-text-muted, #64748b);
  }
</style>
