<script lang="ts">
  import type { ForecastResponse, ForecastHourItem } from '$lib/api';
  import { Icon, Skeleton } from '@celine-eu/ui';

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

  /** Map of label-index → net_exchange_kwh for surplus hours (value > 0) */
  function surplusMap(items: ForecastHourItem[]): Map<number, number> {
    if (!data) return new Map();
    const result = new Map<number, number>();
    if (activeTab === 'user') {
      items.forEach((item, i) => {
        if (item.value > 0) result.set(i, item.value);
      });
    } else {
      // On REC tab, look up surplus kWh from user_forecast by matching hour label
      const byHour = new Map(
        data.user_forecast.filter(i => i.value > 0).map(i => [fmtHour(i.ts), i.value])
      );
      items.forEach((item, i) => {
        const kwh = byHour.get(fmtHour(item.ts));
        if (kwh !== undefined) result.set(i, kwh);
      });
    }
    return result;
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

    const nowIdx = items.findIndex(i => new Date(i.ts) >= now);
    const surplus = surplusMap(items);

    // Inline plugin: draw surplus bars anchored at y=0, plus "Now" line
    const backgroundPlugin = {
      id: 'flexibilityBackground',
      beforeDraw(chart: any) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x || !scales.y) return;
        const tickCount = labels.length;
        if (tickCount < 2) return;
        const colWidth = (chartArea.right - chartArea.left) / tickCount;
        const y0 = scales.y.getPixelForValue(0);

        ctx.save();

        // Green bars: anchored at y=0, height = actual net_exchange_kwh value
        const gap = 1;
        ctx.fillStyle = 'rgba(34, 197, 94, 0.30)';
        for (const [idx, kwh] of surplus) {
          const x = chartArea.left + idx * colWidth + gap;
          const yTop = scales.y.getPixelForValue(kwh);
          // clamp to chart area in case the bar exceeds the visible range
          const top = Math.max(chartArea.top, yTop);
          const height = Math.max(0, y0 - top);
          ctx.fillRect(x, top, colWidth - gap * 2, height);
        }

        // "Now" vertical dashed line
        if (nowIdx >= 0) {
          const x = chartArea.left + (nowIdx + 0.5) * colWidth;
          ctx.strokeStyle = 'rgba(100,100,100,0.5)';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = 'rgba(100,100,100,0.7)';
          ctx.font = '10px sans-serif';
          ctx.fillText('Now', x + 3, chartArea.top + 12);
        }

        ctx.restore();
      },
    };

    const isUser = activeTab === 'user';
    // Colour: indigo for surplus tab, amber for consumption tab
    const lineColor = isUser ? 'rgb(99,102,241)' : 'rgb(245,158,11)';
    const bandColor = isUser ? 'rgba(99,102,241,0.12)' : 'rgba(245,158,11,0.12)';

    chartInstance = new Chart(canvasEl, {
      type: 'line',
      plugins: [backgroundPlugin],
      data: {
        labels,
        datasets: [
          {
            label: 'Upper band',
            data: uppers,
            borderColor: 'transparent',
            backgroundColor: bandColor,
            fill: '+1',
            pointRadius: 0,
            tension: 0.4,
          },
          {
            label: isUser ? 'Community solar surplus (kWh)' : 'Your consumption (kWh)',
            data: values,
            borderColor: lineColor,
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
            backgroundColor: bandColor,
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
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 12, font: { size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: { font: { size: 10 } },
            title: {
              display: true,
              text: isUser ? 'kWh surplus (+) / import (−)' : 'kWh consumed',
              font: { size: 10 },
            },
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
      ☀️ Solar surplus
    </button>
    <button
      class="tab-btn"
      class:active={activeTab === 'rec'}
      onclick={() => activeTab = 'rec'}
    >
      🏠 Your consumption
    </button>
  </div>

  {#if data}
    <div class="surplus-legend">
      <span class="surplus-swatch"></span>
      Solar surplus window
    </div>
  {/if}

  <div class="chart-wrap">
    {#if loading}
      <Skeleton variant="rect" height="220px" />
    {:else if data}
      <canvas bind:this={canvasEl} style="height: 220px;"></canvas>
    {:else}
      <div class="empty">
        <p>No forecast data available</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .forecast-card {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-sm);
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

  .surplus-legend {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
  }

  .surplus-swatch {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 2px;
    background: rgba(34, 197, 94, 0.35);
  }

  .chart-wrap { min-height: 220px; }

  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    color: var(--celine-text-tertiary);
    font-size: 0.875rem;
  }
</style>
