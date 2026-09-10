<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { EnergyPoint } from '$lib/api';

  let { points }: { points: EnergyPoint[] } = $props();

  const width = 760;
  const height = 230;
  const padding = { top: 18, right: 12, bottom: 34, left: 36 };
  const maxXAxisLabels = 8;

  function showXAxisLabel(index: number): boolean {
    const lastIndex = points.length - 1;
    if (lastIndex < maxXAxisLabels) return true;

    const interval = Math.ceil(lastIndex / (maxXAxisLabels - 1));
    return index === 0 || index === lastIndex || index % interval === 0;
  }

  function coordinates(key: 'importKwh' | 'exportKwh' | 'sharedKwh'): string {
    const max = Math.max(1, ...points.flatMap((point) => [point.importKwh, point.exportKwh, point.sharedKwh]));
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    return points
      .map((point, index) => {
        const x = padding.left + (index / Math.max(1, points.length - 1)) * innerWidth;
        const y = padding.top + innerHeight - (point[key] / max) * innerHeight;
        return `${x},${y}`;
      })
      .join(' ');
  }
</script>

<div class="chart-wrap">
  {#if points.length === 0}
    <div class="empty-state"><span>∿</span><p>{$_('overview.energy_empty')}</p></div>
  {:else}
    <div class="legend" aria-hidden="true">
      <span class="import">Import</span>
      <span class="export">Export</span>
      <span class="shared">Condivisa</span>
    </div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Andamento energetico del periodo">
      {#each [0.25, 0.5, 0.75, 1] as ratio}
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + (height - padding.top - padding.bottom) * ratio}
          y2={padding.top + (height - padding.top - padding.bottom) * ratio}
          class="grid-line"
        />
      {/each}
      <polyline points={coordinates('importKwh')} class="line import-line" />
      <polyline points={coordinates('exportKwh')} class="line export-line" />
      <polyline points={coordinates('sharedKwh')} class="line shared-line" />
      {#each points as point, index}
        {#if showXAxisLabel(index)}
          <text
            x={padding.left + (index / Math.max(1, points.length - 1)) * (width - padding.left - padding.right)}
            y={height - 8}
            text-anchor="middle"
          >{point.label}</text>
        {/if}
      {/each}
    </svg>
  {/if}
</div>

<style>
  .chart-wrap {
    width: 100%;
    overflow: hidden;
  }

  .empty-state {
    min-height: 230px;
    display: grid;
    place-content: center;
    justify-items: center;
    color: var(--community-muted);
    text-align: center;
  }

  .empty-state span { color: var(--community-primary); font-size: 2rem; }
  .empty-state p { max-width: 320px; margin: 0.5rem 0 0; font-size: 0.75rem; }

  .legend {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    color: var(--community-muted);
    font-size: 0.72rem;
    font-weight: 650;
  }

  .legend span::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.35rem;
  }

  .legend .import::before { background: #94a3b8; }
  .legend .export::before { background: #f59e0b; }
  .legend .shared::before { background: var(--community-primary); }

  svg {
    display: block;
    width: 100%;
    min-width: 520px;
    margin-top: 0.5rem;
  }

  .grid-line {
    stroke: var(--community-border);
    stroke-width: 1;
    stroke-dasharray: 4 6;
  }

  .line {
    fill: none;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .import-line { stroke: #94a3b8; }
  .export-line { stroke: #f59e0b; }
  .shared-line { stroke: var(--community-primary); stroke-width: 4; }

  text {
    fill: var(--community-muted);
    font-size: 11px;
  }
</style>
