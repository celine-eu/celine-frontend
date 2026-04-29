<script lang="ts">
  import { onMount } from 'svelte';
  import type { PickedLocation } from './types.js';

  interface Props {
    onLocationChange?: (location: PickedLocation | null) => void;
    initialLat?: number;
    initialLng?: number;
    initialZoom?: number;
  }

  let {
    onLocationChange,
    initialLat = 46.07,
    initialLng = 11.12,
    initialZoom = 13,
  }: Props = $props();

  // ── Reactive UI state ───────────────────────────────────────────────────────
  let mapEl: HTMLDivElement;
  let address = $state('');
  let searching = $state(false);
  let searchError = $state('');
  let drawingMode = $state(false);   // rectangle-drag active
  let editingPolygon = $state(false); // polygon drawn and editable
  let vertexCount = $state(0);
  let drawnLocation: PickedLocation | null = $state(null);

  // ── Non-reactive Leaflet state ──────────────────────────────────────────────
  let L: typeof import('leaflet') | null = null;
  let map: import('leaflet').Map | null = null;

  // Rectangle drawing
  let drawing = false;
  let startLatLng: import('leaflet').LatLng | null = null;
  let previewRect: import('leaflet').Rectangle | null = null;

  // Polygon editing
  let vertices: import('leaflet').LatLng[] = [];
  let polygon: import('leaflet').Polygon | null = null;
  let vertexMarkers: import('leaflet').Marker[] = [];
  let midpointMarkers: import('leaflet').Marker[] = [];
  let vertexIcon: import('leaflet').DivIcon;
  let midpointIcon: import('leaflet').DivIcon;

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  onMount(() => {
    (async () => {
      const mod = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      L = (mod.default ?? mod) as typeof import('leaflet');

      map = L.map(mapEl, { center: [initialLat, initialLng], zoom: initialZoom });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
        maxZoom: 20,
      }).addTo(map);

      // Vertex handle: white circle with teal border, draggable
      vertexIcon = L.divIcon({
        className: '',
        html: '<div class="roi-vh"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      // Midpoint handle: small teal circle, click to insert vertex
      midpointIcon = L.divIcon({
        className: '',
        html: '<div class="roi-mh"></div>',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      map.on('mousedown', onMapMouseDown);
      map.on('mousemove', onMapMouseMove);
      map.on('mouseup', onMapMouseUp);

      // Touch support for mobile rectangle drawing
      const container = map.getContainer();
      container.addEventListener('touchstart', onTouchStart, { passive: false });
      container.addEventListener('touchmove', onTouchMove, { passive: false });
      container.addEventListener('touchend', onTouchEnd, { passive: false });
    })();

    return () => {
      if (map) {
        const container = map.getContainer();
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        map.remove();
      }
    };
  });

  // ── Rectangle drawing ───────────────────────────────────────────────────────

  function onMapMouseDown(e: import('leaflet').LeafletMouseEvent) {
    if (!drawingMode || !L || !map) return;
    drawing = true;
    startLatLng = e.latlng;
    map.dragging.disable();
    clearPolygonLayers();
  }

  function onMapMouseMove(e: import('leaflet').LeafletMouseEvent) {
    if (!drawing || !startLatLng || !L || !map) return;
    if (previewRect) map.removeLayer(previewRect);
    previewRect = L.rectangle(
      [[startLatLng.lat, startLatLng.lng], [e.latlng.lat, e.latlng.lng]],
      { color: '#0d9488', weight: 2, fillOpacity: 0.12, dashArray: '6 4' },
    ).addTo(map);
  }

  function onMapMouseUp(e: import('leaflet').LeafletMouseEvent) {
    if (!drawing || !startLatLng || !L || !map) return;
    drawing = false;
    map.dragging.enable();

    if (previewRect) { map.removeLayer(previewRect); previewRect = null; }

    const sw = L.latLng(
      Math.min(startLatLng.lat, e.latlng.lat),
      Math.min(startLatLng.lng, e.latlng.lng),
    );
    const ne = L.latLng(
      Math.max(startLatLng.lat, e.latlng.lat),
      Math.max(startLatLng.lng, e.latlng.lng),
    );

    if (Math.abs(ne.lat - sw.lat) < 0.00005 || Math.abs(ne.lng - sw.lng) < 0.00005) return;

    // Convert rectangle to 4-vertex polygon (NW → NE → SE → SW, clockwise)
    vertices = [
      L.latLng(ne.lat, sw.lng), // NW
      L.latLng(ne.lat, ne.lng), // NE
      L.latLng(sw.lat, ne.lng), // SE
      L.latLng(sw.lat, sw.lng), // SW
    ];

    drawingMode = false;
    rebuildHandles();
  }

  // ── Touch rectangle drawing (mobile) ─────────────────────────────────────────

  function touchToLatLng(touch: Touch): import('leaflet').LatLng {
    if (!L || !map) return L!.latLng(0, 0);
    const rect = map.getContainer().getBoundingClientRect();
    const point = L.point(touch.clientX - rect.left, touch.clientY - rect.top);
    return map.containerPointToLatLng(point);
  }

  function onTouchStart(e: TouchEvent) {
    if (!drawingMode || !L || !map || e.touches.length !== 1) return;
    e.preventDefault();
    drawing = true;
    startLatLng = touchToLatLng(e.touches[0]);
    map.dragging.disable();
    clearPolygonLayers();
  }

  function onTouchMove(e: TouchEvent) {
    if (!drawing || !startLatLng || !L || !map || e.touches.length !== 1) return;
    e.preventDefault();
    const latlng = touchToLatLng(e.touches[0]);
    if (previewRect) map.removeLayer(previewRect);
    previewRect = L.rectangle(
      [[startLatLng.lat, startLatLng.lng], [latlng.lat, latlng.lng]],
      { color: '#0d9488', weight: 2, fillOpacity: 0.12, dashArray: '6 4' },
    ).addTo(map);
  }

  function onTouchEnd(e: TouchEvent) {
    if (!drawing || !startLatLng || !L || !map) return;
    drawing = false;
    map.dragging.enable();

    const latlng = e.changedTouches.length > 0
      ? touchToLatLng(e.changedTouches[0])
      : startLatLng;

    if (previewRect) { map.removeLayer(previewRect); previewRect = null; }

    const sw = L.latLng(
      Math.min(startLatLng.lat, latlng.lat),
      Math.min(startLatLng.lng, latlng.lng),
    );
    const ne = L.latLng(
      Math.max(startLatLng.lat, latlng.lat),
      Math.max(startLatLng.lng, latlng.lng),
    );

    if (Math.abs(ne.lat - sw.lat) < 0.00005 || Math.abs(ne.lng - sw.lng) < 0.00005) return;

    vertices = [
      L.latLng(ne.lat, sw.lng),
      L.latLng(ne.lat, ne.lng),
      L.latLng(sw.lat, ne.lng),
      L.latLng(sw.lat, sw.lng),
    ];

    drawingMode = false;
    rebuildHandles();
  }

  // ── Polygon editing ─────────────────────────────────────────────────────────

  /**
   * Full rebuild: re-creates the polygon layer, all vertex handles,
   * and all midpoint handles from the current `vertices` array.
   * Called after structural changes (insert/delete vertex, dragend).
   */
  function rebuildHandles() {
    if (!L || !map) return;
    clearPolygonLayers();

    polygon = L.polygon([vertices], {
      color: '#0d9488',
      weight: 2,
      fillOpacity: 0.15,
    }).addTo(map);

    vertices.forEach((v, idx) => {
      if (!L || !map) return;
      const marker = L.marker([v.lat, v.lng], {
        icon: vertexIcon,
        draggable: true,
        zIndexOffset: 1000,
      }).addTo(map);

      // Real-time polygon reshape while dragging
      marker.on('drag', (e) => {
        vertices[idx] = (e.target as import('leaflet').Marker).getLatLng();
        polygon?.setLatLngs([vertices]);
        slideMidpoints(); // lightweight position-only update
        emitLocation();
      });

      // Full rebuild after drag ends (cleans up stale handles)
      marker.on('dragend', () => rebuildHandles());

      // Double-click removes vertex (minimum 3 kept)
      marker.on('dblclick', (e) => {
        L!.DomEvent.stopPropagation(e);
        if (vertices.length > 3) {
          vertices.splice(idx, 1);
          rebuildHandles();
        }
      });

      vertexMarkers.push(marker);
    });

    rebuildMidpoints();
    editingPolygon = true;
    vertexCount = vertices.length;
    emitLocation();
  }

  /**
   * Recreates midpoint handles.  Called by rebuildHandles and when
   * vertex count changes.
   */
  function rebuildMidpoints() {
    if (!L || !map) return;
    midpointMarkers.forEach(m => map!.removeLayer(m));
    midpointMarkers = [];

    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const insertAfter = i; // capture for closure
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % n];
      const mid = L.latLng((v1.lat + v2.lat) / 2, (v1.lng + v2.lng) / 2);

      const m = L.marker([mid.lat, mid.lng], {
        icon: midpointIcon,
        zIndexOffset: 500,
      }).addTo(map!);

      m.on('click', (e) => {
        L!.DomEvent.stopPropagation(e);
        // Insert a new vertex at the midpoint position
        vertices.splice(insertAfter + 1, 0, (e.target as import('leaflet').Marker).getLatLng());
        rebuildHandles();
      });

      midpointMarkers.push(m);
    }
  }

  /**
   * Lightweight: only updates midpoint marker positions without
   * removing/re-adding them.  Used during vertex drag for smooth animation.
   */
  function slideMidpoints() {
    if (!L) return;
    const n = vertices.length;
    midpointMarkers.forEach((m, i) => {
      if (i >= n) return;
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % n];
      m.setLatLng(L!.latLng((v1.lat + v2.lat) / 2, (v1.lng + v2.lng) / 2));
    });
  }

  /** Remove all Leaflet layers for the current polygon + handles. */
  function clearPolygonLayers() {
    if (!map) return;
    if (polygon) { map.removeLayer(polygon); polygon = null; }
    vertexMarkers.forEach(m => map!.removeLayer(m));
    vertexMarkers = [];
    midpointMarkers.forEach(m => map!.removeLayer(m));
    midpointMarkers = [];
  }

  /** Emit the current polygon as a PickedLocation. */
  function emitLocation() {
    if (!L || vertices.length < 3) return;
    const bounds = L.latLngBounds(vertices);
    const center = bounds.getCenter();
    const wkt = verticesToWkt(vertices);
    drawnLocation = { lat: center.lat, lng: center.lng, wkt, name: address };
    onLocationChange?.(drawnLocation);
  }

  function verticesToWkt(verts: import('leaflet').LatLng[]): string {
    const ring = [...verts, verts[0]].map(v => `${v.lng} ${v.lat}`).join(', ');
    return `POLYGON((${ring}))`;
  }

  // ── Controls ────────────────────────────────────────────────────────────────

  /** Start/cancel rectangle drawing. If a polygon exists, clear it first. */
  function startDrawing() {
    clearAll();
    drawingMode = true;
  }

  /** Clear everything and notify parent. */
  function clearAll() {
    clearPolygonLayers();
    vertices = [];
    editingPolygon = false;
    vertexCount = 0;
    drawingMode = false;
    drawnLocation = null;
    onLocationChange?.(null);
  }

  // ── Address search ──────────────────────────────────────────────────────────

  async function searchAddress() {
    if (!address.trim()) return;
    searching = true;
    searchError = '';
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', address.trim());
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'it');
      const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'it,en' } });
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      if (data.length > 0) {
        map?.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 17);
        // Keep existing polygon if already drawn (user may want to adjust)
      } else {
        searchError = 'Address not found. Try a more specific search.';
      }
    } catch {
      searchError = 'Search failed. Check your connection.';
    } finally {
      searching = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') searchAddress();
  }
