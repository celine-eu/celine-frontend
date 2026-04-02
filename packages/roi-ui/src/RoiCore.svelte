<script lang="ts">
  import MapPicker from './MapPicker.svelte';
  import RoiResults from './RoiResults.svelte';
  import { createRoiApi } from './api.js';
  import type { PickedLocation, ScenarioResult, UserType, Regime, CapexEstimateResponse } from './types.js';

  interface Props {
    apiBaseUrl?: string;
    embedded?: boolean;
  }

  let { apiBaseUrl = '/api', embedded = false }: Props = $props();

  const api = $derived(createRoiApi(apiBaseUrl));

  // ── URL parameter sharing ─────────────────────────────────────────────────
  function readUrlParams(): Partial<{
    lat: number; lng: number; kwp: number; capex: number;
    consumption: number; regime: Regime; tilt: number; azimuth: number;
    userType: UserType; battery: number; wkt: string;
  }> {
    if (typeof window === 'undefined') return {};
    const p = new URLSearchParams(window.location.search);
    const num = (k: string) => {
      const v = p.get(k);
      if (!v) return undefined;
      const parsed = parseFloat(v);
      return isNaN(parsed) ? undefined : parsed;
    };
    return {
      lat: num('lat'), lng: num('lng'), kwp: num('kwp'),
      capex: num('capex'), consumption: num('consumption'),
      tilt: num('tilt'), azimuth: num('azimuth'),
      battery: num('battery'),
      regime: (p.get('regime') as Regime) || undefined,
      userType: (p.get('user_type') as UserType) || undefined,
      wkt: p.get('wkt') || undefined,
    };
  }

  const urlParams = readUrlParams();

  // Location
  let location: PickedLocation | null = $state(
    urlParams.lat != null && urlParams.lng != null
      ? { lat: urlParams.lat, lng: urlParams.lng, wkt: urlParams.wkt ?? '', name: '' }
      : null
  );

  // Required parameters
  let capex = $state(urlParams.capex ?? 15000);
  let consumption = $state(urlParams.consumption ?? 5000);
  let userType: UserType = $state(urlParams.userType ?? 'commercial');
  let regime: Regime = $state(urlParams.regime ?? 'RID');

  // kWp estimation
  let kwpAuto = $state(urlParams.kwp == null);
  let kwp = $state(urlParams.kwp ?? 10);

  // Panel-based CAPEX estimation
  let useCapexEstimator = $state(false);
  let numPanels = $state(10);
  let capexEstimate: CapexEstimateResponse | null = $state(null);
  let capexEstimateLoading = $state(false);
  let rooftopAreaM2 = $state(0);

  // Load profile selection
  let loadProfile = $state('residential_default.json');

  // Battery cost deduction
  let batteryKwh = $state(urlParams.battery ?? 0);

  // Detrazione / incentive configuration
  let detrazioneEnabled = $state(true);
  let detrazioneRateCustom = $state(false);
  let detrazioneRate = $state(50);
  let detrazioneYears = $state(10);

  // Advanced options
  let showAdvanced = $state(false);
  let tilt = $state(urlParams.tilt ?? 30);
  let azimuth = $state(urlParams.azimuth ?? 0);
  let equityFraction = $state(1.0);
  let loanRate = $state(3.0);
  let loanDuration = $state(0);

  const hasLoan = $derived(equityFraction < 1.0);

  // UI state
  let loading = $state(false);
  let error = $state('');
  let result: ScenarioResult | null = $state(null);
  let lastSystem: Record<string, unknown> | null = $state(null);
  let lastOverrides: Record<string, unknown> | null = $state(null);

  const canSubmit = $derived(location !== null && capex > 0 && consumption > 0);

  async function calculate() {
    if (!location) return;
    loading = true;
    error = '';
    result = null;

    try {
      // Always send WKT when polygon is drawn; use kwp=0 for LIDAR auto-estimation
      const hasWkt = !!location.wkt;
      const useLidar = kwpAuto && !useCapexEstimator && hasWkt;
      const system = {
        kwp: useLidar ? 0 : kwp,
        latitude: location.lat,
        longitude: location.lng,
        tilt,
        azimuth,
        capex,
        annual_consumption_kwh: consumption,
        user_type: userType,
        regime,
        equity_fraction: equityFraction,
        ...(hasLoan ? { loan_rate: loanRate / 100, loan_duration_years: loanDuration } : {}),
        location: location.name || '',
        ...(hasWkt ? { rooftop_wkt: location.wkt } : {}),
        ...(batteryKwh > 0 ? { battery_kwh: batteryKwh } : {}),
      };
      const overrides: Record<string, unknown> = {};
      if (loadProfile !== 'residential_default.json') overrides.load_profile = loadProfile;
      if (!detrazioneEnabled) overrides.detrazione_enabled = false;
      if (detrazioneRateCustom) {
        overrides.detrazione_rate = detrazioneRate / 100;
        overrides.detrazione_years = detrazioneYears;
      }
      lastSystem = system;
      lastOverrides = overrides;
      result = await api.runScenario(system, overrides);
    } catch (e) {
      error = e instanceof Error ? e.message : 'Calculation failed';
    } finally {
      loading = false;
    }
  }

  function onLocationChange(loc: PickedLocation | null) {
    location = loc;
    result = null;
    error = '';
  }

  let linkCopied = $state(false);

  function buildShareUrl(): string {
    if (!location) return '';
    const p = new URLSearchParams();
    p.set('lat', location.lat.toFixed(6));
    p.set('lng', location.lng.toFixed(6));
    if (!kwpAuto) p.set('kwp', String(kwp));
    p.set('capex', String(capex));
    p.set('consumption', String(consumption));
    p.set('regime', regime);
    if (userType !== 'commercial') p.set('user_type', userType);
    if (tilt !== 30) p.set('tilt', String(tilt));
    if (azimuth !== 0) p.set('azimuth', String(azimuth));
    if (batteryKwh > 0) p.set('battery', String(batteryKwh));
    if (location.wkt) p.set('wkt', location.wkt);
    const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
    return `${base}?${p.toString()}`;
  }

  async function copyShareLink() {
    const url = buildShareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    linkCopied = true;
    setTimeout(() => { linkCopied = false; }, 2000);
  }

  function computeRooftopArea(): number {
    if (!location?.wkt) return 0;
    const coords = location.wkt.match(/[\d.]+\s+[\d.]+/g) ?? [];
    if (coords.length < 4) return 0;
    const lats = coords.map(c => parseFloat(c.split(/\s+/)[1]));
    const lngs = coords.map(c => parseFloat(c.split(/\s+/)[0]));
    const dLat = (Math.max(...lats) - Math.min(...lats)) * 111320;
    const dLng = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos(Math.min(...lats) * Math.PI / 180);
    return Math.abs(dLat * dLng) * 0.8; // 80% usable area
  }

  async function fetchCapexEstimate() {
    if (rooftopAreaM2 <= 0) {
      rooftopAreaM2 = computeRooftopArea();
    }
    if (rooftopAreaM2 <= 0) return;

    capexEstimateLoading = true;
    try {
      capexEstimate = await api.estimateCapex(rooftopAreaM2, numPanels);
      if (capexEstimate.capex_eur != null) {
        capex = Math.round(capexEstimate.capex_eur);
        if (capexEstimate.kwp != null) {
          kwp = capexEstimate.kwp;
          kwpAuto = false; // user is choosing panels, disable LIDAR auto
        }
      }
    } catch (e) {
      console.error('CAPEX estimate failed:', e);
      capexEstimate = null;
    } finally {
      capexEstimateLoading = false;
    }
  }

  async function onCapexEstimatorToggle() {
    if (useCapexEstimator) {
      rooftopAreaM2 = computeRooftopArea();
      // First call without num_panels to get min/max range
      if (rooftopAreaM2 > 0) {
        try {
          const rangeInfo = await api.estimateCapex(rooftopAreaM2);
          capexEstimate = rangeInfo;
          // Clamp numPanels to valid range
          if (numPanels < rangeInfo.min_panels) numPanels = rangeInfo.min_panels;
          if (numPanels > rangeInfo.max_panels) numPanels = rangeInfo.max_panels;
          // Now fetch with the clamped panel count
          await fetchCapexEstimate();
        } catch (e) {
          console.error('CAPEX range fetch failed:', e);
        }
      }
    }
  }
