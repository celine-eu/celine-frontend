<script lang="ts">
  import { api, type Overview, type WeatherResponse, type SuggestionItem, type Co2LocaleSettings, type GamificationResponse } from "$lib/api";
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

  // Period toggle: 7 or 30 days
  let selectedDays = $state(7);

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

  async function loadOverview() {
    loading = true;
    err = "";
    try {
      overview = await api.overview(selectedDays);
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

  // Reload when period changes
  $effect(() => {
    selectedDays;
    loadOverview();
  });

  onMount(async () => {
    // Load weather, suggestions and CO2 settings in background
    api.weather().then(w => { weatherData = w; }).catch(() => {}).finally(() => { weatherLoading = false; });
    api.suggestions().then(s => { suggestions = s; }).catch(() => {}).finally(() => { suggestionsLoading = false; });
    api.co2Settings().then(s => { co2Settings = s.current; }).catch(() => {});
    api.gamification().then(g => { gamification = g; }).catch(() => {}).finally(() => { gamificationLoading = false; });
  });

  const periodLabel = $derived(selectedDays === 7 ? $t('overview.last_7_days') : $t('overview.last_30_days'));

  /**
   * User trend augmented with community production potential.
   * Community production is normalized so it never exceeds 115% of the user's
   * highest value — prevents the community scale from dwarfing personal data.
   */
  const userTrendWithPotential = $derived.by(() => {
    const ut = overview?.user_trend;
    const ct = overview?.trend;
    if (!ut || ut.length === 0) return ut ?? [];

    // Max of user's own values (consumption + self-consumption)
    const maxUser = Math.max(
      0,
      ...ut.map(d => Math.max(d.consumption_kwh ?? 0, d.self_consumption_kwh ?? 0))
    );

    const commByDate = new Map((ct ?? []).map(d => [d.date, d]));

    // Only normalize if community production exceeds the ceiling
    const ceiling = maxUser * 1.15;
    const maxComm = Math.max(
      0,
      ...(ct ?? []).map(d => d.production_kwh ?? 0)
    );
    const scale = maxComm > ceiling && ceiling > 0 ? ceiling / maxComm : 1;

    return ut.map(d => ({
      ...d,
      production_kwh: (() => {
        const comm = commByDate.get(d.date);
        if (!comm || comm.production_kwh == null) return null;
        return comm.production_kwh * scale;
      })(),
    }));
  });
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
    {@const maxPoints = suggestions.reduce((s, i) => s + i.reward_points, 0)}
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

  <!-- Period toggle -->
  <div class="period-toggle" data-tour="period-toggle">
    <button
      class="period-btn"
      class:active={selectedDays === 7}
      onclick={() => selectedDays = 7}
    >{$t('overview.period_7d')}</button>
    <button
      class="period-btn"
      class:active={selectedDays === 30}
      onclick={() => selectedDays = 30}
    >{$t('overview.period_30d')}</button>
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
          <h2 class="section-title">{$t('overview.your_contribution')}</h2>
          <p class="section-period">{periodLabel}</p>
        </div>
        <span data-tour="ask-ai">
        <AskAssistantButton
          iconOnly
          context={{
            page: "overview",
            section: "user-contribution",
            data: { user: overview.user, rec: overview.rec },
          }}
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
          context={{ page: "overview", section: "community-trend", data: { trend: overview.trend } }}
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
        <!-- Per-device trend: user consumption + self-consumption + normalized community potential -->
        {#if userTrendWithPotential && userTrendWithPotential.some(d => d.consumption_kwh !== null)}
          <div class="chart-container">
            <EnergyChart
              data={userTrendWithPotential}
              height="280px"
              datasetLabels={{ production: $t('chart.community_potential') }}
            />
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

    <!-- Weather section (moved from /suggestions, appears later in page) -->
    <section class="section-card">
      <header class="section-header">
        <Icon name="sun" size={22} class="section-icon" />
        <div>
          <h2 class="section-title">{$t('overview.weather_section_title')}</h2>
          <p class="section-period">{$t('overview.weather_section_period')}</p>
        </div>
        <AskAssistantButton
          iconOnly
          context={{ page: "overview", section: "weather" }}
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
      <section class="section-card co2-card">
        <header class="section-header">
          <Icon name="leaf" size={22} class="section-icon" />
          <div>
            <h2 class="section-title">{$t('overview.co2_section_title')}</h2>
            <p class="section-period">{periodLabel}</p>
          </div>
          <AskAssistantButton
            iconOnly
            context={{ page: "overview", section: "co2", data: { co2_kg: co2Kg, trees } }}
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

  /* Period toggle */
  .period-toggle {
    display: flex;
    gap: var(--celine-space-xs);
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-full, 999px);
    padding: 3px;
    width: fit-content;
  }

  .period-btn {
    padding: 0.25rem 0.875rem;
    border-radius: var(--celine-radius-full, 999px);
    border: none;
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
    color: #fff;
  }

  .period-btn:not(.active):hover {
    color: var(--celine-text);
    background: var(--celine-bg-hover);
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
  }

  @media (min-width: 768px) {
    .section-card { padding: var(--celine-space-xl); }
    .section-title { font-size: 1.125rem; }

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
</style>
