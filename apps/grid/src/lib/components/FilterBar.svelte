<script lang="ts">
  import { _ } from 'svelte-i18n';
  import AutocompleteSelect from './AutocompleteSelect.svelte';

  type DataMode = 'forecast' | 'nowcasting';

  interface Props {
    mode: DataMode;
    substations: string[];
    secondarySubstations: string[];
    lines: string[];
    units: string[];
    municipalities: string[];
    selectedDate: string;
    selectedSubstations: string[];
    selectedSecondarySubstations: string[];
    selectedLines: string[];
    selectedUnits: string[];
    selectedMunicipalities: string[];
    selectedRisk: string[];
    minDate: string;
    maxDate: string;
    onchange: (filters: {
      substations: string[];
      secondarySubstations: string[];
      lines: string[];
      units: string[];
      municipalities: string[];
      risk: string[];
    }) => void;
    ondatechange: (date: string) => void;
    onmodechange: (mode: DataMode) => void;
    onexport: (type: 'wind' | 'heat') => void;
    onshare: () => void;
  }

  let {
    mode = 'forecast',
    substations = [],
    secondarySubstations = [],
    lines = [],
    units = [],
    municipalities = [],
    selectedDate = '',
    selectedSubstations = $bindable([]),
    selectedSecondarySubstations = $bindable([]),
    selectedLines = $bindable([]),
    selectedUnits = $bindable([]),
    selectedMunicipalities = $bindable([]),
    selectedRisk = $bindable([]),
    minDate = '',
    maxDate = '',
    onchange,
    ondatechange,
    onmodechange,
    onexport,
    onshare,
  }: Props = $props();

  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();

  let editingDate = $state(false);
  let dateInputEl = $state<HTMLInputElement | null>(null);

  function fmtDate(d: string): string {
    if (!d) return '—';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }

  function startDateEdit() {
    editingDate = true;
    setTimeout(() => dateInputEl?.showPicker?.(), 50);
  }

  function commitDateEdit(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    editingDate = false;
    if (val) ondatechange(val);
  }

  function handleDateKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      const val = (e.target as HTMLInputElement).value;
      editingDate = false;
      if (val) ondatechange(val);
    } else if (e.key === 'Escape') {
      editingDate = false;
    }
  }

  let copied = $state(false);

  function handleShare() {
    onshare();
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

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

  const RISK_LEVELS = ['ALERT', 'WARNING'];

  function toggle(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
  }

  function apply() {
    onchange({
      substations: selectedSubstations,
      secondarySubstations: selectedSecondarySubstations,
      lines: selectedLines,
      units: selectedUnits,
      municipalities: selectedMunicipalities,
      risk: selectedRisk,
    });
  }

  function reset() {
    selectedSubstations = [];
    selectedSecondarySubstations = [];
    selectedLines = [];
    selectedUnits = [];
    selectedMunicipalities = [];
    selectedRisk = [];
    onchange({ substations: [], secondarySubstations: [], lines: [], units: [], municipalities: [], risk: [] });
    onmodechange('forecast');
    ondatechange(todayStr);
  }

  let hasFilters = $state(false);

  $effect(() => {
    hasFilters =
      mode === 'nowcasting' ||
      selectedSubstations.length + selectedSecondarySubstations.length +
      selectedLines.length + selectedUnits.length +
      selectedMunicipalities.length + selectedRisk.length > 0 ||
      (!!selectedDate && selectedDate !== todayStr);
  });
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
        <button
          class="reset-icon-btn"
          class:visible={hasFilters}
          onclick={reset}
          title={$_('filter.reset')}
          aria-label={$_('filter.reset')}
        >
          <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 8a6 6 0 1 0 1.06-3.394" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <polyline points="2,4.5 2,8 5.5,8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div class="sidebar-body">
        <!-- Mode toggle -->
        <div class="filter-group">
          <span class="filter-label">{$_('filter.mode', { default: 'Data source' })}</span>
          <div class="mode-toggle">
            <button
              class="mode-btn"
              class:active={mode === 'forecast'}
              onclick={() => onmodechange('forecast')}
            >{$_('filter.mode_forecast')}</button>
            <button
              class="mode-btn"
              class:active={mode === 'nowcasting'}
              onclick={() => onmodechange('nowcasting')}
            >{$_('filter.mode_nowcasting')}</button>
          </div>
        </div>

        <!-- Date picker (forecast only) -->
        {#if mode === 'forecast'}
        <div class="filter-group">
          <span class="filter-label">{$_('filter.date', { default: 'Date' })}</span>
          <div class="date-row">
            {#if editingDate}
              <input
                bind:this={dateInputEl}
                type="date"
                class="date-input"
                value={selectedDate}
                min={minDate}
                max={maxDate}
                onchange={commitDateEdit}
                onblur={commitDateEdit}
                onkeydown={handleDateKey}
              />
            {:else}
              <button class="date-display" onclick={startDateEdit} title="Click to pick a date">
                {fmtDate(selectedDate)}
              </button>
            {/if}
            <button
              class="quick-date-btn"
              class:active={selectedDate === todayStr}
              onclick={() => ondatechange(todayStr)}
            >{$_('filter.today')}</button>
            <button
              class="quick-date-btn"
              class:active={selectedDate === tomorrowStr}
              onclick={() => ondatechange(tomorrowStr)}
            >{$_('filter.tomorrow')}</button>
          </div>
        </div>
        {/if}

        <div class="filter-group">
          <span class="filter-label">{$_('filter.substation')}</span>
          <AutocompleteSelect options={substations} bind:selected={selectedSubstations} placeholder="Search substations…" />
        </div>

        <div class="filter-group">
          <span class="filter-label">{$_('filter.secondary_substation')}</span>
          <AutocompleteSelect options={secondarySubstations} bind:selected={selectedSecondarySubstations} placeholder="Search secondary…" />
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
          <span class="filter-label">{$_('filter.municipality')}</span>
          <AutocompleteSelect options={municipalities} bind:selected={selectedMunicipalities} placeholder="Search municipalities…" />
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
        <button class="btn-share" onclick={handleShare}>
          {#if copied}
            {$_('filter.share_copied')}
          {:else}
            {$_('filter.share')}
          {/if}
        </button>
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

  .reset-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--celine-text-muted, #94a3b8);
    border-radius: 4px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s, color 0.15s, background 0.15s;
  }

  .reset-icon-btn.visible {
    opacity: 1;
    pointer-events: auto;
  }

  .reset-icon-btn:hover {
    color: var(--celine-primary, #0d9488);
    background: var(--celine-bg-hover, #f0fdfa);
  }

  .reset-icon-btn svg {
    width: 14px;
    height: 14px;
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

  /* ── Date picker ─────────────────────────── */
  .date-row {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
  }

  .date-display {
    font-size: 0.78rem;
    font-weight: 600;
    font-family: inherit;
    color: var(--celine-text, #1e293b);
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 0.2rem 0.35rem;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    letter-spacing: 0.02em;
  }

  .date-display:hover {
    border-color: var(--celine-border, #cbd5e1);
    background: var(--celine-bg-hover, #f1f5f9);
  }

  .date-input {
    font-size: 0.75rem;
    font-weight: 600;
    font-family: inherit;
    color: var(--celine-text, #1e293b);
    background: var(--celine-bg, #f8fafc);
    border: 1px solid var(--celine-primary, #0d9488);
    border-radius: 4px;
    padding: 0.2rem 0.35rem;
    outline: none;
    max-width: 140px;
  }

  .quick-date-btn {
    font-size: 0.65rem;
    font-weight: 600;
    font-family: inherit;
    padding: 0.15rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--celine-border, #cbd5e1);
    background: none;
    color: var(--celine-text-muted, #64748b);
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .quick-date-btn:hover {
    border-color: var(--celine-primary, #0d9488);
    color: var(--celine-primary, #0d9488);
  }

  .quick-date-btn.active {
    background: var(--celine-primary, #0d9488);
    border-color: var(--celine-primary, #0d9488);
    color: #fff;
  }


  .btn-share {
    width: 100%;
    padding: 0.4rem 0.5rem;
    background: none;
    border: 1px dashed var(--celine-border, #cbd5e1);
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    color: var(--celine-text-muted, #64748b);
    text-align: center;
    transition: all 0.15s;
  }

  .btn-share:hover {
    border-color: var(--celine-primary, #0d9488);
    color: var(--celine-primary, #0d9488);
    background: var(--celine-bg-hover, #f0fdfa);
  }

  /* ── Mode toggle ────────────────────────── */
  .mode-toggle {
    display: flex;
    gap: 0;
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    overflow: hidden;
  }

  .mode-btn {
    flex: 1;
    padding: 0.3rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    font-family: inherit;
    border: none;
    background: transparent;
    color: var(--celine-text-muted, #64748b);
    cursor: pointer;
    transition: all 0.15s;
  }

  .mode-btn:not(:last-child) {
    border-right: 1px solid var(--celine-border, #e2e8f0);
  }

  .mode-btn:hover:not(.active) {
    background: var(--celine-bg-hover, #f1f5f9);
  }

  .mode-btn.active {
    background: var(--celine-primary, #0d9488);
    color: #fff;
  }
</style>
