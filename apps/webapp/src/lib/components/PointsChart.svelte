<script lang="ts">
  import { browser } from "$app/environment";
  import type { DailyPointsItem } from "$lib/api";
  import type { Chart as ChartType } from "chart.js";
  import { get } from "svelte/store";
  import { onDestroy, onMount, tick } from "svelte";
  import { t, locale } from "svelte-i18n";

  interface Props {
    data: DailyPointsItem[];
    height?: string;
  }

  let { data = [], height = "120px" }: Props = $props();

  let canvasEl: HTMLCanvasElement | null = $state(null);
  let chart: ChartType | null = null;
  let mounted = false;

  /** Parse YYYY-MM-DD as UTC noon — same calendar date in all timezones */
  function parseDate(dateStr: string): Date {
    return new Date(dateStr + "T12:00:00Z");
  }

  function formatWeekday(dateStr: string, loc?: string): string {
    return parseDate(dateStr).toLocaleDateString(loc ?? undefined, { weekday: "short" });
  }

  function formatFull(dateStr: string, loc?: string): string {
    return parseDate(dateStr).toLocaleDateString(loc ?? undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function destroyChart() {
    if (chart) { chart.destroy(); chart = null; }
  }

  async function createChart() {
    if (!browser || !canvasEl || data.length === 0 || !mounted) return;
    destroyChart();
    await tick();

    const { Chart, registerables } = await import("chart.js");
    Chart.register(...registerables);

    const styles = getComputedStyle(document.documentElement);
    const primaryColor = styles.getPropertyValue("--celine-primary").trim() || "#0d9488";
    const gridColor   = styles.getPropertyValue("--celine-border").trim() || "rgba(0,0,0,0.06)";
    const textColor   = styles.getPropertyValue("--celine-text-secondary").trim() || "#64748b";

    if (!canvasEl || chart) return;

    const loc = get(locale) ?? undefined;

    // Last 7 days, then build running total within the window
    const slice = data.slice(-7);
    let running = 0;
    const cumulative = slice.map((d) => { running += d.points; return running; });
    const daily = slice.map((d) => d.points);

    const isMobile = window.innerWidth < 640;

    chart = new Chart(canvasEl, {
      type: "line",
      data: {
        labels: slice.map((d) => formatWeekday(d.date, loc)),
        datasets: [
          {
            label: $t("gamification.pts"),
            data: cumulative,
            borderColor: primaryColor,
            backgroundColor: primaryColor + "22",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: primaryColor,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.9)",
            titleColor: "#f1f5f9",
            bodyColor: "#cbd5e1",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              title: (items: any[]) => {
                const idx = items[0]?.dataIndex;
                return idx !== undefined && slice[idx] ? formatFull(slice[idx].date, loc) : "";
              },
              label: (item: any) => {
                const idx = item.dataIndex;
                const earned = daily[idx] ?? 0;
                const total  = cumulative[idx] ?? 0;
                const pts = $t("gamification.pts");
                return earned > 0
                  ? `+${earned} ${pts}  (${total} ${pts} this week)`
                  : `${total} ${pts} this week`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { size: isMobile ? 9 : 10 },
              maxRotation: 0,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: isMobile ? 9 : 10 },
              precision: 0,
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
      for (const m of mutations) {
        if (m.attributeName === "data-theme") { createChart(); break; }
      }
    });
    observer.observe(document.documentElement, { attributes: true });

    return () => {
      mounted = false;
      observer.disconnect();
      destroyChart();
    };
  });

  onDestroy(() => { mounted = false; destroyChart(); });

  let prevJson = "";
  $effect(() => {
    const json = JSON.stringify(data);
    if (browser && mounted && canvasEl && json !== prevJson) {
      prevJson = json;
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

<div class="points-chart" style:height>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .points-chart {
    position: relative;
    width: 100%;
  }
  .points-chart canvas {
    width: 100% !important;
  }
</style>
