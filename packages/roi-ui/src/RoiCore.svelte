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

  // Location
  let location: PickedLocation | null = $state(null);

  // Required parameters
  let capex = $state(15000);
  let consumption = $state(5000);
  let userType: UserType = $state('commercial');
  let regime: Regime = $state('RID_CER');

  // kWp estimation
  let kwpAuto = $state(true);
  let kwp = $state(10);

  // Panel-based CAPEX estimation
  let useCapexEstimator = $state(false);
  let numPanels = $state(10);
  let capexEstimate: CapexEstimateResponse | null = $state(null);
  let capexEstimateLoading = $state(false);

  // Load profile selection
  let loadProfile = $state('residential_default.json');

  // Advanced options
  let showAdvanced = $state(false);
  let tilt = $state(30);
  let azimuth = $state(0);
  let equityFraction = $state(1.0);
  let loanRate = $state(3.0);
  let loanDuration = $state(0);

  const hasLoan = $derived(equityFraction < 1.0);

  // UI state
  let loading = $state(false);
  let error = $state('');
  let result: ScenarioResult | null = $state(null);

  const canSubmit = $derived(location !== null && capex > 0 && consumption > 0);

  async function calculate() {
    if (!location) return;
    loading = true;
    error = '';
    result = null;

    try {
      const useWkt = kwpAuto && !!location.wkt;
      const system = {
        kwp: useWkt ? 0 : kwp,
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
        ...(useWkt ? { rooftop_wkt: location.wkt } : {}),
      };
      const overrides = loadProfile !== 'residential_default.json'
        ? { load_profile: loadProfile }
        : {};
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

  async function fetchCapexEstimate() {
    if (!location?.wkt) return;
    capexEstimateLoading = true;
    try {
      // Rough area estimate from WKT (use bounding box area * 0.8 as approximation)
      const coords = location.wkt.match(/[\d.]+\s+[\d.]+/g) ?? [];
      let areaM2 = 50; // fallback
      if (coords.length >= 4) {
        const lats = coords.map(c => parseFloat(c.split(/\s+/)[1]));
        const lngs = coords.map(c => parseFloat(c.split(/\s+/)[0]));
        const dLat = (Math.max(...lats) - Math.min(...lats)) * 111320;
        const dLng = (Math.max(...lngs) - Math.min(...lngs)) * 111320 * Math.cos(Math.min(...lats) * Math.PI / 180);
        areaM2 = Math.abs(dLat * dLng) * 0.8; // 80% usable
      }
      capexEstimate = await api.estimateCapex(areaM2, numPanels);
      if (capexEstimate.capex_eur != null) {
        capex = Math.round(capexEstimate.capex_eur);
        if (capexEstimate.kwp != null) kwp = capexEstimate.kwp;
      }
    } catch (e) {
      // silently fall back to manual input
      capexEstimate = null;
    } finally {
      capexEstimateLoading = false;
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
    <MapPicker {onLocationChange} />
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
          />
          <span class="field-hint">Total project cost (materials + labour). Typical range: €1,200–2,000/kWp for residential.</span>
        </label>

        <!-- Panel-based CAPEX estimator -->
        {#if location?.wkt}
          <div class="field" style="grid-column: 1 / -1">
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={useCapexEstimator} onchange={() => { if (useCapexEstimator) fetchCapexEstimate(); }} />
              <span>
                Estimate cost from number of panels
                <span class="badge">Power Law</span>
              </span>
            </label>
            {#if useCapexEstimator}
              <div style="display: flex; gap: 0.75rem; align-items: flex-end; margin-top: 0.5rem; flex-wrap: wrap">
                <label class="field" style="max-width: 160px">
                  <span class="field-label">
                    Panels
                    <span class="field-unit">
                      (min {capexEstimate?.min_panels ?? 4}, max {capexEstimate?.max_panels ?? '...'})
                    </span>
                  </span>
                  <input
                    type="number"
                    class="field-input"
                    bind:value={numPanels}
                    min={capexEstimate?.min_panels ?? 4}
                    max={capexEstimate?.max_panels ?? 500}
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
          <span class="adv-hint">(panel orientation, financing)</span>
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
        </div>
      {/if}

      <button
        class="btn-calculate"
        onclick={calculate}
        disabled={loading || !canSubmit}
      >
        {#if loading}
          <span class="spinner" aria-hidden="true"></span>
          Calculating…
        {:else}
          ⚡ Calculate ROI
        {/if}
      </button>
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
      <RoiResults {result} {apiBaseUrl} />
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

  /* ── Calculate button ── */
  .btn-calculate {
    align-self: flex-start;
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
