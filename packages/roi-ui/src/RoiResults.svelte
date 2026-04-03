<script lang="ts">
  import type { ScenarioResult, CompareResponse } from './types.js';
  import { createRoiApi } from './api.js';

  interface Props {
    result: ScenarioResult;
    apiBaseUrl?: string;
    systemInput?: Record<string, unknown> | null;
    configOverrides?: Record<string, unknown> | null;
  }

  let { result, apiBaseUrl = '/api', systemInput = null, configOverrides = null }: Props = $props();

  const api = $derived(createRoiApi(apiBaseUrl));

  // ── Report download ───────────────────────────────────────────────────────
  function downloadReport() {
    const s = result.summary;
    const e = result.energy;
    const f = result.finance;
    const inc = result.incentives;

    const lines: string[] = [
      '# CELINE ROI — Report',
      '',
      `| KPI | Value |`,
      `|-----|-------|`,
      `| NPV (25yr) | ${formatEur(s.npv_eur)} |`,
      `| IRR | ${formatNum(s.irr_pct)}% |`,
      `| Simple payback | ${formatNum(s.payback_simple_years)} years |`,
      `| Discounted payback | ${formatNum(s.payback_discounted_years)} years |`,
      `| Annual production | ${formatNum(s.annual_production_kwh, 0)} kWh |`,
      `| Self-consumption | ${formatNum(s.tasso_autoconsumo_pct)}% |`,
      '',
      '## 25-Year Cashflow',
      '',
      '| Year | Annual CF | Cumulative |',
      '|-----:|----------:|-----------:|',
    ];
    for (let y = 0; y < f.cashflows.length; y++) {
      lines.push(`| ${y} | ${formatEur(f.cashflows[y])} | ${formatEur(f.cumulative[y])} |`);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'celine-roi-report.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Quick scenario comparison ─────────────────────────────────────────────
  let compareResult: CompareResponse | null = $state(null);
  let compareLoading = $state(false);
  let compareError = $state('');

  async function runQuickCompare() {
    compareLoading = true;
    compareError = '';
    compareResult = null;
    try {
      // Use actual system input from the calculation
      const sys = systemInput ?? {
        kwp: result.production.effective_kwp ?? 10,
        latitude: 45.9,
        longitude: 11.3,
        capex: 15000,
        annual_consumption_kwh: 5000,
        regime: 'RID' as const,
        equity_fraction: 1.0,
      };
      const currentRegime = (sys.regime as string) ?? 'RID';
      const scenarios: Record<string, Record<string, unknown>> = {
        'Scenario attuale': {},
      };
      if (currentRegime !== 'RID_CER') {
        scenarios['RID + CER'] = { regime: 'RID_CER' };
      }
      if (currentRegime !== 'RID') {
        scenarios['Solo RID'] = { regime: 'RID' };
      }
      scenarios['Con pompa di calore'] = { heat_pump_kwh_annual: 3500 };
      compareResult = await api.compareScenarios(sys, scenarios, configOverrides as Record<string, unknown> | undefined);
    } catch (e) {
      compareError = e instanceof Error ? e.message : 'Comparison failed';
    } finally {
      compareLoading = false;
    }
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // ── Monthly production ──────────────────────────────────────────────────────
  const monthly = $derived(result.production.monthly_production_kwh);
  const maxMonthly = $derived(Math.max(...monthly, 1));
  const hasMonthlyEnergy = $derived(result.energy.consumption.length === 12);

  let hoveredBar: number | null = $state(null);
  let showMonthlyTable = $state(false);

  // ── Cashflow chart ──────────────────────────────────────────────────────────
  const cfData = $derived(result.finance.cumulative);
  const cfAnnual = $derived(result.finance.cashflows);
  const cfMin = $derived(Math.min(...cfData, 0));
  const cfMax = $derived(Math.max(...cfData, 0));
  const cfRange = $derived((cfMax - cfMin) || 1);

  // SVG dimensions and chart area
  const SVG_W = 400, SVG_H = 140;
  const CF_L = 64, CF_R = 330, CF_T = 8, CF_B = 110;
  const CF_W = CF_R - CF_L, CF_H = CF_B - CF_T;

  function cfXPos(i: number): number {
    const n = cfData.length;
    return n > 1 ? CF_L + (i / (n - 1)) * CF_W : CF_L;
  }

  function cfYPos(v: number): number {
    return CF_T + ((cfMax - v) / cfRange) * CF_H;
  }

  const cfZeroY = $derived(cfYPos(0));

  const cfPolyline = $derived(
    cfData.map((v, i) => `${cfXPos(i).toFixed(1)},${cfYPos(v).toFixed(1)}`).join(' ')
  );

  const cfAreaPoints = $derived(
    `${cfXPos(0).toFixed(1)},${cfZeroY.toFixed(1)} ${cfPolyline} ${cfXPos(cfData.length - 1).toFixed(1)},${cfZeroY.toFixed(1)}`
  );

  // 5-year tick positions for X axis
  const cfXTicks = $derived.by(() => {
    const n = cfData.length;
    const ticks: Array<{ x: number; label: string }> = [];
    for (let y = 0; y < n; y += 5) ticks.push({ x: cfXPos(y), label: `Y${y}` });
    if ((n - 1) % 5 !== 0) ticks.push({ x: cfXPos(n - 1), label: `Y${n - 1}` });
    return ticks;
  });

  // 5-year summary rows for table
  const cfSummaryRows = $derived.by(() => {
    const rows: Array<{ year: number; cashflow: number; cumulative: number }> = [];
    for (let y = 0; y < cfData.length; y++) {
      if (y === 0 || y % 5 === 0 || y === cfData.length - 1) {
        rows.push({ year: y, cashflow: cfAnnual[y] ?? 0, cumulative: cfData[y] });
      }
    }
    // Deduplicate last entry if already included
    return rows.filter((r, i) => i === 0 || r.year !== rows[i - 1].year);
  });

  // Hover interaction on cashflow chart
  let hoveredCfIdx: number | null = $state(null);
  let cfTooltip: { x: number; y: number } | null = $state(null);
  let cfSvgEl: SVGSVGElement | undefined;
  let showCfTable = $state(false);

  function handleCfMouseMove(e: MouseEvent) {
    if (!cfSvgEl) return;
    const pt = cfSvgEl.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = cfSvgEl.getScreenCTM();
    if (!ctm) return;
    const svgPt = pt.matrixTransform(ctm.inverse());

    if (svgPt.x < CF_L || svgPt.x > CF_R) {
      hoveredCfIdx = null;
      cfTooltip = null;
      return;
    }

    const n = cfData.length;
    const frac = (svgPt.x - CF_L) / CF_W;
    hoveredCfIdx = Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))));

    const containerEl = cfSvgEl.parentElement;
    if (!containerEl) return;
    const cRect = containerEl.getBoundingClientRect();
    cfTooltip = {
      x: e.clientX - cRect.left,
      y: e.clientY - cRect.top - 72,
    };
  }

  function handleCfMouseLeave() {
    hoveredCfIdx = null;
    cfTooltip = null;
  }

  // ── Formatters ──────────────────────────────────────────────────────────────
  function formatEur(v: number | null | undefined): string {
    if (v == null || !isFinite(v)) return '∞';
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(v);
  }

  function formatEurCompact(v: number): string {
    if (!isFinite(v)) return '∞';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(0)}k`;
    return `${sign}€${abs.toFixed(0)}`;
  }

  function formatNum(v: number | null | undefined, decimals = 1): string {
    if (v == null || !isFinite(v)) return '∞';
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: decimals }).format(v);
  }

  function abbrevKwh(v: number): string {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
  }
</script>

<div class="results">
  <!-- Validation alerts -->
  {#if result.validation.fails.length > 0}
    <div class="alert alert-error" role="alert">
      <strong>Validation issues:</strong>
      <ul>
        {#each result.validation.fails as fail}
          <li>{fail.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if result.validation.warns.length > 0}
    <div class="alert alert-warn" role="alert">
      <strong>Warnings:</strong>
      <ul>
        {#each result.validation.warns as warn}
          <li>{warn.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- KPI grid -->
  <div class="kpi-grid">
    <div class="kpi kpi-highlight">
      <div class="kpi-label">Net Present Value (25 yr)</div>
      <div
        class="kpi-value"
        class:positive={result.summary.npv_eur >= 0}
        class:negative={result.summary.npv_eur < 0}
      >
        {formatEur(result.summary.npv_eur)}
      </div>
    </div>

    <div class="kpi">
      <div class="kpi-label">Internal Rate of Return</div>
      <div class="kpi-value">{formatNum(result.summary.irr_pct)}%</div>
    </div>

    <div class="kpi">
      <div class="kpi-label">Simple payback</div>
      <div class="kpi-value">{formatNum(result.summary.payback_simple_years)} yrs</div>
    </div>

    <div class="kpi">
      <div class="kpi-label">Discounted payback</div>
      <div class="kpi-value">{formatNum(result.summary.payback_discounted_years)} yrs</div>
    </div>

    <div class="kpi">
      <div class="kpi-label">Annual production</div>
      <div class="kpi-value">{formatNum(result.summary.annual_production_kwh, 0)} kWh</div>
      {#if result.production.effective_kwp}
        <div class="kpi-sub">LIDAR est. {result.production.effective_kwp.toFixed(1)} kWp</div>
      {/if}
    </div>

    <div class="kpi">
      <div class="kpi-label">Self-consumption ratio</div>
      <div class="kpi-value">{formatNum(result.summary.tasso_autoconsumo_pct)}%</div>
      <div class="kpi-sub">Source: {result.summary.source}</div>
    </div>
  </div>

  <!-- CER incentive split -->
  {#if result.incentives.cer_tip_libero && result.incentives.cer_tip_libero[0] > 0}
    {@const tipTotal = result.incentives.cer_tip[0]}
    {@const tipLibero = result.incentives.cer_tip_libero[0]}
    {@const tipVincolato = result.incentives.cer_tip_vincolato[0]}
    {@const cacvLibero = result.incentives.cer_cacv_libero[0]}
    {@const cacvVincolato = result.incentives.cer_cacv_vincolato[0]}
    {@const totalLibero = tipLibero + cacvLibero}
    {@const totalVincolato = tipVincolato + cacvVincolato}
    <div class="cer-split">
      <h3 class="chart-title">CER incentive split (Year 1)</h3>
      <p class="cer-hint">
        55% of the CER incentive is freely available to the producer (libero).
        45% must be distributed to CER members (vincolato).
        Only the libero portion enters the cashflow above.
      </p>
      <div class="cer-grid">
        <div class="cer-card">
          <div class="cer-label">Libero (producer)</div>
          <div class="cer-value positive">{formatEur(totalLibero)}/yr</div>
        </div>
        <div class="cer-card">
          <div class="cer-label">Vincolato (CER members)</div>
          <div class="cer-value">{formatEur(totalVincolato)}/yr</div>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Monthly production chart ────────────────────────────────────────── -->
  <div class="chart-block">
    <div class="chart-header">
      <h3 class="chart-title">Monthly production</h3>
      <button class="btn-link" onclick={() => (showMonthlyTable = !showMonthlyTable)}>
        {showMonthlyTable ? 'Hide table' : 'Show table'}
      </button>
    </div>

    <!-- Hover info bar -->
    <div class="chart-infobar" aria-live="polite">
      {#if hoveredBar !== null}
        <strong>{MONTHS_FULL[hoveredBar]}:</strong>
        {formatNum(monthly[hoveredBar], 0)} kWh produced
        {#if hasMonthlyEnergy && result.energy.autoconsumo.length === 12}
          · {formatNum(result.energy.autoconsumo[hoveredBar], 0)} kWh self-consumed
          · {formatNum(result.energy.immissione[hoveredBar], 0)} kWh exported to grid
        {/if}
      {:else}
        <span class="info-hint">Hover over a month for details</span>
      {/if}
    </div>

    <!-- Bar chart -->
    <div class="bar-chart">
      {#each monthly as val, i}
        {@const pct = (val / maxMonthly) * 100}
        <div
          class="bar-wrap"
          class:bar-hovered={hoveredBar === i}
          role="img"
          aria-label="{MONTHS_FULL[i]}: {formatNum(val, 0)} kWh"
          onmouseenter={() => (hoveredBar = i)}
          onmouseleave={() => (hoveredBar = null)}
        >
          <span class="bar-value">{abbrevKwh(val)}</span>
          <div class="bar" style="height: {pct}%"></div>
          <span class="bar-label">{MONTHS[i]}</span>
        </div>
      {/each}
    </div>

    <!-- Monthly table (collapsible) -->
    {#if showMonthlyTable}
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Production (kWh)</th>
              {#if hasMonthlyEnergy && result.energy.consumption.length === 12}
                <th>Consumption (kWh)</th>
                <th>Self-consumed (kWh)</th>
                <th>Exported (kWh)</th>
              {/if}
            </tr>
          </thead>
          <tbody>
            {#each monthly as val, i}
              <tr>
                <td>{MONTHS_FULL[i]}</td>
                <td class="num">{formatNum(val, 0)}</td>
                {#if hasMonthlyEnergy && result.energy.consumption.length === 12}
                  <td class="num">{formatNum(result.energy.consumption[i], 0)}</td>
                  <td class="num">{formatNum(result.energy.autoconsumo[i], 0)}</td>
                  <td class="num">{formatNum(result.energy.immissione[i], 0)}</td>
                {/if}
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              <td class="num"><strong>{formatNum(result.production.annual_production_kwh, 0)}</strong></td>
              {#if hasMonthlyEnergy && result.energy.consumption.length === 12}
                <td class="num"><strong>{formatNum(monthly.reduce((a, _, i) => a + result.energy.consumption[i], 0), 0)}</strong></td>
                <td class="num"><strong>{formatNum(monthly.reduce((a, _, i) => a + result.energy.autoconsumo[i], 0), 0)}</strong></td>
                <td class="num"><strong>{formatNum(monthly.reduce((a, _, i) => a + result.energy.immissione[i], 0), 0)}</strong></td>
              {/if}
            </tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </div>

  <!-- ── 25-year cashflow chart ──────────────────────────────────────────── -->
  <div class="chart-block">
    <div class="chart-header">
      <h3 class="chart-title">25-year cumulative cashflow</h3>
      <button class="btn-link" onclick={() => (showCfTable = !showCfTable)}>
        {showCfTable ? 'Hide table' : 'Show table'}
      </button>
    </div>

    <!-- Hover info bar for cashflow -->
    <div class="chart-infobar" aria-live="polite">
      {#if hoveredCfIdx !== null}
        <strong>Year {hoveredCfIdx}:</strong>
        Annual cashflow {formatEur(cfAnnual[hoveredCfIdx] ?? 0)}
        · Cumulative {formatEur(cfData[hoveredCfIdx])}
      {:else}
        <span class="info-hint">Hover over the chart to see year-by-year figures</span>
      {/if}
    </div>

    <!-- SVG chart container -->
    <div class="cf-container">
      <svg
        bind:this={cfSvgEl}
        class="cf-svg"
        viewBox="0 0 {SVG_W} {SVG_H}"
        role="img"
        aria-label="25-year cumulative cashflow chart"
        onmousemove={handleCfMouseMove}
        onmouseleave={handleCfMouseLeave}
      >
        <title>25-year cumulative cashflow</title>

        <!-- Horizontal grid lines at cfMin, 0, cfMax -->
        {#if cfMin < -100}
          <line
            x1={CF_L} y1={cfYPos(cfMin)}
            x2={CF_R} y2={cfYPos(cfMin)}
            stroke="var(--celine-border)" stroke-width="0.5" stroke-dasharray="3,3"
          />
        {/if}
        {#if cfMax > 100}
          <line
            x1={CF_L} y1={cfYPos(cfMax)}
            x2={CF_R} y2={cfYPos(cfMax)}
            stroke="var(--celine-border)" stroke-width="0.5" stroke-dasharray="3,3"
          />
        {/if}

        <!-- Vertical grid lines at 5-year intervals -->
        {#each cfXTicks as tick}
          <line
            x1={tick.x} y1={CF_T}
            x2={tick.x} y2={CF_B}
            stroke="var(--celine-border)" stroke-width="0.5" stroke-dasharray="3,3"
          />
        {/each}

        <!-- Area fill -->
        <polygon points={cfAreaPoints} class="cf-area" />

        <!-- Polyline -->
        <polyline points={cfPolyline} class="cf-line" />

        <!-- Break-even line (prominent) -->
        <line
          x1={CF_L} y1={cfZeroY}
          x2={CF_R} y2={cfZeroY}
          stroke="var(--celine-success)" stroke-width="1"
          stroke-dasharray="4,3"
          opacity="0.8"
        />
        <text
          class="axis-label"
          x={CF_R + 2}
          y={cfZeroY + 3}
          text-anchor="start"
          fill="var(--celine-success)"
          font-size="6.5"
          font-weight="600"
        >Break-even</text>

        <!-- Y-axis labels -->
        {#if cfMin < -100}
          <text
            class="axis-label"
            x={CF_L - 4}
            y={cfYPos(cfMin) + 3}
            text-anchor="end"
          >{formatEurCompact(cfMin)}</text>
        {/if}
        <text
          class="axis-label"
          x={CF_L - 4}
          y={cfZeroY + 3}
          text-anchor="end"
        >0</text>
        {#if cfMax > 100}
          <text
            class="axis-label"
            x={CF_L - 4}
            y={cfYPos(cfMax) + 3}
            text-anchor="end"
          >{formatEurCompact(cfMax)}</text>
        {/if}

        <!-- X-axis labels -->
        {#each cfXTicks as tick}
          <text
            class="axis-label"
            x={tick.x}
            y={SVG_H - 2}
            text-anchor="middle"
          >{tick.label}</text>
        {/each}

        <!-- Hover crosshair and dot -->
        {#if hoveredCfIdx !== null}
          {@const hx = cfXPos(hoveredCfIdx)}
          {@const hy = cfYPos(cfData[hoveredCfIdx])}
          <line
            x1={hx} y1={CF_T}
            x2={hx} y2={CF_B}
            stroke="var(--celine-primary)" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"
          />
          <circle cx={hx} cy={hy} r="4" class="cf-dot" />
        {/if}
      </svg>

      <!-- HTML tooltip overlay -->
      {#if hoveredCfIdx !== null && cfTooltip}
        <div
          class="cf-tooltip"
          style="left: {Math.min(cfTooltip.x, 200)}px; top: {Math.max(cfTooltip.y, 4)}px"
        >
          <div class="cf-tooltip-year">Year {hoveredCfIdx}</div>
          <div>Annual: {formatEur(cfAnnual[hoveredCfIdx] ?? 0)}</div>
          <div>Cumulative: <strong>{formatEur(cfData[hoveredCfIdx])}</strong></div>
        </div>
      {/if}
    </div>

    <!-- 5-year summary table -->
    {#if showCfTable}
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Annual cashflow</th>
              <th>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {#each cfSummaryRows as row}
              <tr class:row-positive={row.cumulative >= 0} class:row-negative={row.cumulative < 0}>
                <td>{row.year}</td>
                <td class="num">{formatEur(row.cashflow)}</td>
                <td class="num">
                  <strong class:positive={row.cumulative >= 0} class:negative={row.cumulative < 0}>
                    {formatEur(row.cumulative)}
                  </strong>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- ── Actions: Export + Compare ──────────────────────────────────────── -->
  <div class="actions-row">
    <button class="btn-action" onclick={downloadReport}>
      📄 Download report (.md)
    </button>
    <button class="btn-action btn-action-secondary" onclick={runQuickCompare} disabled={compareLoading}>
      {compareLoading ? 'Comparing...' : '⚡ Quick compare (CER / RID / Heat Pump)'}
    </button>
  </div>

  {#if compareError}
    <div class="alert alert-error" role="alert">
      <strong>Compare error:</strong> {compareError}
    </div>
  {/if}

  {#if compareResult}
    {@const compareNames = Object.keys(compareResult.scenarios)}
    {@const compareKpis = [
      { key: 'npv', label: 'VAN (25 anni)', fmt: (s: ScenarioResult) => formatEur(s.finance.npv), cls: (s: ScenarioResult) => s.finance.npv >= 0 ? 'positive' : 'negative' },
      { key: 'irr', label: 'TIR', fmt: (s: ScenarioResult) => formatNum(s.finance.irr * 100) + '%', cls: () => '' },
      { key: 'payback', label: 'Payback semplice', fmt: (s: ScenarioResult) => formatNum(s.finance.payback_simple) + ' anni', cls: () => '' },
      { key: 'payback_d', label: 'Payback attualizzato', fmt: (s: ScenarioResult) => formatNum(s.finance.payback_discounted) + ' anni', cls: () => '' },
      { key: 'autoconsumo', label: 'Autoconsumo', fmt: (s: ScenarioResult) => formatNum(s.energy.tasso_autoconsumo * 100) + '%', cls: () => '' },
      { key: 'prod', label: 'Produzione anno 1', fmt: (s: ScenarioResult) => formatNum(s.summary.annual_production_kwh, 0) + ' kWh', cls: () => '' },
      { key: 'cer', label: 'CER libero anno 1', fmt: (s: ScenarioResult) => formatEur((s.incentives.cer_tip_libero?.[0] ?? 0) + (s.incentives.cer_cacv_libero?.[0] ?? 0)), cls: () => '' },
      { key: 'cum', label: 'Utile cumulato (25 anni)', fmt: (s: ScenarioResult) => formatEur(s.finance.cumulative[s.finance.cumulative.length - 1]), cls: (s: ScenarioResult) => s.finance.cumulative[s.finance.cumulative.length - 1] >= 0 ? 'positive' : 'negative' },
    ]}
    <div class="chart-block">
      <h3 class="chart-title">Confronto scenari</h3>
      <div class="compare-table-wrap">
        <table class="data-table compare-table">
          <thead>
            <tr>
              <th>KPI</th>
              {#each compareNames as name}
                <th class="num">{name}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each compareKpis as kpi}
              <tr>
                <td class="kpi-name">{kpi.label}</td>
                {#each compareNames as name}
                  {@const scenario = compareResult.scenarios[name]}
                  <td class="num {kpi.cls(scenario)}">{kpi.fmt(scenario)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  {/if}
</div>

<style>
  .results {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Alerts ── */
  .alert {
    padding: 0.75rem 1rem;
    border-radius: var(--celine-radius-sm);
    font-size: 0.875rem;
  }

  .alert ul {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
  }

  .alert-error {
    background: var(--celine-danger-bg);
    border: 1px solid var(--celine-danger);
    color: var(--celine-danger-text);
  }

  .alert-warn {
    background: var(--celine-warning-bg);
    border: 1px solid var(--celine-warning);
    color: var(--celine-warning-text);
  }

  /* ── KPI grid ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  .kpi {
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    padding: 0.75rem 1rem;
  }

  .kpi-highlight {
    background: var(--celine-primary-light);
    border-color: var(--celine-primary);
  }

  .kpi-label {
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
    margin-bottom: 0.25rem;
  }

  .kpi-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--celine-text);
    line-height: 1.2;
  }

  .kpi-value.positive {
    color: var(--celine-success);
  }

  .kpi-value.negative {
    color: var(--celine-danger);
  }

  .kpi-sub {
    font-size: 0.6875rem;
    color: var(--celine-text-tertiary);
    margin-top: 0.125rem;
    text-transform: capitalize;
  }

  /* ── Chart blocks ── */
  .chart-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .chart-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--celine-text);
    margin: 0;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--celine-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
  }

  .btn-link:hover {
    text-decoration: underline;
  }

  .chart-infobar {
    font-size: 0.8125rem;
    color: var(--celine-text);
    background: var(--celine-bg-sunken);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    padding: 0.375rem 0.75rem;
    min-height: 2rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .info-hint {
    color: var(--celine-text-tertiary);
    font-style: italic;
  }

  /* ── Bar chart ── */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 120px;
  }

  .bar-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    cursor: default;
    position: relative;
  }

  .bar-value {
    font-size: 0.5625rem;
    color: var(--celine-text-tertiary);
    margin-bottom: 1px;
    transition: color var(--celine-transition-fast);
  }

  .bar-wrap.bar-hovered .bar-value {
    color: var(--celine-primary);
    font-weight: 600;
  }

  .bar {
    width: 100%;
    background: var(--celine-primary);
    border-radius: 2px 2px 0 0;
    min-height: 2px;
    margin-top: auto;
    opacity: 0.75;
    transition: opacity var(--celine-transition-fast);
  }

  .bar-wrap.bar-hovered .bar {
    opacity: 1;
  }

  .bar-label {
    font-size: 0.5625rem;
    color: var(--celine-text-tertiary);
    margin-top: 3px;
  }

  /* ── Cashflow SVG ── */
  .cf-container {
    position: relative;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
  }

  .cf-svg {
    width: 100%;
    aspect-ratio: 400 / 140;
    display: block;
    cursor: crosshair;
  }

  :global(.cf-area) {
    fill: var(--celine-primary-light);
  }

  :global(.cf-line) {
    fill: none;
    stroke: var(--celine-primary);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  :global(.cf-dot) {
    fill: var(--celine-primary);
    stroke: var(--celine-bg-elevated);
    stroke-width: 1.5;
  }

  :global(.axis-label) {
    font-size: 7px;
    fill: var(--celine-text-tertiary);
    font-family: inherit;
  }

  .cf-tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border-strong);
    box-shadow: var(--celine-shadow-md);
    border-radius: var(--celine-radius-sm);
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    color: var(--celine-text);
    white-space: nowrap;
    z-index: 10;
  }

  .cf-tooltip-year {
    font-weight: 600;
    margin-bottom: 0.125rem;
    color: var(--celine-primary);
  }

  /* ── Data table ── */
  .data-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
    color: var(--celine-text);
  }

  .data-table th {
    background: var(--celine-bg-sunken);
    padding: 0.4375rem 0.75rem;
    text-align: left;
    font-weight: 600;
    border-bottom: 1px solid var(--celine-border);
    white-space: nowrap;
    color: var(--celine-text-secondary);
    font-size: 0.75rem;
  }

  .data-table td {
    padding: 0.375rem 0.75rem;
    border-bottom: 1px solid var(--celine-border);
  }

  .data-table tbody tr:last-child td,
  .data-table tfoot td {
    border-bottom: none;
  }

  .data-table tfoot td {
    background: var(--celine-bg-sunken);
    border-top: 1px solid var(--celine-border);
  }

  .data-table tr:hover td {
    background: var(--celine-bg-hover);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    font-size: 0.8125rem;
  }

  .positive {
    color: var(--celine-success);
  }

  .negative {
    color: var(--celine-danger);
  }

  /* ── Actions row ── */
  .actions-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 1rem;
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    border: none;
    border-radius: var(--celine-radius-sm);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background var(--celine-transition-fast);
  }

  .btn-action:hover:not(:disabled) {
    background: var(--celine-primary-hover);
  }

  .btn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-action-secondary {
    background: var(--celine-bg-elevated);
    color: var(--celine-text);
    border: 1px solid var(--celine-border);
  }

  .btn-action-secondary:hover:not(:disabled) {
    background: var(--celine-bg-sunken);
  }

  .compare-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
  }

  .compare-table th.num {
    text-align: right;
  }

  .kpi-name {
    font-weight: 500;
    white-space: nowrap;
  }

  /* ── CER split ── */
  .cer-split {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .cer-hint {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
    margin: 0;
    line-height: 1.4;
  }

  .cer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .cer-card {
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    padding: 0.625rem 0.875rem;
  }

  .cer-label {
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
    margin-bottom: 0.25rem;
  }

  .cer-value {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--celine-text);
  }
</style>
