<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart } from 'chart.js/auto';
  import type { AlertDistributionItem } from '$lib/api';

  interface Props {
    label: string;
    data: AlertDistributionItem[];
  }

  let { label, data }: Props = $props();

  const COLORS: Record<string, string> = {
    ALERT: '#D00000',
    WARNING: '#F7D000',
    NORMAL: '#00A000',
    RED: '#D00000',
    ORANGE: '#F7D000',
    GREEN: '#00A000',
  };

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  function buildChart() {
    if (!canvas || !data.length) return;
    chart?.destroy();
    chart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map((d) => d.risk_level),
        datasets: [
          {
            data: data.map((d) => d.events),
            backgroundColor: data.map((d) => COLORS[d.risk_level] ?? '#808080'),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 12 } },
        },
        cutout: '65%',
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

<div class="donut-card">
  <div class="donut-label">{label}</div>
  <div class="donut-chart">
    <canvas bind:this={canvas}></canvas>
  </div>
</div>

<style>
  .donut-card {
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    padding: 0.75rem;
  }

  .donut-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--celine-text-muted, #64748b);
    margin-bottom: 0.5rem;
  }

  .donut-chart {
    height: 120px;
  }
</style>
