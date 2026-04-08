<script lang="ts">
  import { _ } from 'svelte-i18n';

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
  }: Props = $props();

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
</script>

<div class="filter-bar">
  <div class="filter-group">
    <label class="filter-label">{$_('filter.date')}</label>
    <select
      multiple
      size={Math.min(dates.length || 1, 4)}
      bind:value={selectedDates}
      class="filter-select"
    >
      {#each dates as d}
        <option value={d}>{d}</option>
      {/each}
    </select>
  </div>

  <div class="filter-group">
    <label class="filter-label">{$_('filter.substation')}</label>
    <select multiple size={Math.min(substations.length || 1, 4)} bind:value={selectedSubstations} class="filter-select">
      {#each substations as s}
        <option value={s}>{s}</option>
      {/each}
    </select>
  </div>

  <div class="filter-group">
    <label class="filter-label">{$_('filter.line')}</label>
    <select multiple size={Math.min(lines.length || 1, 4)} bind:value={selectedLines} class="filter-select">
      {#each lines as l}
        <option value={l}>{l}</option>
      {/each}
    </select>
  </div>

  <div class="filter-group">
    <label class="filter-label">{$_('filter.unit')}</label>
    <select multiple size={Math.min(units.length || 1, 4)} bind:value={selectedUnits} class="filter-select">
      {#each units as u}
        <option value={u}>{u}</option>
      {/each}
    </select>
  </div>

  <div class="filter-group">
    <label class="filter-label">{$_('filter.risk')}</label>
    <div class="risk-chips">
      {#each RISK_LEVELS as r}
        <button
          class="chip"
          class:selected={selectedRisk.includes(r)}
          onclick={() => (selectedRisk = toggle(selectedRisk, r))}
          data-risk={r.toLowerCase()}
        >
          {r}
        </button>
      {/each}
    </div>
  </div>

  <div class="filter-actions">
    <button class="btn-primary" onclick={apply}>{$_('filter.apply')}</button>
    <button class="btn-ghost" onclick={reset}>{$_('filter.reset')}</button>
  </div>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    background: var(--celine-bg-elevated, #fff);
    border-bottom: 1px solid var(--celine-border, #e2e8f0);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 130px;
  }

  .filter-label {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--celine-text-muted, #64748b);
  }

  .filter-select {
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    background: var(--celine-bg, #f8fafc);
    font-size: 0.8125rem;
    padding: 0.25rem;
    color: var(--celine-text, #1e293b);
    cursor: pointer;
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
    font-size: 0.75rem;
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

  .filter-actions {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    flex-shrink: 0;
  }

  .btn-primary {
    padding: 0.375rem 1rem;
    background: var(--celine-primary, #0d9488);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-primary:hover { filter: brightness(1.1); }

  .btn-ghost {
    padding: 0.375rem 1rem;
    background: transparent;
    color: var(--celine-text-muted, #64748b);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    font-size: 0.8125rem;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-ghost:hover {
    background: var(--celine-bg-hover, #f1f5f9);
  }
</style>
