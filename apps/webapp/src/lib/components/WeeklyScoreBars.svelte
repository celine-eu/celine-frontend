<script lang="ts">
  import { browser } from '$app/environment';
  import type { FairWeeklyScore } from '$lib/api';
  import type { Chart as ChartType } from 'chart.js';
  import { get } from 'svelte/store';
  import { onDestroy, onMount, tick } from 'svelte';
  import { t, locale } from 'svelte-i18n';

  interface Props {
    data: FairWeeklyScore[];   // oldest first
    height?: string;
  }

  let { data = [], height = '160px' }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let chart: ChartType | null = null;
  let mounted = false;

  function weekLabel(weekStart: string, loc?: string): string {
    return new Date(weekStart + 'T12:00:00Z').toLocaleDateString(loc ?? undefined, { day: 'numeric', month: 'short' });
  }

  function destroyChart() {
    if (chart) { chart.destroy(); chart = null; }
  }

  async function createChart() {
    if (!browser || !canvasEl || data.length === 0 || !mounted) return;
    destroyChart();
    await tick();
    const { Chart, registerables } = await import('chart.js');
    Chart.register(...registerables);
    if (!canvasEl || chart) return;

    const styles = getComputedStyle(document.documentElement);
    const primary = styles.getPropertyValue('--celine-primary').trim() || '#0d9488';
    const gridColor = styles.getPropertyValue('--celine-border').trim() || 'rgba(0,0,0,0.06)';
    const textColor = styles.getPropertyValue('--celine-text-secondary').trim() || '#64748b';
    const loc = get(locale) ?? undefined;
    const slice = data.slice(-12);

    chart = new Chart(canvasEl, {
      type: 'bar',
      data: {
        labels: slice.map((w) => weekLabel(w.week_start, loc)),
        datasets: [
          { label: $t('gamification_fair.components.level'), data: slice.map((w) => w.level_points ?? 0), backgroundColor: primary, stack: 'w' },
          { label: $t('gamification_fair.components.growth'), data: slice.map((w) => w.growth_points ?? 0), backgroundColor: '#a78bfa', stack: 'w' },
          { label: $t('gamification_fair.components.actions'), data: slice.map((w) => w.actions_points), backgroundColor: '#f59e0b', stack: 'w' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: { legend: { display: true, labels: { color: textColor, boxWidth: 10, font: { size: 10 } } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: textColor, font: { size: 10 }, maxRotation: 0 } },
          y: { stacked: true, beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 }, precision: 0 } },
        },
      },
    });
  }

  onMount(() => {
    mounted = true;
    createChart();
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'data-theme') { createChart(); break; }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => { mounted = false; observer.disconnect(); destroyChart(); };
  });

  onDestroy(() => { mounted = false; destroyChart(); });

  let prevJson = '';
  $effect(() => {
    const json = JSON.stringify(data);
    if (browser && mounted && canvasEl && json !== prevJson) { prevJson = json; createChart(); }
  });
</script>

<div class="weekly-bars" style:height>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .weekly-bars { position: relative; width: 100%; }
  .weekly-bars canvas { width: 100% !important; }
</style>
