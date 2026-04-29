<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { ScenarioResult, CompareResponse } from './types.js';
  import { createRoiApi } from './api.js';
  // @ts-ignore — no type declarations for qrcode-svg
  import QRCode from 'qrcode-svg';

  interface Props {
    result: ScenarioResult;
    apiBaseUrl?: string;
    systemInput?: Record<string, unknown> | null;
    configOverrides?: Record<string, unknown> | null;
    shareUrl?: string;
  }

  let { result, apiBaseUrl = '/api', systemInput = null, configOverrides = null, shareUrl = '' }: Props = $props();

  const api = $derived(createRoiApi(apiBaseUrl));

  // ── Download PDF (ghost-view approach) ──────────────────────────────────────
  let resultsEl: HTMLDivElement;
  let pdfBusy = $state(false);

  function ss(el: HTMLElement, styles: Record<string, string>) {
    for (const [k, v] of Object.entries(styles)) el.style.setProperty(k, v, 'important');
  }

  function hide(root: HTMLElement, selector: string) {
    for (const el of root.querySelectorAll(selector)) ss(el as HTMLElement, { display: 'none' });
  }

  function applyPdfStyles(ghost: HTMLElement) {
    // Location + QR are extracted to wrapper before this runs; clean up any leftovers
    ghost.querySelector('.print-qr')?.remove();
    ghost.querySelector('.print-location')?.remove();

    // ── Hide interactive-only elements ──
    hide(ghost, '.actions-row, .chart-infobar, .btn-link, .cf-tooltip');

    // ── Hide monthly data table (chart is sufficient) ──
    const barChart = ghost.querySelector('.bar-chart');
    if (barChart) {
      let next = barChart.nextElementSibling;
      while (next) {
        if (next.classList.contains('data-table-wrap')) { ss(next as HTMLElement, { display: 'none' }); break; }
        next = next.nextElementSibling;
      }
    }

    // ── Cashflow: chart + table side-by-side 60/40 ──
    const cfRow = ghost.querySelector('.cf-row') as HTMLElement | null;
    if (cfRow) ss(cfRow, { display: 'flex', 'flex-direction': 'row', gap: '0.75rem', 'align-items': 'stretch' });
    const cfContainer = ghost.querySelector('.cf-container') as HTMLElement | null;
    if (cfContainer) ss(cfContainer, { flex: '0 0 58%', 'border-color': '#ccc', display: 'flex' });
    const cfSvg = ghost.querySelector('.cf-svg') as HTMLElement | null;
    if (cfSvg) ss(cfSvg, { width: '100%', height: '100%', 'aspect-ratio': 'auto' });
    const cfTable = ghost.querySelector('.cf-table-wrap') as HTMLElement | null;
    if (cfTable) ss(cfTable, { flex: '1', 'min-width': '0' });

    // ── Force print-safe colors ──
    ss(ghost, { gap: '1rem', color: '#1a1a1a' });
    for (const el of ghost.querySelectorAll('.kpi-label, .cer-label, .cer-hint')) ss(el as HTMLElement, { color: '#555' });
    for (const el of ghost.querySelectorAll('.kpi-value, .chart-title, .cer-value, .data-table, .num')) ss(el as HTMLElement, { color: '#1a1a1a' });
    for (const el of ghost.querySelectorAll('.kpi-sub')) ss(el as HTMLElement, { color: '#666' });
    for (const el of ghost.querySelectorAll('.kpi')) ss(el as HTMLElement, { border: '1px solid #ccc', background: '#f9f9f9' });
    for (const el of ghost.querySelectorAll('.kpi-highlight')) ss(el as HTMLElement, { background: '#eef4ff', 'border-color': '#6366f1' });
    for (const el of ghost.querySelectorAll('.bar')) ss(el as HTMLElement, { background: '#4f46e5', opacity: '1' });
    for (const el of ghost.querySelectorAll('.bar-chart')) ss(el as HTMLElement, { height: '80px' });
    for (const el of ghost.querySelectorAll('.bar-value, .bar-label')) ss(el as HTMLElement, { color: '#333' });
    for (const el of ghost.querySelectorAll('.positive')) ss(el as HTMLElement, { color: '#16a34a' });
    for (const el of ghost.querySelectorAll('.negative')) ss(el as HTMLElement, { color: '#dc2626' });
    for (const el of ghost.querySelectorAll('.cer-card')) ss(el as HTMLElement, { 'border-color': '#ccc', background: '#fafafa' });
    for (const el of ghost.querySelectorAll('.data-table-wrap, .compare-table-wrap')) ss(el as HTMLElement, { overflow: 'visible', 'border-color': '#ccc' });
    for (const el of ghost.querySelectorAll('.data-table')) ss(el as HTMLElement, { 'font-size': '0.7rem' });
    for (const el of ghost.querySelectorAll('.data-table th')) ss(el as HTMLElement, { background: '#f5f5f5', color: '#333' });
    for (const el of ghost.querySelectorAll('.data-table td')) ss(el as HTMLElement, { color: '#1a1a1a' });
    for (const el of ghost.querySelectorAll('.data-table tfoot td')) ss(el as HTMLElement, { background: '#f5f5f5' });
    for (const el of ghost.querySelectorAll('.disclaimer')) ss(el as HTMLElement, { 'border-top': '1px solid #ccc' });
    for (const el of ghost.querySelectorAll('.disclaimer p')) ss(el as HTMLElement, { color: '#555' });

    // SVG elements (fill/stroke set as attributes since html2canvas reads them)
    for (const el of ghost.querySelectorAll('.cf-area')) el.setAttribute('fill', '#dbeafe');
    for (const el of ghost.querySelectorAll('.cf-line')) { el.setAttribute('stroke', '#4f46e5'); el.removeAttribute('fill'); }
    for (const el of ghost.querySelectorAll('.axis-label')) el.setAttribute('fill', '#555');
  }

  function buildInputSummary(): HTMLElement {
    const sys = systemInput ?? {};
    const overrides = (configOverrides ?? {}) as Record<string, unknown>;

    const fmtNum = (v: unknown, d = 0) =>
      typeof v === 'number' ? new Intl.NumberFormat('it-IT', { maximumFractionDigits: d }).format(v) : '–';

    const userTypeLabels: Record<string, string> = {
      residential: $t('fields.userTypeResidential'),
      commercial: $t('fields.userTypeCommercial'),
      office: $t('fields.userTypeOffice'),
      industrial: $t('fields.userTypeIndustrial'),
      agricultural: $t('fields.userTypeAgricultural'),
    };
    const regimeLabels: Record<string, string> = {
      RID_CER: $t('fields.regimeRidCer'),
      RID: $t('fields.regimeRid'),
      CER: $t('fields.regimeCer'),
    };
    const profileLabels: Record<string, string> = {
      'residential_default.json': $t('fields.profileResidential'),
      'commercial_default.json': $t('fields.profileCommercial'),
      'industrial_default.json': $t('fields.profileIndustrial'),
      'residential_heat_pump.json': $t('fields.profileHeatPump'),
      'personal_manual': $t('fields.profilePersonalManual'),
      'personal_meter': $t('fields.profilePersonalMeter'),
    };

    // System size: show effective kWp or "Auto-estimate" if kwp=0
    const kwpRaw = sys.kwp as number | undefined;
    const kwpEffective = result.production.effective_kwp;
    let kwpValue: string;
    if (kwpRaw === 0 || kwpRaw == null) {
      kwpValue = kwpEffective ? `${fmtNum(kwpEffective, 1)} kWp (LIDAR)` : $t('fields.autoEstimateKwp');
    } else {
      kwpValue = `${fmtNum(kwpRaw, 1)} kWp`;
    }

    const profile = (overrides.load_profile as string) ?? 'residential_default.json';

    const items: Array<[string, string]> = [
      [$t('fields.installationCost'), `${fmtNum(sys.capex)} €`],
      [$t('fields.annualConsumption'), `${fmtNum(sys.annual_consumption_kwh)} kWh`],
      [$t('fields.userType'), userTypeLabels[sys.user_type as string] ?? (sys.user_type as string) ?? '–'],
      [$t('fields.incentiveRegime'), regimeLabels[sys.regime as string] ?? (sys.regime as string) ?? '–'],
      [$t('fields.consumptionProfile'), profileLabels[profile] ?? profile],
      [$t('fields.systemSize'), kwpValue],
    ];

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 16px;margin-bottom:14px;font-size:0.75rem;color:#444;line-height:1.4;';

    for (let i = 0; i < items.length; i++) {
      const [label, value] = items[i];
      const span = document.createElement('span');
      span.innerHTML = `<span style="color:#888">${label}:</span> <strong style="color:#1a1a1a">${value}</strong>`;
      row.appendChild(span);
      if (i < items.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = '·';
        sep.style.color = '#ccc';
        row.appendChild(sep);
      }
    }

    return row;
  }

  async function downloadPdf() {
    if (!resultsEl || pdfBusy) return;
    pdfBusy = true;

    try {
      // Temporarily show the cashflow table so it's in the DOM for cloning
      const prevCf = showCfTable;
      showCfTable = true;
      await tick();

      // Clone and immediately restore — no visible change
      const clone = resultsEl.cloneNode(true) as HTMLElement;
      showCfTable = prevCf;

      // Build off-screen ghost container
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;color:#1a1a1a;padding:24px;font-family:DM Sans,system-ui,sans-serif;';

      // Section title
      const title = document.createElement('h2');
      title.textContent = $t('step3.title');
      title.style.cssText = 'font-size:1.0625rem;font-weight:600;color:#1a1a1a;margin:0 0 16px 0;';
      wrapper.style.position = 'relative';
      wrapper.appendChild(title);

      // Extract location + QR from clone into wrapper header (before results)
      const cloneQr = clone.querySelector('.print-qr') as HTMLElement | null;
      if (cloneQr) {
        const svg = cloneQr.querySelector('svg') as SVGElement | null;
        if (svg) {
          cloneQr.remove();
          cloneQr.style.cssText = 'position:absolute;top:24px;right:24px;display:block;background:#fff;padding:6px;border-radius:4px;z-index:10;';
          svg.style.width = '84px'; svg.style.height = '84px'; svg.style.display = 'block';
          wrapper.appendChild(cloneQr);
        } else {
          cloneQr.remove();
        }
      }

      const cloneLoc = clone.querySelector('.print-location') as HTMLElement | null;
      if (cloneLoc) {
        const hasContent = cloneLoc.querySelector('.print-map-img, .print-location-label');
        if (hasContent) {
          cloneLoc.remove();
          cloneLoc.style.display = 'block';
          cloneLoc.style.marginBottom = '12px';
          // Remove static map image — cross-origin, can't be captured by html2canvas
          cloneLoc.querySelector('.print-map-img')?.remove();
          const label = cloneLoc.querySelector('.print-location-label') as HTMLElement | null;
          if (label) ss(label, { 'font-size': '0.75rem', color: '#333', 'margin-top': '0.25rem', 'margin-right': '100px' });
          const coords = cloneLoc.querySelector('.print-location-coords') as HTMLElement | null;
          if (coords) ss(coords, { 'font-size': '0.625rem', color: '#888' });
          wrapper.appendChild(cloneLoc);
        } else {
          cloneLoc.remove();
        }
      }

      // Input parameters (inline, after location)
      wrapper.appendChild(buildInputSummary());

      clone.style.position = 'relative';
      wrapper.appendChild(clone);
      document.body.appendChild(wrapper);

      applyPdfStyles(clone);

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(wrapper, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const pxW = canvas.width;
      const pxH = canvas.height;

      const pageW = 210;
      const margin = 10;
      const contentW = pageW - margin * 2;
      const contentH = (pxH / pxW) * contentW;

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageH = doc.internal.pageSize.getHeight() - margin * 2;

      if (contentH <= pageH) {
        doc.addImage(imgData, 'JPEG', margin, margin, contentW, contentH);
      } else {
        let srcY = 0;
        let page = 0;
        const sliceH = (pageH / contentH) * pxH;
        while (srcY < pxH) {
          if (page > 0) doc.addPage();
          const thisSlice = Math.min(sliceH, pxH - srcY);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = pxW;
          sliceCanvas.height = thisSlice;
          sliceCanvas.getContext('2d')!.drawImage(canvas, 0, srcY, pxW, thisSlice, 0, 0, pxW, thisSlice);
          const sliceImg = sliceCanvas.toDataURL('image/jpeg', 0.85);
          const sliceMmH = (thisSlice / pxW) * contentW;
          doc.addImage(sliceImg, 'JPEG', margin, margin, contentW, sliceMmH);
          srcY += thisSlice;
          page++;
        }
      }

      doc.save('celine-solar-roi.pdf');
      document.body.removeChild(wrapper);
    } finally {
      pdfBusy = false;
    }
  }

  // ── Static map for print ───────────────────────────────────────────────────
  const mapLat = $derived(systemInput?.latitude as number | undefined);
  const mapLng = $derived(systemInput?.longitude as number | undefined);

  const staticMapUrl = $derived.by(() => {
    if (mapLat == null || mapLng == null) return '';
    const markers = `${mapLat},${mapLng},ol-marker`;
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${mapLat},${mapLng}&zoom=17&size=400x250&markers=${markers}&maptype=mapnik`;
  });

  // ── Location label for print ────────────────────────────────────────────────
  const inputLocation = $derived((systemInput?.location as string) || '');
  let reverseGeoLabel = $state('');
  const locationLabel = $derived(inputLocation || reverseGeoLabel);

  onMount(async () => {
    const lat = systemInput?.latitude as number | undefined;
    const lng = systemInput?.longitude as number | undefined;
    const loc = (systemInput?.location as string) || '';
    if (loc || lat == null || lng == null) return;
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('format', 'json');
      url.searchParams.set('zoom', '18');
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!res.ok) return;
      const data = await res.json();
      if (data.display_name) reverseGeoLabel = data.display_name;
    } catch { /* silent */ }
  });

  // ── QR code for print ─────────────────────────────────────────────────────
  const qrSvg = $derived.by(() => {
    if (!shareUrl) return '';
    const qr = new QRCode({ content: shareUrl, padding: 0, width: 120, height: 120, ecl: 'M' });
    return qr.svg();
  });

  // ── Quick scenario comparison ─────────────────────────────────────────────
  let compareResult: CompareResponse | null = $state(null);
  let compareLoading = $state(false);
  let compareError = $state('');

  async function runQuickCompare() {
    compareLoading = true;
    compareError = '';
    compareResult = null;
    try {
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
        [$t('compare.currentScenario')]: {},
      };
      if (currentRegime !== 'RID_CER') {
        scenarios[$t('compare.ridCer')] = { regime: 'RID_CER' };
      }

      scenarios[$t('compare.idealHeatPump')] = { optimize_profile: true, heat_pump_kwh_annual: 3500 };
      scenarios[$t('compare.battery')] = { forced_tasso_autoconsumo: 0.75 };

      compareResult = await api.compareScenarios(sys, scenarios, configOverrides as Record<string, unknown> | undefined);
    } catch (e) {
      compareError = e instanceof Error ? e.message : $t('errors.comparisonFailed');
    } finally {
      compareLoading = false;
    }
  }

  // ── Month names from i18n ──────────────────────────────────────────────────
  const MONTHS = $derived(
    Array.from({ length: 12 }, (_, i) => $t(`months.short.${i}`))
  );
  const MONTHS_FULL = $derived(
    Array.from({ length: 12 }, (_, i) => $t(`months.long.${i}`))
  );

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
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k kWh` : `${v.toFixed(0)} kWh`;
  }
</script>

<div class="results" bind:this={resultsEl}>
  <!-- Print-only: QR code overlaid on header -->
  {#if qrSvg}
    <div class="print-qr">
      {@html qrSvg}
    </div>
  {/if}

  <!-- Print-only: static map + location -->
  {#if staticMapUrl || locationLabel}
    <div class="print-location">
      {#if staticMapUrl}
        <img src={staticMapUrl} alt="Installation location" class="print-map-img" />
      {/if}
      {#if locationLabel}
        <div class="print-location-label">{locationLabel}</div>
      {/if}
      {#if mapLat != null && mapLng != null}
        <div class="print-location-coords">{mapLat.toFixed(6)}, {mapLng.toFixed(6)}</div>
      {/if}
    </div>
  {/if}

  <!-- Validation alerts -->
  {#if result.validation.fails.length > 0}
    <div class="alert alert-error" role="alert">
      <strong>{$t('results.validationIssues')}</strong>
      <ul>
        {#each result.validation.fails as fail}
          <li>{fail.message}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if result.validation.warns.length > 0}
    <div class="alert alert-warn" role="alert">
      <strong>{$t('results.warnings')}</strong>
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
      <div class="kpi-label">{$t('results.npv')}</div>
      <div
        class="kpi-value"
        class:positive={result.summary.npv_eur >= 0}
        class:negative={result.summary.npv_eur < 0}
      >
        {formatEur(result.summary.npv_eur)}
      </div>
    </div>

    <div class="kpi">
      <div class="kpi-label">{$t('results.irr')}</div>
      <div class="kpi-value">{formatNum(result.summary.irr_pct)}%</div>
    </div>

    <div class="kpi">
      <div class="kpi-label">{$t('results.simplePayback')}</div>
      <div class="kpi-value">{formatNum(result.summary.payback_simple_years)} {$t('results.yrs')}</div>
    </div>

    <div class="kpi">
      <div class="kpi-label">{$t('results.discountedPayback')}</div>
      <div class="kpi-value">{formatNum(result.summary.payback_discounted_years)} {$t('results.yrs')}</div>
    </div>

    <div class="kpi">
      <div class="kpi-label">{$t('results.annualProduction')}</div>
      <div class="kpi-value">{formatNum(result.summary.annual_production_kwh, 0)} kWh</div>
      {#if result.production.effective_kwp}
        <div class="kpi-sub">{$t('results.lidarEst', { values: { kwp: result.production.effective_kwp.toFixed(1) } })}</div>
      {/if}
    </div>

    <div class="kpi">
      <div class="kpi-label">{$t('results.selfConsumption')}</div>
      <div class="kpi-value">{formatNum(result.summary.tasso_autoconsumo_pct)}%</div>
      <div class="kpi-sub">{$t('results.source', { values: { source: result.summary.source } })}</div>
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
      <h3 class="chart-title">{$t('results.cerSplitTitle')}</h3>
      <p class="cer-hint">{$t('results.cerSplitHint')}</p>
      <div class="cer-grid">
        <div class="cer-card">
          <div class="cer-label">{$t('results.cerLibero')}</div>
          <div class="cer-value positive">{formatEur(totalLibero)}{$t('results.perYear')}</div>
        </div>
        <div class="cer-card">
          <div class="cer-label">{$t('results.cerVincolato')}</div>
          <div class="cer-value">{formatEur(totalVincolato)}{$t('results.perYear')}</div>
        </div>
      </div>
    </div>
  {/if}

  <!-- ── Monthly production chart ────────────────────────────────────────── -->
  <div class="chart-block">
    <div class="chart-header">
      <h3 class="chart-title">{$t('results.monthlyProduction')}</h3>
      <button class="btn-link" onclick={() => (showMonthlyTable = !showMonthlyTable)}>
        {showMonthlyTable ? $t('results.hideTable') : $t('results.showTable')}
      </button>
    </div>

    <!-- Hover info bar -->
    <div class="chart-infobar" aria-live="polite">
      {#if hoveredBar !== null}
        <strong>{MONTHS_FULL[hoveredBar]}:</strong>
        {formatNum(monthly[hoveredBar], 0)} kWh {$t('results.produced')}
        {#if hasMonthlyEnergy && result.energy.autoconsumo.length === 12}
          · {formatNum(result.energy.autoconsumo[hoveredBar], 0)} kWh {$t('results.selfConsumed')}
          · {formatNum(result.energy.immissione[hoveredBar], 0)} kWh {$t('results.exportedToGrid')}
        {/if}
      {:else}
        <span class="info-hint">{$t('results.hoverMonth')}</span>
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
              <th>{$t('results.month')}</th>
              <th>{$t('results.productionKwh')}</th>
              {#if hasMonthlyEnergy && result.energy.consumption.length === 12}
                <th>{$t('results.consumptionKwh')}</th>
                <th>{$t('results.selfConsumedKwh')}</th>
                <th>{$t('results.exportedKwh')}</th>
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
              <td><strong>{$t('results.total')}</strong></td>
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
      <h3 class="chart-title">{$t('results.cashflowTitle')}</h3>
      <button class="btn-link" onclick={() => (showCfTable = !showCfTable)}>
        {showCfTable ? $t('results.hideTable') : $t('results.showTable')}
      </button>
    </div>

    <!-- Hover info bar for cashflow -->
    <div class="chart-infobar" aria-live="polite">
      {#if hoveredCfIdx !== null}
        <strong>{$t('results.year')} {hoveredCfIdx}:</strong>
        {$t('results.annualCashflow')} {formatEur(cfAnnual[hoveredCfIdx] ?? 0)}
        · {$t('results.cumulative')} {formatEur(cfData[hoveredCfIdx])}
      {:else}
        <span class="info-hint">{$t('results.cashflowHover')}</span>
      {/if}
    </div>

    <div class="cf-row">
      <!-- SVG chart container -->
      <div class="cf-container">
        <svg
          bind:this={cfSvgEl}
          class="cf-svg"
          viewBox="0 0 {SVG_W} {SVG_H}"
          role="img"
          aria-label={$t('results.cashflowTitle')}
          onmousemove={handleCfMouseMove}
          onmouseleave={handleCfMouseLeave}
        >
          <title>{$t('results.cashflowTitle')}</title>

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
          >{$t('results.breakEven')}</text>

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
            <div class="cf-tooltip-year">{$t('results.year')} {hoveredCfIdx}</div>
            <div>{$t('results.annualCashflow')}: {formatEur(cfAnnual[hoveredCfIdx] ?? 0)}</div>
            <div>{$t('results.cumulative')}: <strong>{formatEur(cfData[hoveredCfIdx])}</strong></div>
          </div>
        {/if}
      </div>

      <!-- 5-year summary table -->
      {#if showCfTable}
        <div class="data-table-wrap cf-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>{$t('results.year')}</th>
                <th>{$t('results.annualCashflow')}</th>
                <th>{$t('results.cumulative')}</th>
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
  </div>

  <!-- ── Actions: Export + Compare ──────────────────────────────────────── -->
  <div class="actions-row">
    <button class="btn-action" onclick={downloadPdf} disabled={pdfBusy}>
      {#if pdfBusy}<span class="spinner" aria-hidden="true"></span>{/if}
      {pdfBusy ? $t('actions.generatingPdf') : $t('actions.downloadPdf')}
    </button>
    <button class="btn-action btn-action-secondary" onclick={runQuickCompare} disabled={compareLoading}>
      {compareLoading ? $t('actions.comparing') : $t('actions.quickCompare')}
    </button>
  </div>

  {#if compareError}
    <div class="alert alert-error" role="alert">
      <strong>{$t('errors.compareError')}</strong> {compareError}
    </div>
  {/if}

  {#if compareResult}
    {@const compareNames = Object.keys(compareResult.scenarios)}
    {@const compareKpis = [
      { key: 'npv', label: $t('compare.npv25'), fmt: (s: ScenarioResult) => formatEur(s.finance.npv), cls: (s: ScenarioResult) => s.finance.npv >= 0 ? 'positive' : 'negative' },
      { key: 'irr', label: $t('compare.irr'), fmt: (s: ScenarioResult) => formatNum(s.finance.irr * 100) + '%', cls: () => '' },
      { key: 'payback', label: $t('compare.simplePayback'), fmt: (s: ScenarioResult) => formatNum(s.finance.payback_simple) + ' ' + $t('results.yrs'), cls: () => '' },
      { key: 'payback_d', label: $t('compare.discountedPayback'), fmt: (s: ScenarioResult) => formatNum(s.finance.payback_discounted) + ' ' + $t('results.yrs'), cls: () => '' },
      { key: 'autoconsumo', label: $t('compare.selfConsumption'), fmt: (s: ScenarioResult) => formatNum(s.energy.tasso_autoconsumo * 100) + '%', cls: () => '' },
      { key: 'prod', label: $t('compare.productionYear1'), fmt: (s: ScenarioResult) => formatNum(s.summary.annual_production_kwh, 0) + ' kWh', cls: () => '' },
      { key: 'kwp', label: $t('compare.systemKwp'), fmt: (s: ScenarioResult) => formatNum(s.production.effective_kwp ?? (s.summary.annual_production_kwh / 1200), 1) + ' kWp', cls: () => '' },
      { key: 'cer', label: $t('compare.cerFreeYear1'), fmt: (s: ScenarioResult) => formatEur((s.incentives.cer_tip_libero?.[0] ?? 0) + (s.incentives.cer_cacv_libero?.[0] ?? 0)), cls: () => '' },
      { key: 'cum', label: $t('compare.cumProfit25'), fmt: (s: ScenarioResult) => formatEur(s.finance.cumulative[s.finance.cumulative.length - 1]), cls: (s: ScenarioResult) => s.finance.cumulative[s.finance.cumulative.length - 1] >= 0 ? 'positive' : 'negative' },
    ]}
    <div class="chart-block">
      <h3 class="chart-title">{$t('results.scenarioComparison')}</h3>
      <div class="compare-table-wrap">
        <table class="data-table compare-table">
          <thead>
            <tr>
              <th>{$t('results.kpi')}</th>
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

  <div class="disclaimer">
    <p>
      <strong>Disclaimer.</strong> {$t('disclaimer')}
    </p>
  </div>
</div>

{#if pdfBusy}
  <div class="pdf-overlay">
    <div class="pdf-overlay-content">
      <span class="spinner spinner-lg" aria-hidden="true"></span>
      <span>{$t('actions.generatingPdf')}</span>
    </div>
  </div>
{/if}

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
    grid-template-columns: repeat(3, 1fr);
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

  /* ── Spinner ── */
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  .spinner-lg {
    width: 1.5rem;
    height: 1.5rem;
    border-width: 2.5px;
  }

  /* ── PDF overlay ── */
  .pdf-overlay {
    position: fixed;
    inset: 0;
    background: rgba(255, 255, 255, 0.7);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(2px);
  }

  .pdf-overlay-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #ddd);
    border-radius: var(--celine-radius-sm, 0.5rem);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--celine-text, #1a1a1a);
  }

  .pdf-overlay-content .spinner-lg {
    color: var(--celine-primary, #0d9488);
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

  /* ── Print-only elements: hidden on screen ── */
  .print-qr,
  .print-location {
    display: none;
  }

  /* ── Disclaimer ── */
  .disclaimer {
    border-top: 1px solid var(--celine-border);
    padding-top: 1rem;
    margin-top: 0.5rem;
  }

  .disclaimer p {
    font-size: 0.6875rem;
    line-height: 1.5;
    color: var(--celine-text-tertiary);
    margin: 0;
  }

  /* ── Print styles ── */
  @media print {
    .actions-row,
    .chart-infobar,
    .btn-link,
    .cf-tooltip {
      display: none !important;
    }

    .print-qr {
      display: block !important;
      position: fixed;
      top: 0.25rem;
      right: 1rem;
      z-index: 2147483647;
      background: #fff;
      padding: 6px;
      border-radius: 4px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .print-qr :global(svg) {
      width: 84px;
      height: 84px;
      display: block;
    }

    .print-location {
      display: block !important;
    }

    .print-map-img {
      width: 100%;
      max-height: 180px;
      object-fit: cover;
      border: 1px solid #ccc;
      border-radius: 4px;
    }

    .print-location-label {
      font-size: 0.75rem;
      color: #333;
      margin-top: 0.25rem;
    }

    .print-location-coords {
      font-size: 0.625rem;
      color: #888;
      font-variant-numeric: tabular-nums;
    }

    .results {
      gap: 1rem;
      color: #1a1a1a !important;
    }

    /* Force readable text colors everywhere */
    .kpi-label,
    .cer-label,
    .cer-hint {
      color: #555 !important;
    }

    .kpi-value,
    .chart-title,
    .cer-value,
    .data-table,
    .num {
      color: #1a1a1a !important;
    }

    .kpi-sub {
      color: #666 !important;
    }

    .kpi-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .kpi {
      border: 1px solid #ccc;
      background: #f9f9f9 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .kpi-highlight {
      background: #eef4ff !important;
      border-color: #6366f1;
    }

    /* Monthly bar chart: force visible bars */
    .bar-chart {
      height: 80px;
    }

    .bar {
      background: #4f46e5 !important;
      opacity: 1 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .bar-value,
    .bar-label {
      color: #333 !important;
    }

    /* Hide monthly data table in print — the graph is sufficient */
    .bar-chart ~ .data-table-wrap {
      display: none !important;
    }

    /* Cashflow: chart + table side by side, chart stretches to table height */
    .cf-row {
      display: flex !important;
      flex-direction: row !important;
      gap: 0.75rem;
      align-items: stretch;
    }

    .cf-container {
      flex: 0 0 58%;
      border-color: #ccc;
      display: flex;
    }

    .cf-svg {
      width: 100%;
      height: 100%;
      aspect-ratio: auto;
    }

    .cf-table-wrap {
      flex: 1;
      min-width: 0;
    }

    /* SVG elements */
    :global(.cf-area) {
      fill: #dbeafe !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    :global(.cf-line) {
      stroke: #4f46e5 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    :global(.axis-label) {
      fill: #555 !important;
    }

    .data-table-wrap,
    .compare-table-wrap {
      overflow: visible;
      border-color: #ccc;
    }

    .data-table {
      font-size: 0.7rem;
    }

    .data-table th {
      background: #f5f5f5 !important;
      color: #333 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .data-table td {
      color: #1a1a1a !important;
    }

    .data-table tfoot td {
      background: #f5f5f5 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .chart-block {
      break-inside: avoid;
    }

    .positive {
      color: #16a34a !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .negative {
      color: #dc2626 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .cer-card {
      border-color: #ccc;
      background: #fafafa !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .disclaimer {
      border-top: 1px solid #ccc;
    }

    .disclaimer p {
      color: #555 !important;
    }
  }
</style>
