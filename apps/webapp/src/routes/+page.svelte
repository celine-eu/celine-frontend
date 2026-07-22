<script lang="ts">
  import { api, type Overview, type WeatherResponse, type SuggestionItem, type Co2LocaleSettings, type GamificationResponse, type OverviewRange } from "$lib/api";
  import { EnergyChart, StatCard, WeatherWidget, GamificationPanel } from "$lib/components";
  import { deviceStore } from "$lib/stores";
  import { AskAssistantButton } from "@celine-eu/assistant-ui";
  import { Icon, Skeleton } from "@celine-eu/ui";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { t, locale } from "svelte-i18n";

  // Layout data (me from parent layout)
  const me = $derived(page.data.me);

  let overview: Overview | null = $state(null);
  let err = $state("");
  let loading = $state(true);

  type RangePreset = '7d' | '30d' | '6m' | '1y' | 'custom';

  type AppliedRange = OverviewRange & {
    preset: RangePreset;
  };

  const presetOptions: { key: RangePreset; labelKey: string }[] = [
    { key: '7d', labelKey: 'overview.period_7d' },
    { key: '30d', labelKey: 'overview.period_30d' },
    { key: '6m', labelKey: 'overview.period_6m' },
    { key: '1y', labelKey: 'overview.period_1y' },
  ];

  let selectedPreset = $state<RangePreset>('7d');
  let customStartDate = $state("");
  let customEndDate = $state("");
  let appliedRange = $state<AppliedRange>({ preset: '7d', days: 7 });

  let weatherData = $state<WeatherResponse | null>(null);
  let weatherLoading = $state(true);
  let suggestions = $state<SuggestionItem[]>([]);
  let suggestionsLoading = $state(true);
  let co2Settings = $state<Co2LocaleSettings | null>(null);
  let gamification = $state<GamificationResponse | null>(null);
  let gamificationLoading = $state(true);
  let trendTab = $state<'yours' | 'community'>('yours');

  function buildAssistantHref(prompt: string, section: string): string {
    const url = new URL("/assistant", page.url.origin);
    url.searchParams.set("prompt", prompt);
    url.searchParams.set("page", "overview");
    url.searchParams.set("section", section);
    return `${url.pathname}${url.search}`;
  }

  function assistantPrompt(section: "user-contribution" | "community-trend" | "weather" | "co2"): string {
    return $t(`overview.ask_ai.${section}`);
  }

  /**
   * Format kWh value — auto-scales to MWh above 999 kWh.
   * Returns { value, unit } so the caller can pass unit separately to StatCard.
   */
  export function fmtKwh(value: number | null | undefined): { value: string; unit: string } {
    if (value == null) return { value: '—', unit: 'kWh' };
    if (Math.abs(value) >= 1000) return { value: (value / 1000).toFixed(2), unit: 'MWh' };
    return { value: value.toFixed(1), unit: 'kWh' };
  }

  /** Format a number to 1 decimal place, or return "—" for null/undefined */
  function fmt(value: number | null | undefined): string {
    return value != null ? value.toFixed(1) : "—";
  }

  /** Format a percentage (0-1 scale) to whole number with %, or return "—" for null */
  function fmtPct(value: number | null | undefined): string {
    return value != null ? `${(value * 100).toFixed(0)}%` : "—";
  }

  /** Check if user has any data */
  function hasUserData(user: Overview["user"]): boolean {
    return (
      user.consumption_kwh !== null ||
      user.production_kwh !== null ||
      user.self_consumption_kwh !== null
    );
  }

  /** Check if REC has any data */
  function hasRecData(rec: Overview["rec"]): boolean {
    return (
      rec.consumption_kwh !== null ||
      rec.production_kwh !== null ||
      rec.self_consumption_kwh !== null
    );
  }

  /** CO2 kg saved from renewable production */
  function calcCo2Kg(productionKwh: number | null, kgPerKwh: number): number {
    if (productionKwh === null) return 0;
    return productionKwh * kgPerKwh;
  }

  /** Trees equivalent */
  function calcTrees(co2Kg: number, treesPerTon: number): number {
    return Math.round((co2Kg / 1000) * treesPerTon * 10) / 10;
  }

  /** Engaging welcome phrase based on time of day */
  function engagingPhrase(): string {
    const h = new Date().getHours();
    if (h < 12) return $t('overview.engaging_morning');
    if (h < 18) return $t('overview.engaging_afternoon');
    return $t('overview.engaging_evening');
  }

  function dateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function todayInputValue(): string {
    return dateInputValue(new Date());
  }

  function presetDateBounds(preset: RangePreset): { startDate: string; endDate: string } {
    const end = new Date();
    const start = new Date(end);
    if (preset === '30d') {
      start.setDate(start.getDate() - 29);
    } else if (preset === '6m') {
      start.setMonth(start.getMonth() - 6);
    } else if (preset === '1y') {
      start.setDate(start.getDate() - 364);
    } else {
      start.setDate(start.getDate() - 6);
    }
    return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
  }

  function presetDateRange(preset: RangePreset): OverviewRange {
    if (preset === '6m') {
      return presetDateBounds(preset);
    }
    if (preset === '1y') {
      return { days: 365 };
    }
    return { days: preset === '30d' ? 30 : 7 };
  }

  function daysBetweenInclusive(start: string, end: string): number {
    const startTime = new Date(`${start}T00:00:00`).getTime();
    const endTime = new Date(`${end}T00:00:00`).getTime();
    return Math.round((endTime - startTime) / 86_400_000) + 1;
  }

  function validateCustomRange(start: string, end: string): string {
    if (!start || !end) return $t('overview.date_filter_missing');
    if (start > end) return $t('overview.date_filter_invalid_order');
    if (end > todayInputValue()) return $t('overview.date_filter_future');
    if (daysBetweenInclusive(start, end) > 366) return $t('overview.date_filter_too_long');
    return "";
  }

  function formatDateLabel(value: string): string {
    if (!value) return "";
    return new Date(`${value}T00:00:00`).toLocaleDateString($locale ?? undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function rangeDisplayLabel(range: AppliedRange): string {
    if (range.preset === '7d') return $t('overview.last_7_days');
    if (range.preset === '30d') return $t('overview.last_30_days');
    if (range.preset === '6m') return $t('overview.last_6_months');
    if (range.preset === '1y') return $t('overview.last_1_year');
    if (range.startDate && range.endDate) {
      return $t('overview.custom_period', {
        values: {
          start: formatDateLabel(range.startDate),
          end: formatDateLabel(range.endDate),
        },
      });
    }
    return $t('overview.last_7_days');
  }

  function selectPreset(preset: RangePreset) {
    selectedPreset = preset;
    const bounds = presetDateBounds(preset);
    customStartDate = bounds.startDate;
    customEndDate = bounds.endDate;
    const range = presetDateRange(preset);
    if (range.startDate && range.endDate) {
      appliedRange = { preset, startDate: range.startDate, endDate: range.endDate };
      return;
    }
    appliedRange = { preset, days: range.days ?? 7 };
  }

  function markCustomEditing() {
    selectedPreset = 'custom';
  }

  function applyCustomRange() {
    if (customRangeError) return;
    appliedRange = {
      preset: 'custom',
      startDate: customStartDate,
      endDate: customEndDate,
    };
  }

  async function loadOverview(range: AppliedRange) {
    loading = true;
    err = "";
    try {
      overview = await api.overview(range);
      if (overview.devices) {
        $deviceStore = overview.devices;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith('404')) {
        goto('/not-a-participant');
        return;
      }
      err = msg;
    } finally {
      loading = false;
    }
  }

  customStartDate = todayInputValue();
  customEndDate = todayInputValue();

  // Reload when period changes
  $effect(() => {
    const range = appliedRange;
    loadOverview(range);
  });

  onMount(async () => {
    // Load weather, suggestions and CO2 settings in background
    api.weather().then(w => { weatherData = w; }).catch(() => {}).finally(() => { weatherLoading = false; });
    api.suggestions().then(s => { suggestions = s; }).catch(() => {}).finally(() => { suggestionsLoading = false; });
    api.co2Settings().then(s => { co2Settings = s.current; }).catch(() => {});
    api.gamification().then(g => { gamification = g; }).catch(() => {}).finally(() => { gamificationLoading = false; });
  });

  const maxDate = $derived(todayInputValue());
  const customRangeError = $derived(validateCustomRange(customStartDate, customEndDate));
  const periodLabel = $derived(rangeDisplayLabel(appliedRange));

</script>

<section class="overview">
  <!-- Welcome header -->
  <header class="page-header">
    <h1 class="page-title">
      {#if me?.user?.name}
        {$t('overview.welcome', { values: { name: me.user.name.split(' ')[0] } })}
      {:else}
        {$t('overview.welcome_generic')}
      {/if}
    </h1>
    <p class="page-subtitle">{engagingPhrase()}</p>
  </header>

  <!-- Flexibility opportunities teaser (with anchor link to /suggestions#opportunities) -->
  {#if !suggestionsLoading && suggestions.length > 0}
    {@const maxPoints = suggestions.reduce((s, i) => (i.reward_points ?? 0), 0)}
    <div class="flex-teaser">
      <Icon name="zap" size={18} />
      <div class="flex-teaser-body">
        <strong>{$t('overview.flex_teaser', { values: { count: suggestions.length } })}</strong>
        {$t('overview.earn_up_to', { values: { points: maxPoints } })}
      </div>
      <a href="/suggestions#opportunities" class="flex-teaser-link">{$t('overview.view')}</a>
    </div>
  {/if}

  {#if !$deviceStore || $deviceStore.length === 0}
    <div class="rec-alert rec-alert--warning" role="status" aria-live="polite">
      <Icon name="alert-triangle" size={20} />
      <div>
        <strong>{$t('overview.no_smart_meter_title')}</strong>
        {$t('overview.no_smart_meter_body')}
        <a href="/no-smart-meter" class="alert-link">{$t('overview.learn_more')}</a>
      </div>
    </div>
  {/if}

  <!-- Your Progress (first data block) -->
  <section class="section-card" data-tour="overview-progress">
    <header class="section-header">
      <Icon name="trophy" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.progress_title')}</h2>
        <p class="section-period">{$t('suggestions.progress_period')}</p>
      </div>
    </header>
    <GamificationPanel data={gamification} loading={gamificationLoading} />
  </section>

  <!-- Period filter -->
  <div class="period-filter" data-tour="period-toggle">
    <div class="period-filter-main">
      <Icon name="calendar" size={18} class="period-filter-icon" />
      <div class="period-toggle" aria-label={$t('overview.date_filter_presets')}>
        {#each presetOptions as preset}
          <button
            class="period-btn"
            class:active={selectedPreset === preset.key}
            onclick={() => selectPreset(preset.key)}
          >{$t(preset.labelKey)}</button>
        {/each}
      </div>
    </div>
    <div class="custom-date-filter">
      <label>
        <span>{$t('overview.date_filter_from')}</span>
        <input
          type="date"
          bind:value={customStartDate}
          max={maxDate}
          oninput={markCustomEditing}
        />
      </label>
      <label>
        <span>{$t('overview.date_filter_to')}</span>
        <input
          type="date"
          bind:value={customEndDate}
          max={maxDate}
          oninput={markCustomEditing}
        />
      </label>
      <button
        class="apply-date-btn"
        disabled={!!customRangeError}
        onclick={applyCustomRange}
      >
        <Icon name="check" size={14} />
        {$t('overview.date_filter_apply')}
      </button>
    </div>
    {#if selectedPreset === 'custom' && customRangeError}
      <p class="date-filter-error">{customRangeError}</p>
    {/if}
  </div>

  {#if loading}
    <!-- Loading skeletons -->
    <div class="section-card">
      <Skeleton variant="heading" width="50%" />
      <div class="stats-grid" style="margin-top: var(--celine-space-lg);">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    </div>
    <div class="section-card" style="margin-top: var(--celine-space-lg);">
      <Skeleton variant="heading" width="40%" />
      <div style="margin-top: var(--celine-space-lg);">
        <Skeleton variant="rect" height="280px" />
      </div>
    </div>
  {:else if err}
    <div class="rec-alert rec-alert--danger" role="alert">
      <Icon name="x-circle" size={20} />
      <div>
        <strong>{$t('overview.error_loading')}</strong>
        <p style="margin: 0.25rem 0 0;">{err}</p>
      </div>
    </div>
  {:else if overview}

    <!-- Combined User + REC contribution section -->
    <section class="section-card" data-tour="overview-contribution">
      <header class="section-header">
        <Icon name="zap" size={22} class="section-icon" />
        <div>
          <div class="section-title-row">
            <h2 class="section-title">{$t('overview.your_contribution')}</h2>
            <details class="contribution-info">
              <summary
                class="contribution-info-trigger"
                aria-label={$t('overview.contribution_info_label')}
                title={$t('overview.contribution_info_label')}
              >
                <Icon name="info" size={14} />
              </summary>
              <div class="contribution-info-panel" role="note">
                <p class="contribution-info-title">{$t('overview.contribution_info.title')}</p>
                <dl class="contribution-info-list">
                  <div>
                    <dt>{$t('overview.consumption')}</dt>
                    <dd>{$t('overview.contribution_info.consumption')}</dd>
                  </div>
                  <div>
                    <dt>{$t('overview.production')}</dt>
                    <dd>{$t('overview.contribution_info.production')}</dd>
                  </div>
                  <div>
                    <dt>{$t('overview.self_consumption')}</dt>
                    <dd>{$t('overview.contribution_info.self_consumption')}</dd>
                  </div>
                  <div>
                    <dt>{$t('overview.sc_rate')}</dt>
                    <dd>{$t('overview.contribution_info.sc_rate')}</dd>
                  </div>
                </dl>
                <p class="contribution-info-note">{$t('overview.contribution_info.sensors_note')}</p>
              </div>
            </details>
          </div>
          <p class="section-period">{periodLabel}</p>
        </div>
        <span data-tour="ask-ai">
        <AskAssistantButton
          iconOnly
          prompt={assistantPrompt("user-contribution")}
          href={buildAssistantHref(
            assistantPrompt("user-contribution"),
            "user-contribution",
          )}
        />
        </span>
      </header>

      <div class="contribution-grid">
        <!-- User column -->
        <div class="contribution-col">
          <p class="contribution-label">{$t('overview.your_contribution')}</p>
          {#if hasUserData(overview.user)}
            <div class="stats-grid">
              <StatCard
                label={$t('overview.consumption')}
                value={fmtKwh(overview.user.consumption_kwh).value}
                unit={fmtKwh(overview.user.consumption_kwh).unit}
                variant="consumption"
                icon="plug"
              />
              <StatCard
                label={$t('overview.production')}
                value={fmtKwh(overview.user.production_kwh).value}
                unit={fmtKwh(overview.user.production_kwh).unit}
                variant="production"
                icon="zap"
              />
              <StatCard
                label={$t('overview.self_consumption')}
                value={fmtKwh(overview.user.self_consumption_kwh).value}
                unit={fmtKwh(overview.user.self_consumption_kwh).unit}
                variant="self-consumption"
                icon="battery-charging"
                subtext={overview.user.self_consumption_rate != null
                  ? $t('overview.pct_of_consumption', { values: { pct: fmtPct(overview.user.self_consumption_rate) } })
                  : ""}
              />
            </div>
          {:else}
            <div class="empty-state">
              <Icon name="activity" size={32} class="empty-icon" />
              <p class="empty-title">{$t('overview.no_personal_data_title')}</p>
              <p class="empty-text">{$t('overview.no_personal_data_body')}</p>
            </div>
          {/if}
        </div>

        <div class="contribution-divider"></div>

        <!-- REC column -->
        <div class="contribution-col">
          <p class="contribution-label">{$t('overview.community_totals')}</p>
          {#if hasRecData(overview.rec)}
            <div class="stats-grid stats-grid--2">
              <StatCard
                label={$t('overview.production')}
                value={fmtKwh(overview.rec.production_kwh).value}
                unit={fmtKwh(overview.rec.production_kwh).unit}
                variant="production"
                icon="zap"
              />
              <StatCard
                label={$t('overview.self_consumed')}
                value={fmtKwh(overview.rec.self_consumption_kwh).value}
                unit={fmtKwh(overview.rec.self_consumption_kwh).unit}
                variant="self-consumption"
                icon="battery-charging"
              />
              <StatCard
                label={$t('overview.consumption')}
                value={fmtKwh(overview.rec.consumption_kwh).value}
                unit={fmtKwh(overview.rec.consumption_kwh).unit}
                variant="consumption"
                icon="plug"
              />
              <StatCard
                label={$t('overview.sc_rate')}
                value={fmtPct(overview.rec.self_consumption_rate)}
                unit=""
                variant="self-consumption"
                icon="activity"
              />
            </div>
          {:else}
            <div class="empty-state">
              <Icon name="leaf" size={32} class="empty-icon" />
              <p class="empty-title">{$t('overview.no_community_title')}</p>
            </div>
          {/if}
        </div>
      </div>
    </section>

    <!-- Trends (tabbed: Yours / Community) -->
    <section class="section-card" data-tour="overview-trends">
      <header class="section-header">
        <Icon name="trending-up" size={22} class="section-icon" />
        <div>
          <h2 class="section-title">{$t('overview.trends_title')}</h2>
          <p class="section-period">{periodLabel}</p>
        </div>
        <AskAssistantButton
          iconOnly
          prompt={assistantPrompt("community-trend")}
          href={buildAssistantHref(assistantPrompt("community-trend"), "community-trend")}
        />
      </header>

      <!-- Tab bar -->
      <div class="trend-tabs">
        <button
          class="trend-tab"
          class:trend-tab--active={trendTab === 'yours'}
          onclick={() => trendTab = 'yours'}
        >{$t('overview.trends_tab_yours')}</button>
        <button
          class="trend-tab"
          class:trend-tab--active={trendTab === 'community'}
          onclick={() => trendTab = 'community'}
        >{$t('overview.trends_tab_community')}</button>
      </div>

      {#if trendTab === 'yours'}
        <!-- Per-device trend: user grid import + export + shared energy -->
        {#if overview.user_trend && overview.user_trend.some(d => d.consumption_kwh !== null || d.production_kwh !== null)}
          <div class="chart-container">
            <EnergyChart data={overview.user_trend} height="280px" />
          </div>
        {:else}
          <div class="empty-state">
            <Icon name="activity" size={40} class="empty-icon" />
            <p class="empty-title">{$t('overview.no_personal_data_title')}</p>
            <p class="empty-text">{$t('overview.no_personal_data_body')}</p>
          </div>
        {/if}

      {:else}
        <!-- Community time-series chart -->
        {#if overview.trend.length > 0}
          <div class="chart-container">
            <EnergyChart data={overview.trend} height="280px" />
          </div>
        {:else}
          <div class="empty-state">
            <Icon name="activity" size={40} class="empty-icon" />
            <p class="empty-title">{$t('overview.no_trend_title')}</p>
            <p class="empty-text">{$t('overview.no_trend_body')}</p>
          </div>
        {/if}
      {/if}
    </section>

    <!-- Weather + CO2 Impact row -->
    <div class="weather-impact-row">
      <!-- Weather section -->
      <section class="section-card weather-impact-col">
        <header class="section-header">
          <Icon name="sun" size={22} class="section-icon" />
          <div>
            <h2 class="section-title">{$t('overview.weather_section_title')}</h2>
            <p class="section-period">{$t('overview.weather_section_period')}</p>
          </div>
          <AskAssistantButton
            iconOnly
            prompt={assistantPrompt("weather")}
            href={buildAssistantHref(
              assistantPrompt("weather"),
              "weather",
            )}
          />
        </header>
        <WeatherWidget data={weatherData} loading={weatherLoading} />
      </section>

      <!-- CO2 Impact section -->
      {#if co2Settings && overview.rec.production_kwh != null && overview.rec.production_kwh > 0}
        {@const co2Kg = calcCo2Kg(overview.rec.production_kwh, co2Settings.kg_per_kwh)}
        {@const trees = calcTrees(co2Kg, co2Settings.trees_per_ton)}
        <section class="section-card co2-card weather-impact-col">
          <header class="section-header">
            <Icon name="leaf" size={22} class="section-icon" />
            <div>
              <h2 class="section-title">{$t('overview.co2_section_title')}</h2>
              <p class="section-period">{periodLabel}</p>
            </div>
            <AskAssistantButton
              iconOnly
              prompt={assistantPrompt("co2")}
              href={buildAssistantHref(
                assistantPrompt("co2"),
                "co2",
              )}
            />
          </header>
          <div class="co2-stats">
            <div class="co2-stat">
              <span class="co2-value">{co2Kg < 1000 ? co2Kg.toFixed(1) : (co2Kg / 1000).toFixed(2) + ' t'}</span>
              <span class="co2-unit">{co2Kg < 1000 ? 'kg' : ''} CO₂</span>
              <span class="co2-label">{$t('overview.co2_saved', { values: { kg: '' } }).replace('{kg} ', '')}</span>
            </div>
            <div class="co2-sep">≈</div>
            <div class="co2-stat co2-stat--trees">
              <span class="co2-value">{trees < 1 ? '<1' : trees.toFixed(trees < 10 ? 1 : 0)}</span>
              <span class="co2-unit">🌳</span>
              <span class="co2-label">{$t('overview.co2_trees', { values: { trees: '' } }).replace('{trees} ', '')}</span>
            </div>
          </div>
          <p class="co2-context">{$t('overview.co2_context')}</p>
        </section>
      {/if}
    </div>

  {/if}
</section>

<style>
  .overview {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-lg);
  }

  /* Page Header */
  .page-header { margin-bottom: var(--celine-space-sm); }

  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--celine-text);
    margin: 0 0 var(--celine-space-xs);
    line-height: 1.2;
  }

  .page-subtitle {
    font-size: 0.9375rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  /* Period filter */
  .period-filter {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-xs);
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    padding: 0.625rem var(--celine-space-sm);
  }

  .period-filter-main {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    min-width: 0;
  }

  :global(.period-filter-icon) {
    color: var(--celine-primary);
    flex: none;
  }

  .period-toggle {
    display: flex;
    flex-wrap: wrap;
    gap: var(--celine-space-xs);
    min-width: 0;
  }

  .period-btn {
    min-height: 32px;
    padding: 0.1875rem 0.6875rem;
    border-radius: var(--celine-radius-full, 999px);
    border: 1px solid transparent;
    background: transparent;
    color: var(--celine-text-secondary);
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .period-btn.active {
    background: var(--celine-primary);
    border-color: var(--celine-primary);
    color: #fff;
  }

  .period-btn:not(.active):hover {
    color: var(--celine-text);
    background: var(--celine-bg-hover);
  }

  .custom-date-filter {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--celine-space-xs);
  }

  .custom-date-filter label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .custom-date-filter span {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--celine-text-secondary);
  }

  .custom-date-filter input {
    width: 100%;
    min-height: 34px;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    background: var(--celine-bg);
    color: var(--celine-text);
    font: inherit;
    font-size: 0.875rem;
    padding: 0.25rem 0.5rem;
  }

  .custom-date-filter input:focus {
    outline: 2px solid var(--celine-primary);
    outline-offset: 1px;
  }

  .apply-date-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: 34px;
    padding: 0.25rem 0.75rem;
    align-self: end;
    border: 1px solid var(--celine-primary);
    border-radius: var(--celine-radius-sm);
    background: var(--celine-primary);
    color: #fff;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--celine-transition-fast),
      border-color var(--celine-transition-fast),
      opacity var(--celine-transition-fast);
  }

  .apply-date-btn:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .date-filter-error {
    margin: 0;
    color: var(--celine-danger-text);
    font-size: 0.8125rem;
  }

  /* Flex teaser */
  .flex-teaser {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    background: var(--celine-primary-bg, rgba(99,102,241,0.08));
    border: 1px solid var(--celine-primary);
    border-radius: var(--celine-radius-md);
    padding: var(--celine-space-sm) var(--celine-space-md);
    color: var(--celine-text);
    font-size: 0.875rem;
  }
  .flex-teaser-body { flex: 1; }
  .flex-teaser-link {
    font-weight: 600;
    color: var(--celine-primary);
    text-decoration: none;
    white-space: nowrap;
  }
  .flex-teaser-link:hover { text-decoration: underline; }

  /* Alert */
  .rec-alert {
    display: flex;
    align-items: flex-start;
    gap: var(--celine-space-sm);
    padding: var(--celine-space-md);
    border-radius: var(--celine-radius-md);
  }

  .rec-alert--warning {
    background: var(--celine-warning-bg);
    color: var(--celine-warning-text);
  }

  .rec-alert--danger {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  .alert-link {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .alert-link:hover { text-decoration: none; }

  /* Section Card */
  .section-card {
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-md);
  }

  .section-header {
    display: flex;
    align-items: flex-start;
    gap: var(--celine-space-sm);
    margin-bottom: var(--celine-space-lg);
  }

  .section-header > div { flex: 1; }

  :global(.section-icon) {
    color: var(--celine-primary);
    margin-top: 2px;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--celine-text);
    margin: 0;
    line-height: 1.3;
  }

  .section-title-row {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
    min-width: 0;
  }

  .contribution-info {
    position: relative;
    flex: none;
  }

  .contribution-info-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 1px solid var(--celine-border);
    border-radius: 50%;
    background: var(--celine-bg-sunken);
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition:
      background var(--celine-transition-fast),
      border-color var(--celine-transition-fast),
      color var(--celine-transition-fast);
  }

  .contribution-info-trigger::-webkit-details-marker {
    display: none;
  }

  .contribution-info-trigger::marker {
    content: "";
  }

  .contribution-info-trigger:hover,
  .contribution-info[open] .contribution-info-trigger {
    background: var(--celine-primary-bg, var(--celine-bg-elevated));
    border-color: var(--celine-primary);
    color: var(--celine-primary);
  }

  .contribution-info-trigger:focus-visible {
    outline: 2px solid var(--celine-primary);
    outline-offset: 2px;
  }

  .contribution-info-panel {
    position: absolute;
    z-index: 20;
    top: calc(100% + 8px);
    left: 0;
    width: min(82vw, 360px);
    padding: var(--celine-space-md);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    background: var(--celine-bg-elevated);
    box-shadow: var(--celine-shadow-lg);
    color: var(--celine-text);
  }

  .contribution-info-title {
    margin: 0 0 var(--celine-space-sm);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .contribution-info-list {
    display: grid;
    gap: var(--celine-space-xs);
    margin: 0;
  }

  .contribution-info-list div {
    display: grid;
    gap: 2px;
  }

  .contribution-info-list dt {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--celine-text);
  }

  .contribution-info-list dd,
  .contribution-info-note {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.4;
    color: var(--celine-text-secondary);
  }

  .contribution-info-note {
    margin-top: var(--celine-space-sm);
    padding-top: var(--celine-space-sm);
    border-top: 1px solid var(--celine-border);
  }

  .section-period {
    font-size: 0.8125rem;
    color: var(--celine-text-tertiary);
    margin: 2px 0 0;
  }

  /* Combined contribution grid */
  .contribution-grid {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-lg);
  }

  .contribution-divider {
    height: 1px;
    background: var(--celine-border);
  }

  .contribution-col { display: flex; flex-direction: column; gap: var(--celine-space-md); }

  .contribution-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  /* Stats Grid — 2 columns on mobile to avoid a long vertical list */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--celine-space-sm);
  }

  /* If the last card is alone in a row (odd total), span full width */
  .stats-grid > :global(:last-child:nth-child(odd)) {
    grid-column: 1 / -1;
  }

  /* CO2 card */
  .co2-card {
    background: linear-gradient(135deg, var(--celine-bg-elevated) 0%, rgba(16,185,129,0.04) 100%);
    border-color: rgba(16,185,129,0.25);
  }

  .co2-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--celine-space-lg);
    padding: var(--celine-space-md) 0;
  }

  .co2-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .co2-value {
    font-size: 2rem;
    font-weight: 800;
    color: var(--celine-success, #10b981);
    line-height: 1;
  }

  .co2-unit {
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    font-weight: 500;
  }

  .co2-label {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
  }

  .co2-stat--trees .co2-value {
    color: var(--celine-text);
  }

  .co2-sep {
    font-size: 1.5rem;
    color: var(--celine-text-tertiary);
    font-weight: 300;
  }

  .co2-context {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
    margin: var(--celine-space-xs) 0 0;
    text-align: center;
  }

  /* Weather + Impact row */
  .weather-impact-row {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-lg);
  }

  .weather-impact-col {
    flex: 1;
    min-width: 0;
  }

  /* Chart */
  .chart-container { margin-top: var(--celine-space-sm); }

  /* Trend tabs */
  .trend-tabs {
    display: flex;
    gap: var(--celine-space-xs);
    margin-bottom: var(--celine-space-md);
    border-bottom: 1px solid var(--celine-border);
    padding-bottom: 0;
  }

  .trend-tab {
    padding: var(--celine-space-xs) var(--celine-space-md);
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--celine-text-secondary);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    transition: color var(--celine-transition-fast), border-color var(--celine-transition-fast);
  }

  .trend-tab:hover { color: var(--celine-text); }

  .trend-tab--active {
    color: var(--celine-primary);
    border-bottom-color: var(--celine-primary);
  }

  /* Empty State */
  .empty-state { text-align: center; padding: var(--celine-space-xl) var(--celine-space-md); }
  :global(.empty-icon) { color: var(--celine-text-tertiary); opacity: 0.5; margin-bottom: var(--celine-space-sm); }
  .empty-title { font-size: 0.9375rem; font-weight: 600; color: var(--celine-text); margin: 0 0 var(--celine-space-xs); }
  .empty-text { font-size: 0.875rem; color: var(--celine-text-secondary); margin: 0; }

  /* Responsive */
  @media (min-width: 640px) {
    .section-card { padding: var(--celine-space-lg); }
    .page-title { font-size: 1.75rem; }
    .stats-grid { gap: var(--celine-space-md); }

    .period-filter {
      padding: 0.625rem var(--celine-space-md);
    }

    .custom-date-filter {
      grid-template-columns: max-content max-content auto;
      align-items: center;
      justify-content: start;
    }

    .custom-date-filter label {
      flex-direction: row;
      align-items: center;
      gap: 0.375rem;
    }

    .custom-date-filter input {
      width: 145px;
    }

    .apply-date-btn {
      align-self: center;
    }
  }

  @media (min-width: 768px) {
    .section-card { padding: var(--celine-space-xl); }
    .section-title { font-size: 1.125rem; }

    .weather-impact-row {
      flex-direction: row;
      align-items: stretch;
    }

    /* Side-by-side contribution layout only at 768px+ where there's enough room */
    .contribution-grid {
      flex-direction: row;
      align-items: flex-start;
    }

    .contribution-divider {
      width: 1px;
      height: auto;
      align-self: stretch;
    }

    .contribution-col { flex: 1; }

    /* Inside a half-width column, 2 cols is plenty — 3 would be too cramped */
    .contribution-col .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .period-filter {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .custom-date-filter {
      flex: none;
      justify-content: end;
    }
  }
</style>
