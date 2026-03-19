<script lang="ts">
  import type { ForecastResponse, ForecastHourItem } from '$lib/api';
  import { Icon, Skeleton } from '@celine-eu/ui';
  import { onMount } from 'svelte';

  interface Props {
    data: ForecastResponse | null;
    loading?: boolean;
  }

  let { data, loading = false }: Props = $props();

  type Tab = 'user' | 'rec';
  let activeTab = $state<Tab>('user');

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let chartInstance: any = null;

  function activeItems(): ForecastHourItem[] {
    if (!data) return [];
    return activeTab === 'user' ? data.user_forecast : data.rec_forecast;
  }

  function fmtHour(ts: string): string {
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  }

  async function renderChart() {
    if (!canvasEl) return;
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const items = activeItems();
    if (!items.length) return;

    const now = new Date();
    const labels = items.map(i => fmtHour(i.ts));
    const values = items.map(i => i.value);
    const lowers = items.map(i => i.lower ?? i.value);
    const uppers = items.map(i => i.upper ?? i.value);

    // Find "now" index
    const nowIdx = items.findIndex(i => new Date(i.ts) >= now);

    chartInstance = new Chart(canvasEl, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Upper band',
            data: uppers,
            borderColor: 'transparent',
            backgroundColor: 'rgba(99,102,241,0.12)',
            fill: '+1',
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: activeTab === 'user' ? 'Your meter' : 'Community REC',
            data: values,
            borderColor: 'rgb(99,102,241)',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.4,
            fill: false,
          },
          {
            label: 'Lower band',
            data: lowers,
            borderColor: 'transparent',
            backgroundColor: 'rgba(99,102,241,0.12)',
            fill: '-1',
            pointRadius: 0,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: nowIdx >= 0 ? {
            annotations: {
              nowLine: {
                type: 'line',
                xMin: nowIdx,
                xMax: nowIdx,
                borderColor: 'rgba(100,100,100,0.5)',
                borderDash: [4, 4],
                borderWidth: 1,
                label: { content: 'Now', display: true, position: 'start', font: { size: 10 } },
              },
            },
          } : {},
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 12, font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: { font: { size: 10 } },
            title: { display: true, text: 'kWh', font: { size: 10 } },
          },
        },
      },
    });
  }

  $effect(() => {
    if (!loading && data && canvasEl) {
      renderChart();
    }
  });

  $effect(() => {
    // Re-render when tab changes
    activeTab;
    if (!loading && data && canvasEl) {
      renderChart();
    }
  });
</script>

<div class="forecast-card">
  <div class="tab-bar">
    <button
      class="tab-btn"
      class:active={activeTab === 'user'}
      onclick={() => activeTab = 'user'}
    >
      <Icon name="user" size={14} /> Your meter
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'rec'}
      onclick={() => activeTab = 'rec'}
    >
      <Icon name="users" size={14} /> Community REC
    </button>
  </div>

  <div class="chart-wrap">
    {#if loading}
      <Skeleton variant="rect" height="220px" />
    {:else if data}
      <canvas bind:this={canvasEl} style="height: 220px;"></canvas>
    {:else}
      <div class="empty">
        <Icon name="activity" size={32} />
        <p>No forecast data available</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .forecast-card {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  .tab-bar {
    display: flex;
    gap: 0.5rem;
    border-bottom: 1px solid var(--celine-border);
    padding-bottom: 0.5rem;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.375rem 0.75rem;
    border: 1px solid transparent;
    border-radius: var(--celine-radius-sm);
    background: none;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .tab-btn:hover {
    background: var(--celine-bg);
    color: var(--celine-text);
  }

  .tab-btn.active {
    background: var(--celine-primary-bg, rgba(99,102,241,0.1));
    color: var(--celine-primary);
    border-color: var(--celine-primary);
  }

  .chart-wrap { min-height: 220px; }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    gap: 0.5rem;
    color: var(--celine-text-tertiary);
    font-size: 0.875rem;
  }
</style>
