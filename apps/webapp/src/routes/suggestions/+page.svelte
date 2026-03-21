<script lang="ts">
  import { api, type WeatherResponse, type ForecastResponse, type SuggestionItem, type GamificationResponse } from '$lib/api';
  import { WeatherWidget, ForecastCard, SuggestionCard, GamificationPanel } from '$lib/components';
  import { Icon, Skeleton } from '@celine-eu/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let weatherData = $state<WeatherResponse | null>(null);
  let weatherLoading = $state(true);

  let forecastData = $state<ForecastResponse | null>(null);
  let forecastLoading = $state(true);

  let suggestions = $state<SuggestionItem[]>([]);
  let suggestionsLoading = $state(true);

  let gamification = $state<GamificationResponse | null>(null);
  let gamificationLoading = $state(true);

  function handleGamificationUpdated(data: GamificationResponse) {
    gamification = data;
  }

  onMount(async () => {
    const [w, f, s, g] = await Promise.allSettled([
      api.weather(),
      api.forecast(),
      api.suggestions(),
      api.gamification(),
    ]);

    if (w.status === 'fulfilled') weatherData = w.value;
    weatherLoading = false;

    if (f.status === 'fulfilled') forecastData = f.value;
    forecastLoading = false;

    if (s.status === 'fulfilled') suggestions = s.value;
    suggestionsLoading = false;

    if (g.status === 'fulfilled') gamification = g.value;
    gamificationLoading = false;
  });
</script>

<section class="suggestions-page">
  <header class="page-header">
    <h1 class="page-title">{$t('suggestions.title')}</h1>
    <p class="page-subtitle">{$t('suggestions.subtitle')}</p>
  </header>

  <!-- Weather context -->
  <section class="section-card">
    <header class="section-header">
      <Icon name="sun" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.weather_section_title')}</h2>
        <p class="section-period">{$t('suggestions.weather_section_period')}</p>
      </div>
    </header>
    <WeatherWidget data={weatherData} loading={weatherLoading} />
  </section>

  <!-- 48h energy outlook -->
  <section class="section-card">
    <header class="section-header">
      <Icon name="activity" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.forecast_section_title')}</h2>
        <p class="section-period">{$t('suggestions.forecast_section_period')}</p>
      </div>
    </header>
    <ForecastCard data={forecastData} loading={forecastLoading} />
  </section>

  <!-- Suggestions -->
  <section class="section-card">
    <header class="section-header">
      <Icon name="zap" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.opportunities_title')}</h2>
        <p class="section-period">{$t('suggestions.opportunities_period')}</p>
      </div>
    </header>

    {#if suggestionsLoading}
      <div class="suggestions-list">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    {:else if suggestions.length > 0}
      <div class="suggestions-list">
        {#each suggestions as suggestion (suggestion.id)}
          <SuggestionCard
            {suggestion}
            ongamificationupdated={handleGamificationUpdated}
          />
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <Icon name="sun" size={40} class="empty-icon" />
        <p class="empty-title">{$t('suggestions.no_opportunities_title')}</p>
        <p class="empty-text">{$t('suggestions.no_opportunities_body')}</p>
      </div>
    {/if}
  </section>

  <!-- Gamification -->
  <section class="section-card">
    <header class="section-header">
      <Icon name="trending-up" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.progress_title')}</h2>
        <p class="section-period">{$t('suggestions.progress_period')}</p>
      </div>
    </header>
    <GamificationPanel data={gamification} loading={gamificationLoading} />
  </section>
</section>

<style>
  .suggestions-page {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-lg);
  }

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
  :global(.section-icon) { color: var(--celine-primary); margin-top: 2px; }
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

  .suggestions-list {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  .empty-state {
    text-align: center;
    padding: var(--celine-space-xl) var(--celine-space-md);
  }
  :global(.empty-icon) {
    color: var(--celine-text-tertiary);
    opacity: 0.5;
    margin-bottom: var(--celine-space-sm);
  }
  .empty-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--celine-text);
    margin: 0 0 var(--celine-space-xs);
  }
  .empty-text {
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  @media (min-width: 640px) {
    .section-card { padding: var(--celine-space-lg); }
    .page-title { font-size: 1.75rem; }
  }

  @media (min-width: 768px) {
    .section-card { padding: var(--celine-space-xl); }
    .section-title { font-size: 1.125rem; }
  }
</style>
