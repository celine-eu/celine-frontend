<script lang="ts">
  import { _ } from 'svelte-i18n';
  import AutocompleteSelect from './AutocompleteSelect.svelte';

  interface Props {
    dates: string[];
    substations: string[];
    lines: string[];
    units: string[];
    selectedDates: string[];
    selectedSubstations: string[];
    selectedLines: string[];
    selectedUnits: string[];
    selectedRisk: string[];
    onchange: (filters: {
      dates: string[];
      substations: string[];
      lines: string[];
      units: string[];
      risk: string[];
    }) => void;
    onexport: (type: 'wind' | 'heat') => void;
  }

  let {
    dates = [],
    substations = [],
    lines = [],
    units = [],
    selectedDates = $bindable([]),
    selectedSubstations = $bindable([]),
    selectedLines = $bindable([]),
    selectedUnits = $bindable([]),
    selectedRisk = $bindable([]),
    onchange,
    onexport,
  }: Props = $props();

  let collapsed = $state(false);
  let exportOpen = $state(false);
  let exportRoot: HTMLDivElement = $state()!;

  $effect(() => {
    if (!exportOpen) return;
    function handleOutside(e: PointerEvent) {
      if (!exportRoot?.contains(e.target as Node)) exportOpen = false;
    }
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  });

  const RISK_LEVELS = ['ALERT', 'WARNING', 'NORMAL'];

  function toggle(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  function apply() {
    onchange({
      dates: selectedDates,
      substations: selectedSubstations,
      lines: selectedLines,
      units: selectedUnits,
      risk: selectedRisk,
    });
  }

  function reset() {
    selectedDates = [];
    selectedSubstations = [];
    selectedLines = [];
    selectedUnits = [];
    selectedRisk = [];
    onchange({ dates: [], substations: [], lines: [], units: [], risk: [] });
  }

  const hasFilters = $derived(
    selectedDates.length + selectedSubstations.length + selectedLines.length +
    selectedUnits.length + selectedRisk.length > 0
  );
</script>

<aside class="sidebar" class:collapsed>
  <button
    class="toggle-btn"
    onclick={() => (collapsed = !collapsed)}
    title={collapsed ? 'Show filters' : 'Hide filters'}
  >
    {collapsed ? '›' : '‹'}
  </button>

  {#if !collapsed}
    <div class="sidebar-inner">
      <div class="sidebar-header">
        <span class="sidebar-title">{$_('filter.title', { default: 'Filters' })}</span>
        {#if hasFilters}
          <button class="clear-all" onclick={reset}>{$_('filter.reset')}</button>
        {/if}
      </div>

      <div class="sidebar-body">
        <div class="filter-group">
          <span class="filter-label">{$_('filter.date')}</span>
          <AutocompleteSelect options={dates} bind:selected={selectedDates} placeholder="Search dates…" />
        </div>

        <div class="filter-group">
          <span class="filter-label">{$_('filter.substation')}</span>
          <AutocompleteSelect options={substations} bind:selected={selectedSubstations} placeholder="Search substations…" />
        </div>

        <div class="filter-group">
          <span class="filter-label">{$_('filter.line')}</span>
          <AutocompleteSelect options={lines} bind:selected={selectedLines} placeholder="Search lines…" />
        </div>

        <div class="filter-group">
          <span class="filter-label">{$_('filter.unit')}</span>
          <AutocompleteSelect options={units} bind:selected={selectedUnits} placeholder="Search units…" />
        </div>

        <div class="filter-group">
          <span class="filter-label">{$_('filter.risk')}</span>
          <div class="risk-chips">
            {#each RISK_LEVELS as r}
              <button
                class="chip"
                class:selected={selectedRisk.includes(r)}
                onclick={() => (selectedRisk = toggle(selectedRisk, r))}
                data-risk={r.toLowerCase()}
              >{r}</button>
            {/each}
          </div>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="export-wrapper" bind:this={exportRoot}>
          <button class="btn-export" onclick={() => (exportOpen = !exportOpen)}>
            {$_('export.button')} <span class="export-chevron" class:open={exportOpen}>▾</span>
          </button>
          {#if exportOpen}
            <div class="export-dropdown">
              <button class="export-option" onclick={() => { onexport('wind'); exportOpen = false; }}>
                {$_('layer.wind')}
              </button>
              <button class="export-option" onclick={() => { onexport('heat'); exportOpen = false; }}>
                {$_('layer.heat')}
              </button>
            </div>
          {/if}
        </div>
        <button class="btn-primary" onclick={apply}>{$_('filter.apply')}</button>
      </div>
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: row;
    width: 240px;
    flex-shrink: 0;
    background: var(--celine-bg-elevated, #fff);
    border-right: 1px solid var(--celine-border, #e2e8f0);
    transition: width 0.2s ease;
    overflow: visible;
  }

  .sidebar.collapsed {
    width: 28px;
  }

  .toggle-btn {
    position: absolute;
    top: 50%;
    right: -13px;
    transform: translateY(-50%);
    z-index: 20;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--celine-border, #e2e8f0);
    background: var(--celine-bg-elevated, #fff);
    color: var(--celine-text-muted, #64748b);
    font-size: 0.85rem;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  .toggle-btn:hover {
    background: var(--celine-bg-hover, #f1f5f9);
    color: var(--celine-text, #1e293b);
  }

  .sidebar-inner {
    display: flex;
    flex-direction: column;
    width: 240px;
    height: 100%;
    overflow-x: clip;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 0.875rem 0.5rem;
    flex-shrink: 0;
  }

  .sidebar-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--celine-text-muted, #64748b);
  }

  .clear-all {
    font-size: 0.7rem;
    color: var(--celine-primary, #0d9488);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .clear-all:hover {
    text-decoration: underline;
  }

  .sidebar-body {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .filter-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--celine-text-muted, #64748b);
  }

  .risk-chips {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .chip {
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    border: 1px solid var(--celine-border, #e2e8f0);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    background: transparent;
    color: var(--celine-text-muted, #64748b);
    transition: all 0.15s;
  }

  .chip[data-risk='alert'] { border-color: #D00000; color: #D00000; }
  .chip[data-risk='alert'].selected { background: #D00000; color: #fff; }
  .chip[data-risk='warning'] { border-color: #c49a00; color: #c49a00; }
  .chip[data-risk='warning'].selected { background: #F7D000; color: #1e293b; }
  .chip[data-risk='normal'] { border-color: #00A000; color: #00A000; }
  .chip[data-risk='normal'].selected { background: #00A000; color: #fff; }

  .sidebar-footer {
    padding: 0.75rem 0.875rem;
    flex-shrink: 0;
    border-top: 1px solid var(--celine-border, #e2e8f0);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .export-wrapper {
    position: relative;
  }

  .btn-export {
    width: 100%;
    padding: 0.5rem;
    background: var(--celine-bg, #f8fafc);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    color: var(--celine-text, #1e293b);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .btn-export:hover {
    background: var(--celine-bg-hover, #f1f5f9);
  }

  .export-chevron {
    font-size: 0.75rem;
    transition: transform 0.15s;
    display: inline-block;
  }

  .export-chevron.open {
    transform: rotate(180deg);
  }

  .export-dropdown {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    z-index: 200;
    overflow: hidden;
  }

  .export-option {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    color: var(--celine-text, #1e293b);
    background: none;
    border: none;
    cursor: pointer;
  }

  .export-option:hover {
    background: var(--celine-bg-hover, #f1f5f9);
  }

  .btn-primary {
    width: 100%;
    padding: 0.5rem;
    background: var(--celine-primary, #0d9488);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover { filter: brightness(1.1); }
</style>
