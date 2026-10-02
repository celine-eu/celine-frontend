<script lang="ts">
  /**
   * Risk exposure table — km at ALERT / WARNING per operational unit → line → tratta.
   * Rows come from the BFF `/risk-km` at tratta grain; the unit and line rollups are
   * computed client-side with the same arithmetic as the DT fetcher, so one request
   * feeds the whole drill-down and every CSV.
   */
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { _ } from 'svelte-i18n';
  import AutocompleteSelect from '$lib/components/AutocompleteSelect.svelte';
  import { getFilters, getRiskKm, type RiskKmRow } from '$lib/api';
  import { parseFilters, serializeFilters, EMPTY_FILTERS, type RiskVector } from '$lib/urlState';
  import {
    aggregateRows,
    sortRows,
    pct,
    fmtKm,
    fmtIndex,
    fmtPct,
    toCsv,
    riskKmCsvColumns,
    type RiskKmLevel,
    type RiskLevel,
    type SortDir,
  } from '$lib/riskTable';
  import { RISK_COLORS } from '$lib/mapPaint';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();
  const NETWORK_ID = $derived(data.me?.network_id ?? '');

  // ---------------------------------------------------------------------------
  // Filters (shared with the map through the URL)
  // ---------------------------------------------------------------------------
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  let date = $state(todayStr);
  let vector = $state<RiskVector>('wind');
  let minLevel = $state<'' | 'WARNING' | 'ALERT'>('');
  let selUnits = $state<string[]>([]);
  let selLines = $state<string[]>([]);
  let selSubstations = $state<string[]>([]);

  let availUnits = $state<string[]>([]);
  let availLines = $state<string[]>([]);
  let availSubstations = $state<string[]>([]);

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let tratte = $state<RiskKmRow[]>([]);

  let sortKey = $state<keyof RiskKmRow>('risk_index');
  let sortDir = $state<SortDir>('desc');
  let expandedUnits = $state<Set<string>>(new Set());
  let expandedLines = $state<Set<string>>(new Set()); // "unit|line"

  const unitRows = $derived(sortRows(aggregateRows(tratte, 'unit'), sortKey, sortDir));
  const totals = $derived.by(() => {
    const all = aggregateRows(tratte.map((r) => ({ ...r, operational_unit: '*' })), 'unit');
    return all[0] ?? null;
  });

  function linesOf(unit: string): RiskKmRow[] {
    return sortRows(aggregateRows(tratte.filter((r) => (r.operational_unit ?? '') === unit), 'line'), sortKey, sortDir);
  }
  function tratteOf(unit: string, line: string): RiskKmRow[] {
    return sortRows(tratte.filter((r) => (r.operational_unit ?? '') === unit && r.line_name === line), sortKey, sortDir);
  }

  function currentFilters() {
    return {
      ...EMPTY_FILTERS,
      date,
      vector,
      units: selUnits,
      lines: selLines,
      substations: selSubstations,
      risk: minLevel ? [minLevel] : [],
    };
  }

  function syncUrl() {
    replaceState('?' + serializeFilters(currentFilters()).toString(), {});
  }

  async function load() {
    if (!NETWORK_ID) return;
    loading = true;
    loadError = null;
    try {
      tratte = await getRiskKm({
        networkId: NETWORK_ID,
        dates: [date],
        level: 'tratta',
        risk_vector: [vector],
        operational_unit: selUnits,
        line_name: selLines,
        substation_name: selSubstations,
        min_level: minLevel || undefined,
      });
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      tratte = [];
    } finally {
      loading = false;
    }
  }

  function apply() {
    syncUrl();
    load();
  }

  function setSort(key: keyof RiskKmRow) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = key === 'line_name' || key === 'operational_unit' || key === 'municipality' ? 'asc' : 'desc'; }
  }

  function toggleUnit(u: string) {
    const next = new Set(expandedUnits);
    if (next.has(u)) next.delete(u); else next.add(u);
    expandedUnits = next;
  }
  function toggleLine(u: string, l: string) {
    const k = `${u}|${l}`;
    const next = new Set(expandedLines);
    if (next.has(k)) next.delete(k); else next.add(k);
    expandedLines = next;
  }

  function mapHref(units: string[], lines: string[], municipalities: string[] = []): string {
    return '/?' + serializeFilters({ ...EMPTY_FILTERS, date, vector, units, lines, municipalities, risk: minLevel ? [minLevel] : [] }).toString();
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  let exportOpen = $state(false);
  function exportCsv(level: RiskKmLevel) {
    const rows = level === 'tratta' ? tratte : aggregateRows(tratte, level);
    if (!rows.length) return;
    const csv = toCsv(rows, riskKmCsvColumns(level));
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rischio_${vector}_${level}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    exportOpen = false;
  }

  const levelColor = (l: RiskLevel) => RISK_COLORS[l] ?? '#808080';
  const treePct = (r: RiskKmRow) => (vector === 'wind' ? pct(r.km_tree_high, r.km_total) : null);
  const thermalPct = (r: RiskKmRow) => (vector === 'heat' ? pct(r.km_thermal_high, r.km_total) : null);

  onMount(async () => {
    const f = parseFilters(new URLSearchParams(window.location.search));
    if (f.date) date = f.date;
    if (f.vector) vector = f.vector;
    selUnits = f.units;
    selLines = f.lines;
    selSubstations = f.substations;
    if (f.risk.includes('ALERT')) minLevel = 'ALERT';
    else if (f.risk.includes('WARNING')) minLevel = 'WARNING';

    const filters = await getFilters(NETWORK_ID).catch(() => null);
    if (filters) {
      availUnits = filters.operational_units.filter(Boolean);
      availLines = filters.lines;
      availSubstations = filters.parent_substations;
    }
    load();
  });
</script>

<div class="table-page">
  <header class="page-header">
    <div>
      <h1>{$_('table.title')}</h1>
      <p class="subtitle">{$_('table.subtitle')}</p>
    </div>
    <div class="header-actions">
      <a class="btn-secondary" href={mapHref(selUnits, selLines)}>{$_('table.open_map')}</a>
      <div class="export-wrapper">
        <button class="btn-secondary" onclick={() => (exportOpen = !exportOpen)} disabled={!tratte.length}>
          {$_('export.button')} ▾
        </button>
        {#if exportOpen}
          <div class="export-dropdown">
            <button onclick={() => exportCsv('unit')}>{$_('table.export_unit')}</button>
            <button onclick={() => exportCsv('line')}>{$_('table.export_line')}</button>
            <button onclick={() => exportCsv('tratta')}>{$_('table.export_tratta')}</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <section class="toolbar">
    <label class="field">
      <span>{$_('filter.date')}</span>
      <div class="date-row">
        <input type="date" bind:value={date} min={`${new Date().getFullYear()}-01-01`} />
        <button class="chip" class:active={date === todayStr} onclick={() => (date = todayStr)}>{$_('filter.today')}</button>
        <button class="chip" class:active={date === tomorrowStr} onclick={() => (date = tomorrowStr)}>{$_('filter.tomorrow')}</button>
      </div>
    </label>
    <label class="field">
      <span>{$_('table.vector')}</span>
      <div class="segmented" role="radiogroup">
        <button role="radio" aria-checked={vector === 'wind'} class:active={vector === 'wind'} onclick={() => (vector = 'wind')}>{$_('layer.wind')}</button>
        <button role="radio" aria-checked={vector === 'heat'} class:active={vector === 'heat'} onclick={() => (vector = 'heat')}>{$_('layer.heat')}</button>
      </div>
    </label>
    <label class="field">
      <span>{$_('table.min_level')}</span>
      <select bind:value={minLevel}>
        <option value="">{$_('filter.all')}</option>
        <option value="WARNING">≥ {$_('risk.warning')}</option>
        <option value="ALERT">{$_('risk.alert')}</option>
      </select>
    </label>
    <div class="field">
      <span>{$_('filter.unit')}</span>
      <AutocompleteSelect options={availUnits} bind:selected={selUnits} placeholder={$_('filter.unit')} />
    </div>
    <div class="field">
      <span>{$_('filter.line')}</span>
      <AutocompleteSelect options={availLines} bind:selected={selLines} placeholder={$_('filter.line')} />
    </div>
    <div class="field">
      <span>{$_('filter.substation')}</span>
      <AutocompleteSelect options={availSubstations} bind:selected={selSubstations} placeholder={$_('filter.substation')} />
    </div>
    <div class="field actions">
      <button class="btn-primary" onclick={apply} disabled={loading}>{$_('filter.apply')}</button>
    </div>
  </section>

  {#if loadError}
    <p class="error">{loadError}</p>
  {/if}

  {#if totals}
    <section class="summary">
      <div class="card"><span class="label">{$_('table.km_total')}</span><strong>{fmtKm(totals.km_total)}</strong></div>
      <div class="card"><span class="label">{$_('table.km_alert')}</span><strong style:color={RISK_COLORS.ALERT}>{fmtKm(totals.km_alert)}</strong><small>{fmtPct(pct(totals.km_alert, totals.km_total))}</small></div>
      <div class="card"><span class="label">{$_('table.km_warning')}</span><strong style:color="#b45309">{fmtKm(totals.km_warning)}</strong><small>{fmtPct(pct(totals.km_warning, totals.km_total))}</small></div>
      <div class="card"><span class="label">{$_('table.index')}</span><strong>{fmtIndex(totals.risk_index)}</strong><small>{$_('table.index_help')}</small></div>
      <div class="card"><span class="label">{$_('table.level')}</span><strong><span class="pill" style:background={levelColor(totals.worst_level)}>{totals.worst_level}</span></strong></div>
    </section>
  {/if}

  <section class="table-wrap">
    {#if loading}
      <p class="muted">{$_('table.loading')}</p>
    {:else if !tratte.length}
      <p class="muted">{$_('table.empty')}</p>
    {:else}
      <table class="risk-table">
        <thead>
          <tr>
            <th class="w-name" aria-sort={sortKey === 'operational_unit' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}><button onclick={() => setSort('operational_unit')}>{$_('table.unit')} / {$_('table.line')} / {$_('table.tratta')}</button></th>
            <th class="num"><button onclick={() => setSort('n_tratte')}>{$_('table.n_tratte')}</button></th>
            <th class="num"><button onclick={() => setSort('km_total')}>{$_('table.km_total')}</button></th>
            <th class="num"><button onclick={() => setSort('km_alert')}>{$_('table.km_alert')}</button></th>
            <th class="num">{$_('table.pct_alert')}</th>
            <th class="num"><button onclick={() => setSort('km_warning')}>{$_('table.km_warning')}</button></th>
            <th class="num">{$_('table.pct_warning')}</th>
            <th class="num"><button onclick={() => setSort('risk_index')} class:sorted={sortKey === 'risk_index'}>{$_('table.index')} {sortKey === 'risk_index' ? (sortDir === 'asc' ? '▲' : '▼') : ''}</button></th>
            {#if vector === 'wind'}
              <th class="num"><button onclick={() => setSort('km_tree_high')}>{$_('table.tree_high')}</button></th>
            {/if}
            {#if vector === 'heat'}
              <th class="num"><button onclick={() => setSort('km_thermal_high')}>{$_('table.thermal_high')}</button></th>
            {/if}
            <th><button onclick={() => setSort('worst_level')}>{$_('table.level')}</button></th>
            <th class="w-map"></th>
          </tr>
        </thead>
        <tbody>
          {#each unitRows as u (u.operational_unit)}
            {@const uk = u.operational_unit ?? ''}
            <tr class="row-unit" onclick={() => toggleUnit(uk)}>
              <td class="w-name"><span class="caret" class:open={expandedUnits.has(uk)}>▸</span> <strong>{uk || '—'}</strong> <small class="muted">{u.n_lines} {$_('table.lines')}</small></td>
              <td class="num">{u.n_tratte}</td>
              <td class="num">{fmtKm(u.km_total)}</td>
              <td class="num alert">{fmtKm(u.km_alert)}</td>
              <td class="num">{fmtPct(pct(u.km_alert, u.km_total))}</td>
              <td class="num warning">{fmtKm(u.km_warning)}</td>
              <td class="num">{fmtPct(pct(u.km_warning, u.km_total))}</td>
              <td class="num"><strong>{fmtIndex(u.risk_index)}</strong></td>
              {#if vector === 'wind'}<td class="num">{fmtPct(treePct(u))}</td>{/if}
              {#if vector === 'heat'}<td class="num">{fmtPct(thermalPct(u))}</td>{/if}
              <td><span class="pill" style:background={levelColor(u.worst_level)}>{u.worst_level}</span></td>
              <td class="w-map"><a href={mapHref([uk], [])} onclick={(e) => e.stopPropagation()} title={$_('table.show_map')}>🗺</a></td>
            </tr>
            {#if expandedUnits.has(uk)}
              {#each linesOf(uk) as l (l.line_name)}
                {@const lk = l.line_name ?? ''}
                <tr class="row-line" onclick={() => toggleLine(uk, lk)}>
                  <td class="w-name indent-1"><span class="caret" class:open={expandedLines.has(`${uk}|${lk}`)}>▸</span> {lk} <small class="muted">{l.parent_substation_name ?? ''}</small></td>
                  <td class="num">{l.n_tratte}</td>
                  <td class="num">{fmtKm(l.km_total)}</td>
                  <td class="num alert">{fmtKm(l.km_alert)}</td>
                  <td class="num">{fmtPct(pct(l.km_alert, l.km_total))}</td>
                  <td class="num warning">{fmtKm(l.km_warning)}</td>
                  <td class="num">{fmtPct(pct(l.km_warning, l.km_total))}</td>
                  <td class="num"><strong>{fmtIndex(l.risk_index)}</strong></td>
                  {#if vector === 'wind'}<td class="num">{fmtPct(treePct(l))}</td>{/if}
                  {#if vector === 'heat'}<td class="num">{fmtPct(thermalPct(l))}</td>{/if}
                  <td><span class="pill" style:background={levelColor(l.worst_level)}>{l.worst_level}</span></td>
                  <td class="w-map"><a href={mapHref([uk], [lk])} onclick={(e) => e.stopPropagation()} title={$_('table.show_map')}>🗺</a></td>
                </tr>
                {#if expandedLines.has(`${uk}|${lk}`)}
                  {#each tratteOf(uk, lk) as t (t.segment_id)}
                    <tr class="row-tratta">
                      <td class="w-name indent-2">{t.municipality} <small class="muted">{$_(`conductor.${t.conductor_type}`, { default: t.conductor_type ?? '' })}</small></td>
                      <td class="num">{t.n_fragments}</td>
                      <td class="num">{fmtKm(t.km_total)}</td>
                      <td class="num alert">{fmtKm(t.km_alert)}</td>
                      <td class="num">{fmtPct(pct(t.km_alert, t.km_total))}</td>
                      <td class="num warning">{fmtKm(t.km_warning)}</td>
                      <td class="num">{fmtPct(pct(t.km_warning, t.km_total))}</td>
                      <td class="num"><strong>{fmtIndex(t.risk_index)}</strong></td>
                      {#if vector === 'wind'}<td class="num">{fmtPct(treePct(t))}</td>{/if}
                      {#if vector === 'heat'}<td class="num">{fmtPct(thermalPct(t))}</td>{/if}
                      <td><span class="pill" style:background={levelColor(t.worst_level)}>{t.worst_level}</span></td>
                      <td class="w-map"><a href={mapHref([uk], [lk], t.municipality ? [t.municipality] : [])} title={$_('table.show_map')}>🗺</a></td>
                    </tr>
                  {/each}
                {/if}
              {/each}
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</div>

<style>
  .table-page {
    padding: 1.25rem 1.5rem;
    height: 100%;
    overflow-y: auto;
    color: var(--celine-text, #1e293b);
  }
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }
  .page-header h1 { font-size: 1.25rem; font-weight: 700; margin: 0; }
  .subtitle { margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--celine-text-muted, #64748b); }
  .header-actions { display: flex; gap: 0.5rem; align-items: center; position: relative; }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    align-items: flex-end;
    padding: 0.75rem 1rem;
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    background: var(--celine-bg-elevated, #fff);
    margin-bottom: 1rem;
  }
  .field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 160px; }
  .field > span { font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--celine-text-muted, #64748b); }
  .field select, .field input[type='date'] {
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    font-size: 0.85rem;
    background: var(--celine-bg, #f8fafc);
    color: inherit;
  }
  .date-row { display: flex; gap: 0.35rem; align-items: center; }
  .chip {
    border: 1px solid var(--celine-border, #e2e8f0);
    background: transparent;
    color: inherit;
    border-radius: 999px;
    padding: 0.25rem 0.6rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .chip.active { background: var(--celine-primary, #0d9488); color: #fff; border-color: transparent; }
  .segmented { display: inline-flex; border: 1px solid var(--celine-border, #e2e8f0); border-radius: 6px; overflow: hidden; }
  .segmented button { border: 0; background: transparent; color: inherit; padding: 0.4rem 0.75rem; font-size: 0.8rem; cursor: pointer; }
  .segmented button.active { background: var(--celine-primary, #0d9488); color: #fff; }
  .actions { justify-content: flex-end; }

  .btn-primary, .btn-secondary {
    border-radius: 6px;
    padding: 0.45rem 0.9rem;
    font-size: 0.85rem;
    cursor: pointer;
    text-decoration: none;
  }
  .btn-primary { background: var(--celine-primary, #0d9488); color: #fff; border: 0; }
  .btn-primary:disabled { opacity: 0.6; cursor: default; }
  .btn-secondary { background: transparent; color: inherit; border: 1px solid var(--celine-border, #e2e8f0); }
  .btn-secondary:disabled { opacity: 0.5; }
  .export-wrapper { position: relative; }
  .export-dropdown {
    position: absolute; right: 0; top: calc(100% + 4px); z-index: 20;
    display: flex; flex-direction: column; min-width: 180px;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0); border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  }
  .export-dropdown button { border: 0; background: transparent; color: inherit; text-align: left; padding: 0.5rem 0.75rem; font-size: 0.8rem; cursor: pointer; }
  .export-dropdown button:hover { background: var(--celine-bg, #f1f5f9); }

  .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
  .card {
    border: 1px solid var(--celine-border, #e2e8f0); border-radius: 8px; padding: 0.6rem 0.8rem;
    background: var(--celine-bg-elevated, #fff); display: flex; flex-direction: column; gap: 0.15rem;
  }
  .card .label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--celine-text-muted, #64748b); }
  .card strong { font-size: 1.25rem; }
  .card small { font-size: 0.7rem; color: var(--celine-text-muted, #64748b); }

  .table-wrap { overflow-x: auto; border: 1px solid var(--celine-border, #e2e8f0); border-radius: 8px; background: var(--celine-bg-elevated, #fff); }
  .risk-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
  .risk-table th, .risk-table td { padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--celine-border, #e2e8f0); white-space: nowrap; }
  .risk-table th { text-align: left; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--celine-text-muted, #64748b); background: var(--celine-bg, #f8fafc); position: sticky; top: 0; }
  .risk-table th button { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; padding: 0; text-transform: inherit; letter-spacing: inherit; }
  .risk-table th.num, .risk-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .w-name { min-width: 260px; }
  .w-map { width: 2rem; text-align: center; }
  .w-map a { text-decoration: none; }
  .indent-1 { padding-left: 1.75rem !important; }
  .indent-2 { padding-left: 3.25rem !important; }
  .row-unit { cursor: pointer; background: var(--celine-bg-elevated, #fff); }
  .row-unit:hover, .row-line:hover { background: var(--celine-bg, #f1f5f9); }
  .row-line { cursor: pointer; }
  .row-tratta { color: var(--celine-text-muted, #475569); }
  .caret { display: inline-block; width: 0.9rem; transition: transform 0.15s; color: var(--celine-text-muted, #64748b); }
  .caret.open { transform: rotate(90deg); }
  .alert { color: #D00000; }
  .warning { color: #b45309; }
  .pill { color: #fff; padding: 1px 8px; border-radius: 99px; font-size: 0.65rem; font-weight: 700; }
  .muted { color: var(--celine-text-muted, #64748b); }
  p.muted { padding: 1rem; margin: 0; }
  .error { color: #D00000; font-size: 0.85rem; }
</style>
