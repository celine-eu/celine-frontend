<script lang="ts">
  import type { WeatherResponse, WeatherDayItem, WeatherAlertItem } from '$lib/api';
  import { Icon, Skeleton } from '@celine-eu/ui';
  import { t, locale } from 'svelte-i18n';

  interface Props {
    data: WeatherResponse | null;
    loading?: boolean;
    compact?: boolean;
  }

  let { data, loading = false, compact = false }: Props = $props();

  const WEATHER_EMOJI: Record<string, string> = {
    // OWM codes (legacy / other providers)
    Clear: '☀️',
    Clouds: '☁️',
    Rain: '🌧️',
    Drizzle: '🌦️',
    Thunderstorm: '⛈️',
    Snow: '❄️',
    Mist: '🌫️',
    Fog: '🌫️',
    Haze: '🌫️',
    Smoke: '🌫️',
    Dust: '🌪️',
    Sand: '🌪️',
    Ash: '🌋',
    Squall: '💨',
    Tornado: '🌪️',
    // MeteoTrentino name_eng values
    'Clear sky': '☀️',
    'Sunny': '🌤️',
    'Partly cloudy': '⛅',
    'Mostly cloudy': '🌥️',
    'Cloudy': '☁️',
    'Showers': '🌦️',
    'Heavy showers': '🌧️',
    'Moderate rainfall': '🌧️',
    'Heavy rainfall': '🌧️',
    'Light rainfall': '🌦️',
    'Light showers': '🌦️',
    'Light snow and sun': '🌨️',
    'Snow and sun': '🌨️',
    'Light snow': '🌨️',
    'Moderate snow': '❄️',
    'Heavy snow': '❄️',
    'Wet snow and sun': '🌨️',
    'Wet snow': '🌨️',
    'Mountain haze': '🌫️',
    'Unstable': '🌦️',
    'Unstable with wet snow': '🌨️',
    'Wet snow thunderstorm': '⛈️',
    'Unstable with snow thunderstorm': '⛈️',
    'Snow thunderstorm': '⛈️',
  };

  function weatherEmoji(main: string): string {
    return WEATHER_EMOJI[main] ?? '🌡️';
  }

  /** Parse YYYY-MM-DD as UTC noon — same calendar date in all timezones (UTC-12 to UTC+14) */
  function parseLocalDate(dateStr: string): Date {
    return new Date(dateStr + 'T12:00:00Z');
  }

  function shortDay(dateStr: string): string {
    return parseLocalDate(dateStr).toLocaleDateString($locale ?? undefined, { weekday: 'short' });
  }

  function safeTemp(temp: number | null | undefined): string {
    if (temp == null || temp < -50 || temp > 60) return '—';
    return temp.toFixed(0);
  }

  function irradianceDay(dateStr: string | null | undefined): string {
    if (!dateStr) return $t('weather.today');
    return parseLocalDate(dateStr).toLocaleDateString($locale ?? undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  const todayDaily = $derived(data?.daily?.[0] ?? null);
  const forecastDays = $derived(data?.daily?.slice(1, 6) ?? []);

  /** Resolved current temperature: prefer live current, fall back to daily */
  const currentTemp = $derived.by(() => {
    if (data?.current?.temp != null) return data.current.temp;
    if (todayDaily?.temp_day != null) return todayDaily.temp_day;
    if (todayDaily?.temp_min != null && todayDaily?.temp_max != null)
      return (todayDaily.temp_min + todayDaily.temp_max) / 2;
    return null;
  });

  let alertsExpanded = $state<Record<number, boolean>>({});

  // Deduplicate alerts by event + start_ts to avoid showing duplicates from multiple sources
  const uniqueAlerts = $derived.by(() => {
    if (!data?.alerts) return [];
    const seen = new Set<string>();
    return data.alerts.filter(a => {
      const key = `${a.event}__${a.start_ts}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });
</script>

{#if compact}
  <!-- Compact single-row mode for dashboard -->
  <div class="weather-compact">
    {#if loading}
      <Skeleton variant="text" width="120px" />
    {:else if data?.current || todayDaily}
      {@const main = data?.current?.weather_main ?? todayDaily?.weather_main ?? ''}
      <span class="weather-emoji-sm" aria-label={main}>{weatherEmoji(main)}</span>
      {#if currentTemp != null}<span class="compact-temp">{safeTemp(currentTemp)}°C</span>{/if}
      <span class="compact-desc">{data?.current?.weather_description ?? todayDaily?.weather_description ?? ''}</span>
      {#if data?.alerts && data.alerts.length > 0}
        <span class="alert-badge" title={data.alerts[0].event}>
          <Icon name="alert-triangle" size={14} />
        </span>
      {/if}
    {:else}
      <span class="no-data">—</span>
    {/if}
  </div>
{:else}
  <!-- Full widget -->
  <div class="weather-widget">
    {#if loading}
      <Skeleton variant="heading" width="60%" />
      <div style="margin-top: 1rem;">
        <Skeleton variant="rect" height="80px" />
      </div>
      <div style="margin-top: 1rem;">
        <Skeleton variant="rect" height="120px" />
      </div>
    {:else if data}
      <!-- Alert banner -->
      {#if uniqueAlerts.length > 0}
        <div class="alert-section">
          <p class="alert-section-title">
            <Icon name="alert-triangle" size={14} />
            {$t('weather.alerts_title')}
            {#if data.alerts && data.alerts.length > uniqueAlerts.length}
              <span class="alert-dedup-note">{$t('weather.alert_duplicate_note')}</span>
            {/if}
          </p>
          {#each uniqueAlerts as alert, i}
            <div class="alert-banner">
              <div class="alert-header">
                <strong>{alert.event}</strong>
                <button
                  class="alert-toggle"
                  onclick={() => alertsExpanded[i] = !alertsExpanded[i]}
                  aria-expanded={alertsExpanded[i] ?? false}
                >
                  <Icon name={alertsExpanded[i] ? 'chevron-up' : 'chevron-down'} size={14} />
                </button>
              </div>
              {#if alertsExpanded[i]}
                <p class="alert-description">{alert.description}</p>
                <p class="alert-meta">
                  {alert.sender_name ?? ''}{#if alert.end_ts} · {$t('weather.until')} {new Date(alert.end_ts).toLocaleString($locale ?? undefined)}{/if}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Today -->
      {#if data.current || todayDaily}
        {@const weather_main = data.current?.weather_main ?? todayDaily?.weather_main ?? ''}
        {@const weather_desc = data.current?.weather_description ?? todayDaily?.weather_description ?? ''}
        <div class="current-row">
          <div class="current-main">
            <span class="weather-emoji-lg" aria-label={weather_main}>{weatherEmoji(weather_main)}</span>
            <div>
              {#if currentTemp != null}
                <span class="current-temp">{safeTemp(currentTemp)}°C</span>
              {/if}
              <span class="current-desc">{weather_desc}</span>
              {#if todayDaily?.temp_min != null && todayDaily?.temp_max != null}
                <span class="current-range">{safeTemp(todayDaily.temp_min)}° / {safeTemp(todayDaily.temp_max)}°</span>
              {/if}
            </div>
          </div>
          <div class="current-chips">
            {#if data.current?.humidity}<span class="chip">💧 {data.current.humidity}%</span>{/if}
            {#if data.current?.uvi ?? todayDaily?.uvi}
              <span class="chip">☀️ {$t('weather.uv')} {(data.current?.uvi ?? todayDaily?.uvi ?? 0).toFixed(1)}</span>
            {/if}
            {#if data.current?.wind_speed_ms != null}<span class="chip">💨 {data.current.wind_speed_ms.toFixed(1)} m/s</span>
            {:else if data.current?.wind_deg}<span class="chip">💨 {data.current.wind_deg}°</span>{/if}
            {#if data.current?.clouds ?? todayDaily?.clouds}
              <span class="chip">☁️ {data.current?.clouds ?? todayDaily?.clouds}%</span>
            {/if}
            {#if (todayDaily?.pop ?? 0) > 0}
              <span class="chip">🌧️ {((todayDaily?.pop ?? 0) * 100).toFixed(0)}%</span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Forecast strip (next days, up to 5) -->
      {#if forecastDays.length > 0}
        <div class="daily-strip">
          {#each forecastDays as day}
            <div class="day-card">
              <span class="day-label">{shortDay(day.date)}</span>
              <span class="weather-emoji-md" aria-label={day.weather_main}>{weatherEmoji(day.weather_main)}</span>
              <span class="day-range">
                <span class="temp-max">{safeTemp(day.temp_max)}°</span>
                <span class="temp-min">{safeTemp(day.temp_min)}°</span>
              </span>
              {#if (day.pop ?? 0) > 0}
                <div class="rain-bar-wrap" title="{((day.pop ?? 0) * 100).toFixed(0)}% rain">
                  <div class="rain-bar" style="width: {((day.pop ?? 0) * 100).toFixed(0)}%"></div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- 24h irradiance chart -->
      {#if data.hourly_irradiance && data.hourly_irradiance.length > 0}
        <div class="irradiance-section">
          <p class="irradiance-label">
            {$t('weather.solar_potential', { values: { day: irradianceDay(data.irradiance_date) } })}
            {#if data.hourly_irradiance.some(i => i.shortwave_radiation === null)}
              <span class="irr-gap-note">{$t('weather.irradiance_gap_note')}</span>
            {/if}
          </p>
          <div class="irradiance-bars">
            {#each data.hourly_irradiance as item}
              {@const max = 1000}
              {@const rad = item.shortwave_radiation ?? 0}
              {@const pct = Math.min(100, (rad / max) * 100)}
              <div class="irr-bar-wrap" title="{rad.toFixed(0)} W/m²">
                <div class="irr-bar" style="height: {pct}%"></div>
                <span class="irr-label">{new Date(item.ts).getHours()}h</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <p class="no-data">{$t('weather.no_data')}</p>
    {/if}
  </div>
{/if}

<style>
  /* Compact */
  .weather-compact {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--celine-text);
  }
  .compact-temp { font-weight: 600; }
  .compact-desc { color: var(--celine-text-secondary); }
  .alert-badge { color: var(--celine-warning-text); display: flex; align-items: center; }

  /* Weather emoji */
  .weather-emoji-sm { font-size: 1.125rem; line-height: 1; }
  .weather-emoji-md { font-size: 1.375rem; line-height: 1; }
  .weather-emoji-lg { font-size: 3rem; line-height: 1; }

  /* Full widget */
  .weather-widget {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  /* Alert */
  .alert-section { display: flex; flex-direction: column; gap: var(--celine-space-xs); }
  .alert-section-title {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--celine-warning-text);
    margin: 0;
  }
  .alert-dedup-note {
    font-size: 0.6875rem;
    font-weight: 400;
    opacity: 0.75;
    margin-left: 0.25rem;
  }
  .alert-banner {
    background: var(--celine-warning-bg);
    color: var(--celine-warning-text);
    border-radius: var(--celine-radius-md);
    padding: var(--celine-space-sm) var(--celine-space-md);
  }
  .alert-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .alert-toggle {
    margin-left: auto;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    padding: 0;
    display: flex;
    align-items: center;
  }
  .alert-description { font-size: 0.8125rem; margin: 0.5rem 0 0; }
  .alert-meta { font-size: 0.75rem; color: var(--celine-warning-text); opacity: 0.8; margin: 0.25rem 0 0; }

  /* Current */
  .current-row {
    display: flex;
    align-items: center;
    gap: var(--celine-space-lg);
    flex-wrap: wrap;
  }
  .current-main { display: flex; align-items: center; gap: var(--celine-space-md); }
  .current-temp { font-size: 2.5rem; font-weight: 700; color: var(--celine-text); display: block; }
  .current-desc { font-size: 0.875rem; color: var(--celine-text-secondary); display: block; }
  .current-range { font-size: 0.8125rem; color: var(--celine-text-tertiary); display: block; }
  .current-chips { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .chip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: 999px;
    padding: 0.2rem 0.6rem;
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
  }

  /* Daily strip — single horizontal row, scrollable on narrow screens */
  .daily-strip {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 0.375rem;
    /* hide scrollbar visually while keeping it functional */
    scrollbar-width: none;
    -ms-overflow-style: none;
    /* slight negative margin + padding so today's highlight border isn't clipped */
    padding-bottom: 2px;
  }
  .daily-strip::-webkit-scrollbar { display: none; }

  .day-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    padding: 0.5rem 0.375rem;
    flex: 0 0 auto;
    min-width: 52px;
  }
  .day-label { font-size: 0.6875rem; color: var(--celine-text-secondary); font-weight: 600; text-transform: uppercase; }
  .day-range { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .temp-max { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text); }
  .temp-min { font-size: 0.75rem; color: var(--celine-text-tertiary); }
  .rain-bar-wrap {
    width: 32px; height: 3px; background: var(--celine-border); border-radius: 2px; overflow: hidden;
  }
  .rain-bar { height: 100%; background: var(--celine-info); border-radius: 2px; }

  /* Irradiance */
  .irradiance-label { font-size: 0.8125rem; color: var(--celine-text-secondary); margin: 0 0 0.5rem; font-weight: 500; display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
  .irr-gap-note { font-size: 0.6875rem; font-weight: 400; opacity: 0.7; }
  .irradiance-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 60px;
    width: 100%;
  }
  .irr-bar-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }
  .irr-bar {
    width: 100%;
    background: var(--celine-warning);
    border-radius: 2px 2px 0 0;
    transition: height 0.3s;
  }
  .irr-label { font-size: 0.5625rem; color: var(--celine-text-tertiary); }

  .no-data { color: var(--celine-text-tertiary); font-size: 0.875rem; margin: 0; }
</style>