</script>

<!-- Global styles for Leaflet DivIcon handles (outside Svelte scoping) -->
<svelte:head>
  <!-- Handled via :global below -->
</svelte:head>

<div class="map-picker">
  <!-- Address search -->
  <div class="search-row">
    <input
      type="text"
      class="address-input"
      placeholder="Enter address (e.g. Via Roma 1, Trento)"
      bind:value={address}
      onkeydown={handleKeydown}
    />
    <button
      class="btn btn-secondary"
      onclick={searchAddress}
      disabled={searching || !address.trim()}
    >
      {searching ? 'Searching…' : 'Search'}
    </button>
  </div>

  {#if searchError}
    <p class="error-text">{searchError}</p>
  {/if}

  <!-- Map -->
  <div class="map-wrap" class:drawing-mode={drawingMode} class:editing-mode={editingPolygon}>
    <div bind:this={mapEl} class="map-container"></div>

    <!-- Floating control bar inside map -->
    <div class="map-controls">
      {#if editingPolygon}
        <div class="map-bar">
          <span class="bar-badge">✓ {vertexCount} vertices</span>
          <button class="btn-bar" onclick={startDrawing}>Redraw</button>
          <button class="btn-bar btn-bar-danger" onclick={clearAll}>Clear</button>
        </div>
      {:else if drawingMode}
        <div class="map-bar map-bar-hint">
          Drag to draw a rectangle on the roof
        </div>
      {:else}
        <button class="btn btn-outline" onclick={startDrawing}>
          📐 Draw Rooftop
        </button>
      {/if}
    </div>
  </div>

  <!-- Edit instructions -->
  {#if editingPolygon}
    <div class="edit-hint">
      <span class="hint-item">⬤ Drag white handles to move vertices</span>
      <span class="hint-sep">·</span>
      <span class="hint-item"><span class="mh-sample"></span> Click teal dots to add a vertex</span>
      <span class="hint-sep">·</span>
      <span class="hint-item">Double-click a handle to delete it</span>
    </div>
  {/if}

  <!-- Location summary -->
  {#if drawnLocation}
    <p class="location-details">
      📍 {drawnLocation.lat.toFixed(5)}, {drawnLocation.lng.toFixed(5)}
      &nbsp;·&nbsp; {vertexCount}-vertex polygon
    </p>
  {/if}
</div>

<style>
  .map-picker {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* ── Search row ── */
  .search-row {
    display: flex;
    gap: 0.5rem;
  }

  .address-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    font-size: 0.875rem;
    outline: none;
    font-family: inherit;
    background: var(--celine-bg-elevated);
    color: var(--celine-text);
    transition:
      border-color var(--celine-transition-fast),
      box-shadow var(--celine-transition-fast);
  }

  .address-input:focus {
    border-color: var(--celine-primary);
    box-shadow: 0 0 0 2px var(--celine-primary-light);
  }

  /* ── Map wrapper ── */
  .map-wrap {
    position: relative;
    border-radius: var(--celine-radius-sm);
    overflow: hidden;
    border: 1px solid var(--celine-border);
    transition: border-color var(--celine-transition-fast);
  }

  .map-wrap.drawing-mode {
    cursor: crosshair;
    border-color: var(--celine-primary);
  }

  .map-wrap.editing-mode {
    border-color: var(--celine-primary);
  }

  .map-container {
    height: 380px;
    width: 100%;
  }

  /* ── Floating controls overlay ── */
  .map-controls {
    position: absolute;
    bottom: 0.75rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
  }

  .map-bar {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    padding: 0.25rem 0.5rem;
    box-shadow: var(--celine-shadow-md);
    font-size: 0.8125rem;
    white-space: nowrap;
  }

  .map-bar-hint {
    color: var(--celine-text-secondary);
    font-style: italic;
    padding: 0.375rem 0.75rem;
  }

  .bar-badge {
    font-weight: 500;
    color: var(--celine-primary);
    padding-right: 0.375rem;
    border-right: 1px solid var(--celine-border);
  }

  .btn-bar {
    background: transparent;
    border: none;
    font-size: 0.8125rem;
    font-family: inherit;
    cursor: pointer;
    padding: 0.125rem 0.375rem;
    border-radius: var(--celine-radius-sm);
    color: var(--celine-text-secondary);
    transition: background var(--celine-transition-fast), color var(--celine-transition-fast);
  }

  .btn-bar:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .btn-bar-danger:hover {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border-radius: var(--celine-radius-sm);
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid transparent;
    cursor: pointer;
    transition:
      background-color var(--celine-transition-fast),
      opacity var(--celine-transition-fast);
    font-family: inherit;
    white-space: nowrap;
    box-shadow: var(--celine-shadow-sm);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-outline {
    background: var(--celine-bg-elevated);
    color: var(--celine-primary);
    border-color: var(--celine-primary);
  }

  .btn-outline:hover:not(:disabled) {
    background: var(--celine-primary-light);
  }

  .btn-secondary {
    background: var(--celine-bg-elevated);
    color: var(--celine-primary);
    border-color: var(--celine-primary);
    box-shadow: none;
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--celine-primary-light);
  }

  /* ── Edit instructions ── */
  .edit-hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
    background: var(--celine-bg-sunken);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    padding: 0.375rem 0.75rem;
  }

  .hint-sep {
    color: var(--celine-text-tertiary);
  }

  .hint-item {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  /* Inline midpoint sample dot for the hint */
  .mh-sample {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #0d9488;
    border: 1.5px solid white;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 0 1px #0d9488;
  }

  /* ── Status line ── */
  .location-details {
    font-size: 0.8125rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  .error-text {
    font-size: 0.8125rem;
    color: var(--celine-danger-text);
    margin: 0;
  }

  /* ── Global: Leaflet DivIcon handle styles ────────────────────────────────
     These live outside Svelte's scoped CSS because the icons are injected
     as raw HTML by Leaflet into its own DOM containers.              ── */
  :global(.roi-vh) {
    width: 14px;
    height: 14px;
    background: white;
    border: 2.5px solid #0d9488;
    border-radius: 50%;
    cursor: grab;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
    transition: transform 0.1s;
  }

  :global(.roi-vh:hover) {
    transform: scale(1.25);
    border-color: #0f766e;
  }

  :global(.roi-vh:active) {
    cursor: grabbing;
    transform: scale(1.1);
  }

  :global(.roi-mh) {
    width: 10px;
    height: 10px;
    background: #0d9488;
    border: 2px solid white;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 0 0 1px #0d9488, 0 1px 3px rgba(0, 0, 0, 0.25);
    opacity: 0.75;
    transition: opacity 0.1s, transform 0.1s;
  }

  :global(.roi-mh:hover) {
    opacity: 1;
    transform: scale(1.3);
  }
</style>
