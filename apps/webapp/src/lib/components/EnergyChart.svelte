<script lang="ts">
  import { browser } from "$app/environment";
  import type { Chart as ChartType } from "chart.js";
  import { onDestroy, onMount, tick } from "svelte";

  type TrendItem = {
    date: string;
    production_kwh: number | null;
    consumption_kwh: number | null;
    self_consumption_kwh: number | null;
  };

  interface Props {
    data: TrendItem[];
    height?: string;
  }

  let { data = [], height = "280px" }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let chart: ChartType | null = null;
  let mounted = false;

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatDateShort(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { weekday: "short" });
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

    const labels = data.map((d) => formatDateShort(d.date));
    const isMobile = window.innerWidth < 640;

    // Double-check canvas is still available and no chart exists
    if (!canvasEl || chart) return;

    chart = new Chart(canvasEl, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Production",
            data: data.map((d) => d.production_kwh),
            backgroundColor: productionColor,
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: "Consumption",
            data: data.map((d) => d.consumption_kwh),
            backgroundColor: consumptionColor,
            borderRadius: 4,
            borderSkipped: false,
          },
          {
            label: "Self-consumption",
            data: data.map((d) => d.self_consumption_kwh),
            backgroundColor: selfConsumptionColor,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
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
                  return formatDate(data[idx].date);
                }
                return "";
              },
              label: (item: any) => {
                const value = item.raw as number | null;
                if (value === null || value === undefined)
                  return `${item.dataset.label}: —`;
                return `${item.dataset.label}: ${value.toFixed(1)} kWh`;
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
              callback: (value: any) => `${value} kWh`,
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
