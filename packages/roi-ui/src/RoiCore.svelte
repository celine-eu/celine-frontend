<script lang="ts">
  import { t } from 'svelte-i18n';
  import MapPicker from './MapPicker.svelte';
  import RoiResults from './RoiResults.svelte';
  import { createRoiApi } from './api.js';
  import type { PickedLocation, ScenarioResult, UserType, Regime, CapexEstimateResponse } from './types.js';

  interface Props {
    apiBaseUrl?: string;
    embedded?: boolean;
    onUrlChange?: (url: string) => void;
  }

  let { apiBaseUrl = '/api', embedded = false, onUrlChange }: Props = $props();

  const api = $derived(createRoiApi(apiBaseUrl));

  // ── URL parameter sharing ─────────────────────────────────────────────────
  function readUrlParams(): Partial<{
    lat: number; lng: number; kwp: number; capex: number;
    consumption: number; regime: Regime; tilt: number; azimuth: number;
    userType: UserType; battery: number; wkt: string; profile: string;
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
      profile: p.get('profile') || undefined,
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
  let capexEstimateError = $state('');
  let rooftopAreaM2 = $state(0);

  // Load profile selection
  let loadProfile = $state(urlParams.profile ?? 'residential_default.json');
  // Personal profile: manual 24h kWh values
  let customHourlyKwh: number[] = $state(Array(24).fill(0));
  // Personal profile: meter data (processed client-side from folder upload)
  let customProfileDir = $state('');
  let meterDataLoaded = $state(false);
  let meterDataDays = $state(0);

  // Heat pump
  let heatPumpKwh = $state(0);

  // Abitazione principale (residential primary residence)
  let abitazionePrincipale = $state(true);

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

  const kwpPreviewFromArea = $derived.by(() => {
    if (!kwpAuto || useCapexEstimator) return null;
    const area = location?.area_m2 ?? 0;
    if (area <= 0) return null;
    const panelAreaM2 = 2.2;
    const panelKwp = 0.41;
    const usableFraction = 0.65;
    const panels = Math.floor(area * usableFraction / panelAreaM2);
    if (panels <= 0) return null;
    return { panels, kwp: +(panels * panelKwp).toFixed(1), area: Math.round(area) };
  });

  // UI state
  let loading = $state(false);
  let error = $state('');
  let result: ScenarioResult | null = $state(null);
  let lastSystem: Record<string, unknown> | null = $state(null);
  let lastOverrides: Record<string, unknown> | null = $state(null);

  // Auto-fill annual consumption from personal profile data
  $effect(() => {
    if (loadProfile === 'personal_manual') {
      const dailyTotal = customHourlyKwh.reduce((a, b) => a + b, 0);
      if (dailyTotal > 0) {
        consumption = Math.round(dailyTotal * 365);
      }
    }
  });

  // Reset heat pump when switching away from heat pump profile
  $effect(() => {
    if (loadProfile !== 'residential_heat_pump.json') {
      heatPumpKwh = 0;
    } else if (heatPumpKwh === 0) {
      heatPumpKwh = 3500; // sensible default
    }
  });

  // Reset meter data state when switching away
  $effect(() => {
    if (loadProfile !== 'personal_meter') {
      meterDataLoaded = false;
      meterDataDays = 0;
    }
  });

  // Process meter data files from folder upload (client-side)
  async function processMeterFiles(files: FileList) {
    const hourlyTotals = new Array(24).fill(0);
    let totalDays = 0;

    for (const file of files) {
      if (!file.name.endsWith('.json')) continue;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const consumptions = data?.imported?.data?.consumptions;
        if (!Array.isArray(consumptions)) continue;

        for (const entry of consumptions) {
          const hour = entry?.hour;
          const total = entry?.total ?? 0;
          if (hour != null && hour >= 0 && hour < 24) {
            hourlyTotals[hour] += total;
          }
        }
        totalDays++;
      } catch {
        // skip invalid files
      }
    }

    if (totalDays === 0) {
      error = $t('fields.noValidMeterData');
      return;
    }

    // Compute average hourly kWh
    const avgHourly = hourlyTotals.map(v => v / totalDays);
    const dailyTotal = avgHourly.reduce((a, b) => a + b, 0);

    customHourlyKwh = avgHourly.map(v => Math.round(v * 1000) / 1000);
    consumption = Math.round(dailyTotal * 365);
    meterDataLoaded = true;
    meterDataDays = totalDays;
    error = '';
  }

  const canSubmit = $derived(
    location !== null && capex > 0
    && (consumption > 0 || (loadProfile === 'personal_meter' && meterDataLoaded))
  );

  async function calculate() {
    if (!location) return;
    loading = true;
    error = '';
    result = null;

    try {
      // Only send WKT for LIDAR auto-estimation (kwp=0).
      // When user specifies panels/kWp, skip LIDAR so production uses their kWp.
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
        ...(batteryKwh > 0 && !useCapexEstimator ? { battery_kwh: batteryKwh } : {}),
        ...(heatPumpKwh > 0 ? { heat_pump_kwh_annual: heatPumpKwh } : {}),
        ...(userType === 'residential' ? { abitazione_principale: abitazionePrincipale } : {}),
        ...((loadProfile === 'personal_manual' || (loadProfile === 'personal_meter' && meterDataLoaded))
          ? { custom_hourly_kwh: customHourlyKwh } : {}),
      };
      const overrides: Record<string, unknown> = {};
      if (loadProfile !== 'residential_default.json' && loadProfile !== 'personal_manual' && loadProfile !== 'personal_meter') overrides.load_profile = loadProfile;
      if (!detrazioneEnabled) overrides.detrazione_enabled = false;
      if (detrazioneRateCustom) {
        overrides.detrazione_rate = detrazioneRate / 100;
        overrides.detrazione_years = detrazioneYears;
      }
      lastSystem = system;
      lastOverrides = overrides;
      result = await api.runScenario(system, overrides);
      syncUrlParams();
    } catch (e) {
      error = e instanceof Error ? e.message : $t('errors.calculationFailed');
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
    if (batteryKwh > 0 && !useCapexEstimator) p.set('battery', String(batteryKwh));
    if (loadProfile !== 'residential_default.json' && loadProfile !== 'personal_manual' && loadProfile !== 'personal_meter') {
      p.set('profile', loadProfile);
    }
    if (location.wkt) p.set('wkt', location.wkt);
    const base = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
    return `${base}?${p.toString()}`;
  }

  function syncUrlParams() {
    const url = buildShareUrl();
    if (url) onUrlChange?.(url);
  }

  async function copyShareLink() {
    const url = buildShareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    linkCopied = true;
    setTimeout(() => { linkCopied = false; }, 2000);
  }

  function computeRooftopArea(): number {
    if (location?.area_m2 && location.area_m2 > 0) return location.area_m2;
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

    const min = capexEstimate?.min_panels ?? 1;
    const max = capexEstimate?.max_panels ?? 999;
    if (numPanels < min || numPanels > max) {
      capexEstimateError = $t('errors.panelRange', { values: { min, max } });
      return;
    }

    capexEstimateLoading = true;
    capexEstimateError = '';
    try {
      capexEstimate = await api.estimateCapex(rooftopAreaM2, numPanels);
      if (capexEstimate.capex_eur != null) {
        capex = Math.round(capexEstimate.capex_eur);
        if (capexEstimate.kwp != null) {
          kwp = capexEstimate.kwp;
          kwpAuto = false;
        }
      }
    } catch (e) {
      capexEstimateError = e instanceof Error ? e.message : $t('errors.capexEstimationFailed');
    } finally {
      capexEstimateLoading = false;
    }
  }

  async function onCapexEstimatorToggle() {
    if (useCapexEstimator) {
      batteryKwh = 0;
      rooftopAreaM2 = computeRooftopArea();
      if (rooftopAreaM2 > 0) {
        try {
          const rangeInfo = await api.estimateCapex(rooftopAreaM2);
          capexEstimate = rangeInfo;
          if (numPanels < rangeInfo.min_panels) numPanels = rangeInfo.min_panels;
          if (numPanels > rangeInfo.max_panels) numPanels = rangeInfo.max_panels;
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
        <h2 class="section-title">{$t('step1.title')}</h2>
        <p class="section-hint">
          {$t('step1.hintBefore')} <strong>{$t('step1.hintStrong')}</strong> {$t('step1.hintAfter')}
        </p>
      </div>
    </header>
    <MapPicker
      {onLocationChange}
      initialLat={urlParams.lat ?? 46.07}
      initialLng={urlParams.lng ?? 11.12}
      initialZoom={urlParams.lat != null ? 17 : 13}
      initialWkt={urlParams.wkt ?? ''}
    />
  </section>

  <!-- Step 2: Parameters -->
  {#if location}
    <section class="section">
      <header class="section-header">
        <span class="step-num">2</span>
        <div>
          <h2 class="section-title">{$t('step2.title')}</h2>
          <p class="section-hint">{$t('step2.hint')}</p>
        </div>
      </header>

      <!-- Power estimation -->
      <div class="estimation-box">
        <label class="checkbox-row">
          <input type="checkbox" bind:checked={kwpAuto} />
          <span>
            {$t('fields.autoEstimateKwp')}
            <span class="badge">Trentino LIDAR</span>
          </span>
        </label>
        <p class="field-hint" style="margin-left: 1.5rem">
          {$t('fields.lidarHint')}
        </p>
        {#if kwpAuto && useCapexEstimator}
          <p class="field-hint kwp-preview" style="margin-left: 1.5rem">
            {$t('fields.kwpPreviewBothHint')}
          </p>
        {:else if kwpAuto && kwpPreviewFromArea}
          <p class="field-hint kwp-preview" style="margin-left: 1.5rem">
            {$t('fields.kwpPreview', { values: { kwp: kwpPreviewFromArea.kwp, panels: kwpPreviewFromArea.panels, area: kwpPreviewFromArea.area } })}
            <br /><small>{$t('fields.kwpPreviewHint')}</small>
          </p>
        {:else if !kwpAuto}
          <label class="field" style="margin-top: 0.75rem; max-width: 220px">
            <span class="field-label">
              {$t('fields.systemSize')}
              <span class="field-unit">{$t('fields.kwp')}</span>
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
            <span class="field-hint">{$t('fields.systemSizeHint')}</span>
          </label>
        {/if}
      </div>

      <!-- Cost estimation -->
      {#if location?.wkt}
        <div class="estimation-box">
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={useCapexEstimator} onchange={onCapexEstimatorToggle} />
            <span>
              {$t('fields.estimateCostFromPanels')}
              <span class="badge">Power Law</span>
            </span>
          </label>
          {#if useCapexEstimator}
            <div style="display: flex; gap: 0.75rem; align-items: flex-end; margin-top: 0.5rem; flex-wrap: wrap">
              <label class="field" style="max-width: 200px">
                <span class="field-label">
                  {$t('fields.numberOfPanels')}
                  {#if capexEstimate}
                    <span class="field-unit">
                      {$t('fields.panelRange', { values: { min: capexEstimate.min_panels, max: capexEstimate.max_panels, area: Math.round(rooftopAreaM2) } })}
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
              {#if capexEstimateError}
                <span class="field-error">{capexEstimateError}</span>
              {:else if capexEstimate?.capex_eur != null}
                <span class="field-hint" style="font-size: 0.8125rem">
                  <strong>{capexEstimate.kwp?.toFixed(1)} kWp</strong> ·
                  {Math.round(capexEstimate.capex_eur).toLocaleString('it-IT')} € ·
                  {Math.round(capexEstimate.eur_per_kwp ?? 0).toLocaleString('it-IT')} €/kWp ·
                  {$t('fields.rooftopUsed', { values: { pct: capexEstimate.rooftop_utilization_pct } })}
                </span>
              {/if}
            </div>
            {#if capexEstimate}
              <span class="field-hint">
                {$t('fields.panelInfo', { values: { wattPeak: capexEstimate.panel.watt_peak, area: capexEstimate.panel.area_m2, efficiency: capexEstimate.panel.efficiency_pct } })}
              </span>
            {/if}
          {/if}
        </div>
      {/if}

      <div class="form-grid">
        <!-- CAPEX -->
        <label class="field">
          <span class="field-label">
            {$t('fields.installationCost')}
            <span class="field-unit">{$t('fields.netOfVat')}</span>
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
              {$t('fields.installationCostHintAuto')}
            {:else}
              {$t('fields.installationCostHint')}
            {/if}
          </span>
        </label>

        <!-- Battery cost deduction -->
        {#if !useCapexEstimator}
          <label class="field">
            <span class="field-label">
              {$t('fields.batteryCapacity')}
              <span class="field-unit">{$t('fields.batteryUnit')}</span>
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
              {$t('fields.batteryHint')}
              {#if batteryKwh > 0}
                {@const estCost = Math.round(Math.max(1500, 2400 * Math.pow(batteryKwh, 0.53)))}
                <strong>{$t('fields.estBattery', { values: { cost: estCost.toLocaleString('it-IT'), perKwh: Math.round(estCost / batteryKwh).toLocaleString('it-IT') } })}</strong>
              {/if}
            </span>
          </label>
        {/if}

        <!-- Consumption -->
        <label class="field">
          <span class="field-label">
            {$t('fields.annualConsumption')}
            <span class="field-unit">{$t('fields.kwhYear')}</span>
            {#if loadProfile !== 'personal_manual' && loadProfile !== 'personal_meter'}
              <span class="req">*</span>
            {/if}
          </span>
          <input
            type="number"
            class="field-input"
            bind:value={consumption}
            min="100"
            step="100"
            placeholder="5000"
            disabled={loadProfile === 'personal_manual' || loadProfile === 'personal_meter'}
          />
          <span class="field-hint">
            {#if loadProfile === 'personal_manual'}
              {$t('fields.consumptionAutoCalc', { values: { value: consumption.toLocaleString('it-IT') } })}
            {:else if loadProfile === 'personal_meter'}
              {#if meterDataLoaded}
                {$t('fields.consumptionMeterEstimated', { values: { value: consumption.toLocaleString('it-IT') } })}
              {:else}
                {$t('fields.consumptionMeterPending')}
              {/if}
            {:else}
              {$t('fields.consumptionHint')}
            {/if}
          </span>
        </label>

        <!-- User type -->
        <label class="field">
          <span class="field-label">{$t('fields.userType')}</span>
          <select class="field-input" bind:value={userType}>
            <option value="residential">{$t('fields.userTypeResidential')}</option>
            <option value="commercial">{$t('fields.userTypeCommercial')}</option>
            <option value="office">{$t('fields.userTypeOffice')}</option>
            <option value="industrial">{$t('fields.userTypeIndustrial')}</option>
            <option value="agricultural">{$t('fields.userTypeAgricultural')}</option>
          </select>
          <span class="field-hint">{$t('fields.userTypeHint')}</span>
        </label>

        <!-- Regime -->
        <label class="field">
          <span class="field-label">{$t('fields.incentiveRegime')}</span>
          <select class="field-input" bind:value={regime}>
            <option value="RID_CER">{$t('fields.regimeRidCer')}</option>
            <option value="RID">{$t('fields.regimeRid')}</option>
            <option value="CER">{$t('fields.regimeCer')}</option>
          </select>
          <span class="field-hint">{$t('fields.regimeHint')}</span>
        </label>

        <!-- Load profile -->
        <label class="field">
          <span class="field-label">{$t('fields.consumptionProfile')}</span>
          <select class="field-input" bind:value={loadProfile}>
            <option value="residential_default.json">{$t('fields.profileResidential')}</option>
            <option value="commercial_default.json">{$t('fields.profileCommercial')}</option>
            <option value="industrial_default.json">{$t('fields.profileIndustrial')}</option>
            <option value="residential_heat_pump.json">{$t('fields.profileHeatPump')}</option>
            <option value="personal_manual">{$t('fields.profilePersonalManual')}</option>
            <option value="personal_meter">{$t('fields.profilePersonalMeter')}</option>
          </select>
          <span class="field-hint">
            {#if loadProfile === 'personal_manual'}
              {$t('fields.profileHintManual')}
            {:else if loadProfile === 'personal_meter'}
              {$t('fields.profileHintMeter')}
            {:else if loadProfile === 'residential_heat_pump.json'}
              {$t('fields.profileHintHeatPump')}
            {:else}
              {$t('fields.profileHintDefault')}
            {/if}
          </span>
        </label>

        <!-- Personal profile: manual 24h input -->
        {#if loadProfile === 'personal_manual'}
          <div class="field" style="grid-column: 1 / -1">
            <span class="field-label">{$t('fields.hourlyConsumption')} <span class="field-unit">{$t('fields.hourlyUnit')}</span></span>
            <div class="hourly-grid">
              {#each customHourlyKwh as val, i}
                <label class="hourly-cell">
                  <span class="hourly-label">{String(i).padStart(2, '0')}:00</span>
                  <input
                    type="number"
                    class="field-input hourly-input"
                    bind:value={customHourlyKwh[i]}
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </label>
              {/each}
            </div>
            <span class="field-hint">
              {$t('fields.dailyTotal', { values: { daily: customHourlyKwh.reduce((a, b) => a + b, 0).toFixed(2), annual: Math.round(customHourlyKwh.reduce((a, b) => a + b, 0) * 365) } })}
            </span>
          </div>
        {/if}

        <!-- Personal profile: meter data folder upload -->
        {#if loadProfile === 'personal_meter'}
          <div class="field" style="grid-column: 1 / -1">
            <span class="field-label">
              {$t('fields.smartMeterData')}
              <span class="field-unit">{$t('fields.smartMeterUnit')}</span>
            </span>
            <input
              type="file"
              class="field-input"
              accept=".json"
              webkitdirectory
              onchange={(e) => {
                const input = e.target as HTMLInputElement;
                if (input.files && input.files.length > 0) {
                  processMeterFiles(input.files);
                }
              }}
            />
            <span class="field-hint">
              {#if meterDataLoaded}
                {$t('fields.meterDataLoaded', { values: { days: meterDataDays, consumption: consumption.toLocaleString('it-IT') } })}
              {:else}
                {$t('fields.meterDataHint')}
              {/if}
            </span>
          </div>
        {/if}

        <!-- Heat pump (only with residential + heat pump profile) -->
        {#if loadProfile === 'residential_heat_pump.json'}
          <label class="field">
            <span class="field-label">
              {$t('fields.heatPumpConsumption')}
              <span class="field-unit">{$t('fields.kwhYear')}</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={heatPumpKwh}
              min="500"
              max="50000"
              step="100"
              placeholder="3500"
            />
            <span class="field-hint">
              {$t('fields.heatPumpHint')}
              {#if heatPumpKwh > 0}
                <strong>{$t('fields.totalConsumption', { values: { value: (consumption + heatPumpKwh).toLocaleString('it-IT') } })}</strong>
              {/if}
            </span>
          </label>
        {/if}

        <!-- Abitazione principale (residential only) -->
        {#if userType === 'residential'}
          <div class="field">
            <label class="checkbox-row">
              <input type="checkbox" bind:checked={abitazionePrincipale} />
              <span>{$t('fields.primaryResidence')}</span>
            </label>
            <span class="field-hint" style="margin-left: 1.5rem">
              {$t('fields.primaryResidenceHint')}
            </span>
          </div>
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
          {showAdvanced ? '▾' : '▸'} {$t('fields.advancedOptions')}
          <span class="adv-hint">{$t('fields.advancedHint')}</span>
        </button>
      </div>

      {#if showAdvanced}
        <div class="advanced-grid">
          <label class="field">
            <span class="field-label">
              {$t('fields.panelTilt')}
              <span class="field-unit">{$t('fields.degrees')}</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={tilt}
              min="0"
              max="90"
              step="1"
            />
            <span class="field-hint">{$t('fields.panelTiltHint')}</span>
          </label>

          <label class="field">
            <span class="field-label">
              {$t('fields.panelAzimuth')}
              <span class="field-unit">{$t('fields.degrees')}</span>
            </span>
            <input
              type="number"
              class="field-input"
              bind:value={azimuth}
              min="-180"
              max="180"
              step="5"
            />
            <span class="field-hint">{$t('fields.panelAzimuthHint')}</span>
          </label>

          <label class="field">
            <span class="field-label">
              {$t('fields.equityFraction')}
              <span class="field-unit">{$t('fields.equityFractionUnit')}</span>
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
            <span class="field-hint">{$t('fields.equityFractionHint')}</span>
          </label>

          {#if hasLoan}
            <label class="field">
              <span class="field-label">
                {$t('fields.loanInterestRate')}
                <span class="field-unit">{$t('fields.loanRateUnit')}</span>
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
                {$t('fields.loanDuration')}
                <span class="field-unit">{$t('fields.years')}</span>
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
              <span>{$t('fields.irpefDeduction')}</span>
            </label>
            <span class="field-hint" style="margin-left: 1.5rem">
              {$t('fields.irpefHint')}
            </span>
            {#if detrazioneEnabled}
              <label class="checkbox-row" style="margin-top: 0.5rem; margin-left: 1.5rem">
                <input type="checkbox" bind:checked={detrazioneRateCustom} />
                <span>{$t('fields.customDeductionRate')}</span>
              </label>
              {#if detrazioneRateCustom}
                <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem; margin-left: 1.5rem; flex-wrap: wrap">
                  <label class="field" style="max-width: 160px">
                    <span class="field-label">
                      {$t('fields.deductionRate')}
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
                      {$t('fields.over')}
                      <span class="field-unit">{$t('fields.years')}</span>
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
                  {#if capex > 0}
                    {$t('fields.annualDeduction', { values: { rate: detrazioneRate, years: detrazioneYears, value: Math.round(capex * 1.10 * (detrazioneRate / 100) / detrazioneYears).toLocaleString('it-IT') } })}
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
            {$t('actions.calculating')}
          {:else}
            {$t('actions.calculateRoi')}
          {/if}
        </button>
        {#if location}
          <button
            class="btn-share"
            onclick={copyShareLink}
            type="button"
            title={$t('actions.copyLink')}
          >
            {linkCopied ? $t('actions.copied') : $t('actions.copyLink')}
          </button>
        {/if}
      </div>
    </section>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="error-banner" role="alert">
      <strong>{$t('errors.error')}</strong> {error}
      {#if kwpAuto}
        <br />
        <small>{$t('errors.lidarFallback')}</small>
      {/if}
    </div>
  {/if}

  <!-- Loading skeleton -->
  {#if loading}
    <section class="section">
      <header class="section-header">
        <span class="step-num step-num-muted">3</span>
        <h2 class="section-title">{$t('step3.title')}</h2>
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
    <section class="section section-results">
      <header class="section-header">
        <span class="step-num">3</span>
        <h2 class="section-title">{$t('step3.title')}</h2>
      </header>
      <RoiResults {result} {apiBaseUrl} systemInput={lastSystem} configOverrides={lastOverrides} shareUrl={buildShareUrl()} />
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

  .field-error {
    font-size: 0.75rem;
    color: var(--celine-danger);
    line-height: 1.4;
  }

  /* ── Estimation boxes ── */
  .estimation-box {
    padding: 0.875rem 1rem;
    background: var(--celine-bg-sunken);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .kwp-preview {
    color: var(--celine-primary);
    font-weight: 500;
    font-size: 0.8125rem;
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

  /* ── Hourly grid (personal profile 24h input) ── */
  .hourly-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.375rem;
  }

  .hourly-cell {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .hourly-label {
    font-size: 0.6875rem;
    color: var(--celine-text-tertiary);
    font-weight: 500;
  }

  .hourly-input {
    padding: 0.25rem 0.375rem;
    font-size: 0.8125rem;
    text-align: right;
    width: 100%;
  }

  /* ── Print styles ── */
  @media print {
    .roi-core > .section:not(.section-results),
    .roi-core > .error-banner,
    .roi-core > :not(.section) {
      display: none !important;
    }

    .roi-core {
      padding: 0;
      max-width: none;
    }

    .section-results {
      border-bottom: none;
      padding-top: 0;
    }

    .step-num {
      display: none;
    }
  }
</style>
