<script lang="ts">
  import { browser } from "$app/environment";
  import type { Chart as ChartType } from "chart.js";
  import { onDestroy, onMount, tick } from "svelte";
  import { get } from "svelte/store";
  import { t, locale } from "svelte-i18n";

  type TrendItem = {
    date: string;
    production_kwh: number | null;
    consumption_kwh: number | null;
    self_consumption_kwh: number | null;
    surplus_kwh?: number | null;
  };

  interface Props {
    data: TrendItem[];
    height?: string;
    datasetLabels?: { production?: string; consumption?: string; self_consumption?: string; surplus?: string };
  }

  let { data = [], height = "280px", datasetLabels }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let chart: ChartType | null = null;
  let mounted = false;

  /** Parse YYYY-MM-DD as UTC noon — same calendar date in all timezones (UTC-12 to UTC+14) */
  function parseLocalDate(dateStr: string): Date {
    return new Date(dateStr + 'T12:00:00Z');
  }

  function formatDate(dateStr: string, loc?: string): string {
    return parseLocalDate(dateStr).toLocaleDateString(loc ?? undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateShort(dateStr: string, loc?: string): string {
    return parseLocalDate(dateStr).toLocaleDateString(loc ?? undefined, { weekday: "short" });
  }

  function destroyChart() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  async function createChart() {
    if (!browser || !canvasEl || data.length === 0 || !mounted) return;

    // Destroy any existing chart
    destroyChart();

    // Wait for DOM to update
    await tick();

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    const styles = getComputedStyle(document.documentElement);
    const productionColor =
      styles.getPropertyValue("--celine-success").trim() || "#10b981";
    const consumptionColor =
      styles.getPropertyValue("--celine-warning").trim() || "#f59e0b";
    const selfConsumptionColor =
      styles.getPropertyValue("--celine-info").trim() || "#3b82f6";
    const gridColor =
      styles.getPropertyValue("--celine-border").trim() || "rgba(0,0,0,0.06)";
    const textColor =
      styles.getPropertyValue("--celine-text-secondary").trim() || "#64748b";

    const loc = get(locale) ?? undefined;
    const labels = data.map((d) => formatDateShort(d.date, loc));
    const isMobile = window.innerWidth < 640;
    const hasSurplus = data.some((d) => d.surplus_kwh != null);

    // Double-check canvas is still available and no chart exists
    if (!canvasEl || chart) return;

    const datasets: any[] = [
      {
        label: datasetLabels?.production ?? get(t)('chart.production'),
        data: data.map((d) => d.production_kwh),
        backgroundColor: productionColor,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: datasetLabels?.consumption ?? get(t)('chart.consumption'),
        data: data.map((d) => d.consumption_kwh),
        backgroundColor: consumptionColor,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: datasetLabels?.self_consumption ?? get(t)('chart.self_consumption'),
        data: data.map((d) => d.self_consumption_kwh),
        backgroundColor: selfConsumptionColor,
        borderRadius: 4,
        borderSkipped: false,
      },
    ];

    if (hasSurplus) {
      datasets.push({
        label: datasetLabels?.surplus ?? get(t)('chart.surplus'),
        data: data.map((d) => d.surplus_kwh ?? null),
        type: "line",
        borderColor: productionColor,
        backgroundColor: productionColor + "33",
        borderWidth: 2,
        borderDash: [6, 3],
        pointRadius: 3,
        pointBackgroundColor: productionColor,
        fill: true,
        tension: 0.3,
      });
    }

    chart = new Chart(canvasEl, {
      type: "bar",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "index",
        },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              usePointStyle: true,
              pointStyle: "circle",
              padding: 16,
              color: textColor,
              font: {
                size: isMobile ? 11 : 12,
              },
            },
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            titleColor: "#f1f5f9",
            bodyColor: "#cbd5e1",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            cornerRadius: 8,
            padding: 12,
            callbacks: {
              title: (items: any[]) => {
                const idx = items[0]?.dataIndex;
                if (idx !== undefined && data[idx]) {
                  return formatDate(data[idx].date, loc);
                }
                return "";
              },
              label: (item: any) => {
                const value = item.raw as number | null;
                if (value === null || value === undefined)
                  return `${item.dataset.label}: —`;
                const fmt = Math.abs(value) >= 1000
                  ? `${(value / 1000).toFixed(2)} MWh`
                  : `${value.toFixed(1)} kWh`;
                return `${item.dataset.label}: ${fmt}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { size: isMobile ? 10 : 11 },
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: isMobile ? 10 : 11 },
              callback: (value: any) => {
                const n = Number(value);
                return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)} MWh` : `${n} kWh`;
              },
            },
          },
        },
      },
    });
  }

  onMount(() => {
    mounted = true;
    createChart();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "data-theme") {
          createChart();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => {
      mounted = false;
      observer.disconnect();
      destroyChart();
    };
  });

  onDestroy(() => {
    mounted = false;
    destroyChart();
  });

  // Only recreate when data actually changes (use JSON comparison)
  let prevDataJson = "";
  $effect(() => {
    const newDataJson = JSON.stringify(data);
    if (browser && mounted && canvasEl && newDataJson !== prevDataJson) {
      prevDataJson = newDataJson;
      createChart();
    }
  });

  // Rebuild when locale changes so axis labels are re-formatted
  let prevLocale = "";
  $effect(() => {
    const loc = $locale ?? "";
    if (browser && mounted && canvasEl && loc !== prevLocale && prevLocale !== "") {
      prevLocale = loc;
      createChart();
    } else {
      prevLocale = loc;
    }
  });
</script>

<div class="energy-chart" style:height>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .energy-chart {
    position: relative;
    width: 100%;
  }

  .energy-chart canvas {
    width: 100% !important;
  }
</style>
