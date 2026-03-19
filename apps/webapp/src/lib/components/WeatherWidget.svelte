<script lang="ts">
  import type { WeatherResponse, WeatherDayItem, WeatherAlertItem } from '$lib/api';
  import { Icon, Skeleton } from '@celine-eu/ui';

  interface Props {
    data: WeatherResponse | null;
    loading?: boolean;
    compact?: boolean;
  }

  let { data, loading = false, compact = false }: Props = $props();

  const WEATHER_ICONS: Record<string, string> = {
    Clear: 'sun',
    Clouds: 'cloud',
    Rain: 'cloud-rain',
    Drizzle: 'cloud-drizzle',
    Thunderstorm: 'cloud-lightning',
    Snow: 'cloud-snow',
    Mist: 'wind',
    Fog: 'wind',
    Haze: 'wind',
    Smoke: 'wind',
    Dust: 'wind',
    Sand: 'wind',
    Ash: 'wind',
    Squall: 'wind',
    Tornado: 'wind',
  };

  function weatherIcon(main: string): string {
    return WEATHER_ICONS[main] ?? 'cloud';
  }

  function shortDay(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' });
  }

  let alertsExpanded = $state<Record<number, boolean>>({});
</script>

{#if compact}
  <!-- Compact single-row mode for dashboard -->
  <div class="weather-compact">
    {#if loading}
      <Skeleton variant="text" width="120px" />
    {:else if data?.current}
      <Icon name={weatherIcon(data.current.weather_main)} size={18} />
      <span class="compact-temp">{data.current.temp.toFixed(0)}°C</span>
      <span class="compact-desc">{data.current.weather_description}</span>
      {#if data.alerts && data.alerts.length > 0}
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
      {#if data.alerts && data.alerts.length > 0}
        <div class="alert-section">
          {#each data.alerts as alert, i}
            <div class="alert-banner">
              <div class="alert-header">
                <Icon name="alert-triangle" size={16} />
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
                  {alert.sender_name} · until {new Date(alert.end_ts).toLocaleString()}
                </p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- Current conditions -->
      {#if data.current}
        <div class="current-row">
          <div class="current-main">
            <Icon name={weatherIcon(data.current.weather_main)} size={48} class="weather-icon-lg" />
            <div>
              <span class="current-temp">{data.current.temp.toFixed(0)}°C</span>
              <span class="current-desc">{data.current.weather_description}</span>
            </div>
          </div>
          <div class="current-chips">
            <span class="chip"><Icon name="droplets" size={14} /> {data.current.humidity}%</span>
            <span class="chip"><Icon name="sun" size={14} /> UV {data.current.uvi.toFixed(1)}</span>
            <span class="chip"><Icon name="wind" size={14} /> {data.current.wind_deg}°</span>
            <span class="chip"><Icon name="cloud" size={14} /> {data.current.clouds}%</span>
          </div>
        </div>
      {/if}

      <!-- 7-day daily strip -->
      {#if data.daily && data.daily.length > 0}
        <div class="daily-strip">
          {#each data.daily as day}
            <div class="day-card">
              <span class="day-label">{shortDay(day.date)}</span>
              <Icon name={weatherIcon(day.weather_main)} size={22} class="day-icon" />
              <span class="day-range">
                <span class="temp-max">{day.temp_max.toFixed(0)}°</span>
                <span class="temp-min">{day.temp_min.toFixed(0)}°</span>
              </span>
              {#if day.pop > 0}
                <div class="rain-bar-wrap" title="{(day.pop * 100).toFixed(0)}% rain">
                  <div class="rain-bar" style="width: {(day.pop * 100).toFixed(0)}%"></div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- 24h irradiance chart -->
      {#if data.hourly_irradiance && data.hourly_irradiance.length > 0}
        <div class="irradiance-section">
          <p class="irradiance-label">Solar charging potential (next 24h)</p>
          <div class="irradiance-bars">
            {#each data.hourly_irradiance as item}
              {@const max = 1000}
              {@const pct = Math.min(100, (item.shortwave_radiation / max) * 100)}
              <div class="irr-bar-wrap" title="{item.shortwave_radiation.toFixed(0)} W/m²">
                <div class="irr-bar" style="height: {pct}%"></div>
                <span class="irr-label">{new Date(item.ts).getHours()}h</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <p class="no-data">Weather data unavailable.</p>
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

  /* Full widget */
  .weather-widget {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  /* Alert */
  .alert-section { display: flex; flex-direction: column; gap: var(--celine-space-xs); }
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
  :global(.weather-icon-lg) { color: var(--celine-primary); }
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

  /* Daily strip */
  .daily-strip {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 0.25rem;
  }
  .day-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 52px;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    padding: 0.5rem 0.25rem;
  }
  .day-label { font-size: 0.6875rem; color: var(--celine-text-secondary); font-weight: 600; text-transform: uppercase; }
  :global(.day-icon) { color: var(--celine-primary); }
  .day-range { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .temp-max { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text); }
  .temp-min { font-size: 0.75rem; color: var(--celine-text-tertiary); }
  .rain-bar-wrap {
    width: 32px; height: 3px; background: var(--celine-border); border-radius: 2px; overflow: hidden;
  }
  .rain-bar { height: 100%; background: var(--celine-info); border-radius: 2px; }

  /* Irradiance */
  .irradiance-section { }
  .irradiance-label { font-size: 0.8125rem; color: var(--celine-text-secondary); margin: 0 0 0.5rem; font-weight: 500; }
  .irradiance-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 60px;
    overflow-x: auto;
  }
  .irr-bar-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    height: 100%;
    min-width: 20px;
    gap: 2px;
  }
  .irr-bar {
    width: 14px;
    background: var(--celine-warning);
    border-radius: 2px 2px 0 0;
    transition: height 0.3s;
  }
  .irr-label { font-size: 0.5625rem; color: var(--celine-text-tertiary); }

  .no-data { color: var(--celine-text-tertiary); font-size: 0.875rem; margin: 0; }
</style>
