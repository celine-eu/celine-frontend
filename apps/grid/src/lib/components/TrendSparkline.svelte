<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart } from 'chart.js/auto';
  import type { TrendItem } from '$lib/api';

  interface Props {
    label: string;
    unit: string;
    data: TrendItem[];
    color?: string;
  }

  let { label, unit, data, color = '#0d9488' }: Props = $props();

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function buildChart() {
    if (!canvas || !data.length) return;
    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: data.map((d) => d.date),
        datasets: [
          {
            data: data.map((d) => d.value),
            borderColor: color,
            backgroundColor: color + '22',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.formattedValue} ${unit}` } } },
        scales: {
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    });
  }

  onMount(() => {
    buildChart();
    return () => chart?.destroy();
  });

  $effect(() => {
    data;
    buildChart();
  });
</script>

<div class="sparkline-card">
  <div class="sparkline-label">{label}</div>
  <div class="sparkline-chart">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .sparkline-card {
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .sparkline-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--celine-text-muted, #64748b);
    margin-bottom: 0.5rem;
  }

  .sparkline-chart {
    height: 72px;
  }
</style>