</script>

<div class="roi-core" class:embedded>
  <!-- Step 1: Location -->
  <section class="section">
    <header class="section-header">
      <span class="step-num">1</span>
      <div>
        <h2 class="section-title">Select location</h2>
        <p class="section-hint">
          Search your address, then <strong>draw your rooftop area</strong> on the map by clicking
          and dragging a rectangle.
        </p>
      </div>
    </header>
    <MapPicker
      {onLocationChange}
      initialLat={urlParams.lat ?? 46.07}
      initialLng={urlParams.lng ?? 11.12}
      initialZoom={urlParams.lat != null ? 17 : 13}
    />
  </section>

  <!-- Step 2: Parameters -->
  {#if location}
    <section class="section">
      <header class="section-header">
        <span class="step-num">2</span>
        <div>
          <h2 class="section-title">System parameters</h2>
          <p class="section-hint">Enter the key financial and technical parameters for your installation.</p>
        </div>
      </header>

      <div class="form-grid">
        <!-- CAPEX -->
        <label class="field">
          <span class="field-label">
            Installation cost
            <span class="field-unit">€, net of VAT</span>
            <span class="req">*</span>
          </span>
          <input
            type="number"
            class="field-input"
            bind:value={capex}
            min="1000"
            step="500"
            placeholder="15000"
            disabled={useCapexEstimator}
          />
          <span class="field-hint">
            {#if useCapexEstimator}
              Auto-calculated from panel count below.
            {:else}
              Total project cost (materials + labour). Typical range: €1,200–2,000/kWp for residential.
            {/if}
          </span>
        </label>

        <!-- Battery cost deduction -->
        {#if !useCapexEstimator}
          <label class="field">
            <span class="field-label">
              Battery capacity
              <span class="field-unit">kWh (0 = none)</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={batteryKwh}
              min="0"
              max="200"
              step="0.5"
              placeholder="0"
            />
            <span class="field-hint">
              If your total cost includes a battery, enter its capacity here.
              The estimated battery cost will be subtracted to isolate PV investment.
              {#if batteryKwh > 0}
                {@const estCost = Math.round(Math.max(1500, 2400 * Math.pow(batteryKwh, 0.53)))}
                <strong>Est. battery: ~{estCost.toLocaleString('it-IT')} € ({Math.round(estCost / batteryKwh).toLocaleString('it-IT')} €/kWh)</strong>
              {/if}
            </span>
          </label>
        {/if}

        <!-- Panel-based CAPEX estimator -->
        {#if location?.wkt}
          <div class="field" style="grid-column: 1 / -1">
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={useCapexEstimator} onchange={onCapexEstimatorToggle} />
              <span>
                Estimate cost from number of panels
                <span class="badge">Power Law</span>
              </span>
            </label>
            {#if useCapexEstimator}
              <div style="display: flex; gap: 0.75rem; align-items: flex-end; margin-top: 0.5rem; flex-wrap: wrap">
                <label class="field" style="max-width: 200px">
                  <span class="field-label">
                    Number of panels
                    {#if capexEstimate}
                      <span class="field-unit">
                        ({capexEstimate.min_panels}–{capexEstimate.max_panels} for {Math.round(rooftopAreaM2)} m²)
                      </span>
                    {/if}
                  </span>
                  <input
                    type="number"
                    class="field-input"
                    bind:value={numPanels}
                    min={capexEstimate?.min_panels ?? 1}
                    max={capexEstimate?.max_panels ?? 999}
                    step="1"
                    oninput={fetchCapexEstimate}
                  />
                </label>
                {#if capexEstimate?.capex_eur != null}
                  <span class="field-hint" style="font-size: 0.8125rem">
                    <strong>{capexEstimate.kwp?.toFixed(1)} kWp</strong> ·
                    {Math.round(capexEstimate.capex_eur).toLocaleString('it-IT')} € ·
                    {Math.round(capexEstimate.eur_per_kwp ?? 0).toLocaleString('it-IT')} €/kWp ·
                    {capexEstimate.rooftop_utilization_pct}% rooftop used
                  </span>
                {/if}
              </div>
              {#if capexEstimate}
                <span class="field-hint">
                  Panel: {capexEstimate.panel.watt_peak} Wp, {capexEstimate.panel.area_m2} m², {capexEstimate.panel.efficiency_pct}% efficiency.
                  Cost curve: Italian market 2025-2026 (pre-IVA, chiavi in mano).
                </span>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Consumption -->
        <label class="field">
          <span class="field-label">
            Annual consumption
            <span class="field-unit">kWh/year</span>
            <span class="req">*</span>
          </span>
          <input
            type="number"
            class="field-input"
            bind:value={consumption}
            min="100"
            step="100"
            placeholder="5000"
          />
          <span class="field-hint">Total electricity drawn from the grid per year. Check your utility bills.</span>
        </label>

        <!-- User type -->
        <label class="field">
          <span class="field-label">User type</span>
          <select class="field-input" bind:value={userType}>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="office">Office</option>
            <option value="industrial">Industrial</option>
            <option value="agricultural">Agricultural</option>
          </select>
          <span class="field-hint">Affects applicable incentive tariffs (RID/CER rates differ by user category).</span>
        </label>

        <!-- Regime -->
        <label class="field">
          <span class="field-label">Incentive regime</span>
          <select class="field-input" bind:value={regime}>
            <option value="RID_CER">RID + CER (recommended)</option>
            <option value="RID">RID only — feed-in tariff</option>
            <option value="CER">CER only — energy community</option>
          </select>
          <span class="field-hint">
            RID: earn revenue selling excess energy back to the grid. CER: share energy within a community for additional incentives.
          </span>
        </label>

        <!-- Load profile -->
        <label class="field">
          <span class="field-label">Consumption profile</span>
          <select class="field-input" bind:value={loadProfile}>
            <option value="residential_default.json">Standard residential</option>
            <option value="residential_heat_pump.json">Residential + heat pump</option>
          </select>
          <span class="field-hint">
            Heat pump profile shifts consumption to daytime (higher self-consumption, +5-15pp autoconsumo).
          </span>
        </label>
      </div>

      <!-- kWp / LIDAR -->
      <div class="kwp-box">
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={kwpAuto} />
          <span>
            Auto-estimate system size from rooftop polygon
            <span class="badge">Trentino LIDAR</span>
          </span>
        </label>
        <p class="field-hint" style="margin-left: 1.5rem">
          Uses the Trentino Solar LIDAR database to calculate kWp from your rooftop area (only works
          within the Trento province). For other areas, disable this and enter kWp manually.
        </p>
        {#if !kwpAuto}
          <label class="field" style="margin-top: 0.75rem; max-width: 220px">
            <span class="field-label">
              System size
              <span class="field-unit">kWp</span>
              <span class="req">*</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={kwp}
              min="0.5"
              max="5000"
              step="0.5"
              placeholder="10"
            />
            <span class="field-hint">Rated peak power of the PV array. 1 kWp ≈ 4–6 m² of panels.</span>
          </label>
        {/if}
      </div>

      <!-- Advanced options -->
      <div class="advanced-toggle">
        <button
          class="btn-link"
          type="button"
          onclick={() => (showAdvanced = !showAdvanced)}
          aria-expanded={showAdvanced}
        >
          {showAdvanced ? '▾' : '▸'} Advanced options
          <span class="adv-hint">(panel orientation, financing, incentives)</span>
        </button>
      </div>

      {#if showAdvanced}
        <div class="advanced-grid">
          <label class="field">
            <span class="field-label">
              Panel tilt
              <span class="field-unit">degrees</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={tilt}
              min="0"
              max="90"
              step="1"
            />
            <span class="field-hint">Angle from horizontal. Optimal for Italy: 30–35°. Flat roof: 10–15°.</span>
          </label>

          <label class="field">
            <span class="field-label">
              Panel azimuth
              <span class="field-unit">degrees</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={azimuth}
              min="-180"
              max="180"
              step="5"
            />
            <span class="field-hint">0° = south (optimal), −90° = east, +90° = west. Avoid north-facing (|az| &gt; 90°).</span>
          </label>

          <label class="field">
            <span class="field-label">
              Equity fraction
              <span class="field-unit">0–1</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={equityFraction}
              min="0"
              max="1"
              step="0.05"
              placeholder="1.0"
            />
            <span class="field-hint">
              Fraction of CAPEX financed with own funds (1.0 = fully self-funded, no loan).
            </span>
          </label>

          {#if hasLoan}
            <label class="field">
              <span class="field-label">
                Loan interest rate
                <span class="field-unit">% / year</span>
              </span>
              <input
                type="number"
                class="field-input"
                bind:value={loanRate}
                min="0.1"
                max="30"
                step="0.1"
                placeholder="3.0"
              />
            </label>

            <label class="field">
              <span class="field-label">
                Loan duration
                <span class="field-unit">years</span>
              </span>
              <input
                type="number"
                class="field-input"
                bind:value={loanDuration}
                min="1"
                max="30"
                step="1"
                placeholder="10"
              />
            </label>
          {/if}

          <!-- Detrazione / IRPEF incentive -->
          <div class="field" style="grid-column: 1 / -1">
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={detrazioneEnabled} />
              <span>IRPEF tax deduction (detrazione fiscale)</span>
            </label>
            <span class="field-hint" style="margin-left: 1.5rem">
              Italian IRPEF deduction on PV installation cost (residential, ≤20 kWp).
              Uncheck if you don't have access to this incentive.
            </span>
            {#if detrazioneEnabled}
              <label class="checkbox-row" style="margin-top: 0.5rem; margin-left: 1.5rem">
                <input type="checkbox" bind:checked={detrazioneRateCustom} />
                <span>Custom deduction rate</span>
              </label>
              {#if detrazioneRateCustom}
                <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem; margin-left: 1.5rem; flex-wrap: wrap">
                  <label class="field" style="max-width: 160px">
                    <span class="field-label">
                      Deduction rate
                      <span class="field-unit">%</span>
                    </span>
                    <input
                      type="number"
                      class="field-input"
                      bind:value={detrazioneRate}
                      min="1"
                      max="100"
                      step="1"
                    />
                  </label>
                  <label class="field" style="max-width: 160px">
                    <span class="field-label">
                      Over
                      <span class="field-unit">years</span>
                    </span>
                    <input
                      type="number"
                      class="field-input"
                      bind:value={detrazioneYears}
                      min="1"
                      max="30"
                      step="1"
                    />
                  </label>
                </div>
                <span class="field-hint" style="margin-left: 1.5rem">
                  Annual deduction = (CAPEX + IVA 10%) × {detrazioneRate}% / {detrazioneYears} years
                  {#if capex > 0}
                    = <strong>{Math.round(capex * 1.10 * (detrazioneRate / 100) / detrazioneYears).toLocaleString('it-IT')} €/year</strong>
                  {/if}
                </span>
              {/if}
            {/if}
          </div>
        </div>
      {/if}

      <div class="action-row">
        <button
          class="btn-calculate"
          onclick={calculate}
          disabled={loading || !canSubmit}
        >
          {#if loading}
            <span class="spinner" aria-hidden="true"></span>
            Calculating…
          {:else}
            Calculate ROI
          {/if}
        </button>
        {#if location}
          <button
            class="btn-share"
            onclick={copyShareLink}
            type="button"
            title="Copy shareable link with current parameters"
          >
            {linkCopied ? 'Copied!' : 'Copy link'}
          </button>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="error-banner" role="alert">
      <strong>Error:</strong> {error}
      {#if kwpAuto}
        <br />
        <small>
          If your location is outside Trentino, disable the LIDAR estimation above and enter the
          system size in kWp manually.
        </small>
      {/if}
    </div>
  {/if}

  <!-- Loading skeleton -->
  {#if loading}
    <section class="section">
      <header class="section-header">
        <span class="step-num step-num-muted">3</span>
        <h2 class="section-title">ROI results</h2>
      </header>
      <div class="skeleton-kpi-grid">
        {#each Array(6) as _}
          <div class="skeleton skeleton-kpi"></div>
        {/each}
      </div>
      <div class="skeleton skeleton-chart-lg" style="margin-top: 1.25rem"></div>
      <div class="skeleton skeleton-chart-sm" style="margin-top: 0.75rem"></div>
    </section>
  {/if}

  <!-- Results -->
  {#if result && !loading}
    <section class="section">
      <header class="section-header">
        <span class="step-num">3</span>
        <h2 class="section-title">ROI results</h2>
      </header>
      <RoiResults {result} {apiBaseUrl} systemInput={lastSystem} configOverrides={lastOverrides} />
    </section>
  {/if}
</div>

<style>
  /* ── Layout ── */
  .roi-core {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 1.5rem;
    max-width: 56rem;
    margin: 0 auto;
  }

  .roi-core.embedded {
    padding: 1rem;
    max-width: none;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.5rem 0;
    border-bottom: 1px solid var(--celine-border);
  }

  .section:last-child {
    border-bottom: none;
  }

  .section-header {
    display: flex;
    gap: 0.875rem;
    align-items: flex-start;
  }

  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: var(--celine-radius-full);
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    font-size: 0.8125rem;
    font-weight: 700;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .step-num-muted {
    background: var(--celine-bg-sunken);
    color: var(--celine-text-tertiary);
  }

  .section-title {
    font-size: 1.0625rem;
    font-weight: 600;
    color: var(--celine-text);
    margin: 0;
  }

  .section-hint {
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    margin: 0.25rem 0 0;
  }

  /* ── Form ── */
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.25rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--celine-text);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .field-unit {
    font-weight: 400;
    color: var(--celine-text-secondary);
    font-size: 0.8125rem;
  }

  .req {
    color: var(--celine-danger);
  }

  .field-input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    font-size: 0.875rem;
    outline: none;
    background: var(--celine-bg-elevated);
    color: var(--celine-text);
    font-family: inherit;
    transition: border-color var(--celine-transition-fast), box-shadow var(--celine-transition-fast);
  }

  .field-input:focus {
    border-color: var(--celine-primary);
    box-shadow: 0 0 0 2px var(--celine-primary-light);
  }

  .field-hint {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
    line-height: 1.4;
  }

  /* ── kWp box ── */
  .kwp-box {
    padding: 0.875rem 1rem;
    background: var(--celine-bg-sunken);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--celine-text);
    cursor: pointer;
  }

  .checkbox-row input[type='checkbox'] {
    margin-top: 2px;
    accent-color: var(--celine-primary);
    flex-shrink: 0;
  }

  .badge {
    display: inline-block;
    padding: 0.0625rem 0.375rem;
    background: var(--celine-primary-light);
    color: var(--celine-primary);
    border-radius: var(--celine-radius-sm);
    font-size: 0.6875rem;
    font-weight: 600;
    margin-left: 0.25rem;
    vertical-align: middle;
  }

  /* ── Advanced ── */
  .advanced-toggle {
    margin-top: -0.25rem;
  }

  .btn-link {
    background: none;
    border: none;
    color: var(--celine-text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .btn-link:hover {
    color: var(--celine-primary);
  }

  .adv-hint {
    font-size: 0.8125rem;
    color: var(--celine-text-tertiary);
  }

  .advanced-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    padding: 1rem;
    background: var(--celine-bg-sunken);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
  }

  .action-row {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  /* ── Calculate button ── */
  .btn-calculate {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.5rem;
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    border: none;
    border-radius: var(--celine-radius-sm);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--celine-transition-fast);
    font-family: inherit;
  }

  .btn-calculate:hover:not(:disabled) {
    background: var(--celine-primary-hover);
  }

  .btn-calculate:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-share {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    background: var(--celine-bg-elevated);
    color: var(--celine-text);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background var(--celine-transition-fast);
  }

  .btn-share:hover {
    background: var(--celine-bg-sunken);
  }

  /* Spinner */
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .spinner {
    display: inline-block;
    width: 1em;
    height: 1em;
    border: 2px solid var(--celine-primary-text);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  /* ── Error ── */
  .error-banner {
    padding: 0.75rem 1rem;
    background: var(--celine-danger-bg);
    border: 1px solid var(--celine-danger);
    border-radius: var(--celine-radius-sm);
    color: var(--celine-danger-text);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  /* ── Skeleton ── */
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  .skeleton {
    background: linear-gradient(
      90deg,
      var(--celine-skeleton-base) 0%,
      var(--celine-skeleton-shine) 50%,
      var(--celine-skeleton-base) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: var(--celine-radius-sm);
  }

  .skeleton-kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.75rem;
  }

  .skeleton-kpi {
    height: 78px;
  }

  .skeleton-chart-lg {
    height: 160px;
  }

  .skeleton-chart-sm {
    height: 120px;
  }
</style>
