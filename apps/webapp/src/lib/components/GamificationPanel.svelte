<script lang="ts">
  import type { GamificationResponse } from '$lib/api';
  import PointsChart from '$lib/components/PointsChart.svelte';
  import { Icon, Skeleton } from '@celine-eu/ui';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    data: GamificationResponse | null;
    loading?: boolean;
  }

  let { data, loading = false }: Props = $props();

  function levelLabel(level: number): string {
    const key = `gamification.levels.${level}` as Parameters<typeof $t>[0];
    const label = $t(key);
    return label !== key ? label : `Level ${level}`;
  }

  function progressPct(data: GamificationResponse): number {
    const prev = (data.level - 1) * 100;
    const range = data.next_level_at - prev;
    return Math.min(100, Math.max(0, ((data.total_points - prev) / range) * 100));
  }

  const BADGE_ICONS: Record<string, string> = {
    'first-shift': 'zap',
    'peak-saver': 'sun',
    'solar-champion': 'leaf',
    'streak-3': 'trending-up',
  };

  function badgeIcon(badge_id: string, icon: string): string {
    return BADGE_ICONS[badge_id] ?? icon ?? 'zap';
  }

  function seasonMonthsLabel(start: string, end: string, loc: string): string {
    // season_end is exclusive → last day of the season is end - 1 day
    const startDate = new Date(`${start}T00:00:00`);
    const lastDay = new Date(`${end}T00:00:00`);
    lastDay.setDate(lastDay.getDate() - 1);
    const fmt = new Intl.DateTimeFormat(loc, { month: 'short' });
    return `${fmt.format(startDate)}–${fmt.format(lastDay)}`;
  }

  function seasonDaysLeft(end: string): number {
    const endDate = new Date(`${end}T00:00:00`);
    return Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86_400_000));
  }
</script>

<div class="gamification-panel">
  {#if loading}
    <Skeleton variant="heading" width="50%" />
    <Skeleton variant="rect" height="12px" />
    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  {:else if data}
    {#if data.season_start && data.season_end}
      <div class="season-chip">
        <Icon name="calendar" size={14} />
        {$t('gamification.season_chip', {
          values: {
            months: seasonMonthsLabel(data.season_start, data.season_end, $locale ?? 'en'),
            days: seasonDaysLeft(data.season_end)
          }
        })}
      </div>
    {/if}
    <div class="points-section">
      <div class="points-top">
        <span class="points-total">{data.total_points.toLocaleString()}</span>
        <span class="points-unit">{$t('gamification.pts')}</span>
        <span class="level-label">Level {data.level} — {levelLabel(data.level)}</span>
      </div>
      {#if data.season_base_points != null && data.season_bonus_points != null}
        <p class="points-breakdown">
          {$t('gamification.points_breakdown', {
            values: { base: data.season_base_points.toLocaleString(), bonus: data.season_bonus_points.toLocaleString() }
          })}
        </p>
      {/if}
      <div class="progress-wrap" title="{data.total_points} / {data.next_level_at} {$t('gamification.pts')}">
        <div class="progress-bar" style="width: {progressPct(data)}%"></div>
      </div>
      <p class="progress-hint">
        {$t('gamification.pts_to_level', { values: { pts: data.next_level_at - data.total_points, level: data.level + 1 } })}
      </p>
    </div>

    {#if data.ranking && data.season_start}
      <div class="rank-card">
        <p class="rank-title">{$t('suggestions.ranking_title')}</p>
        <p class="rank-position">
          {$t('suggestions.ranking_position', {
            values: { position: data.ranking.position, total: data.ranking.total_members }
          })}
        </p>
        <p class="rank-top">{$t('suggestions.ranking_top', { values: { pct: data.ranking.percentile } })}</p>
        <p class="rank-hint">{$t('suggestions.ranking_keep_going')}</p>
      </div>
    {/if}

    {#if data.badges && data.badges.length > 0}
      <div class="badges-section">
        <p class="badges-label">{$t('gamification.your_badges')}</p>
        <div class="badges-grid">
          {#each data.badges as badge}
            <div class="badge-chip" title="{$t(`gamification.badges.${badge.badge_id}`)} · {$t('gamification.earned')} {new Date(badge.earned_at).toLocaleDateString()}">
              <Icon name={badgeIcon(badge.badge_id, badge.icon) as any} size={16} class="badge-icon" />
              <span class="badge-label">{$t(`gamification.badges.${badge.badge_id}`)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if data.daily_points && data.daily_points.length > 0}
      <div class="trend-section">
        <p class="trend-label">
          {$t('gamification.trend_title')}
          <span class="trend-period">{$t('gamification.trend_period')}</span>
        </p>
        <PointsChart data={data.daily_points} height="140px" />
      </div>
    {/if}

    <div class="footer-cta">
      <a href="/suggestions" class="cta-link">
        <Icon name="trending-up" size={14} />
        {$t('gamification.earn_cta')}
      </a>
    </div>
  {:else}
    <p class="empty">{$t('gamification.no_data')}</p>
  {/if}
</div>

<style>
  .gamification-panel {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  /* Points */
  .points-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .points-top {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .points-total {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--celine-text);
    line-height: 1;
  }
  .points-unit {
    font-size: 1rem;
    color: var(--celine-text-secondary);
    font-weight: 500;
  }
  .level-label {
    font-size: 0.875rem;
    color: var(--celine-primary);
    font-weight: 600;
    margin-left: auto;
  }

  .progress-wrap {
    height: 8px;
    background: var(--celine-border);
    border-radius: 4px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, var(--celine-primary), #a78bfa);
    border-radius: 4px;
    transition: width 0.5s ease;
  }

  .progress-hint { font-size: 0.75rem; color: var(--celine-text-tertiary); margin: 0; }

  /* Badges */
  .badges-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .badges-label { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text-secondary); margin: 0; }
  .badges-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .badge-chip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    color: var(--celine-text);
    cursor: default;
  }
  :global(.badge-icon) { color: var(--celine-primary); }
  .badge-label { font-weight: 500; }

  /* Trend chart */
  .trend-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .trend-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--celine-text-secondary);
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }
  .trend-period {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--celine-text-tertiary);
  }

  /* Footer CTA */
  .footer-cta {
    border-top: 1px solid var(--celine-border);
    padding-top: var(--celine-space-sm);
  }
  .cta-link {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--celine-primary);
    text-decoration: none;
  }
  .cta-link:hover { text-decoration: underline; }

  .empty { color: var(--celine-text-tertiary); font-size: 0.875rem; margin: 0; }

  /* Season chip */
  .season-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    align-self: flex-start;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--celine-text-secondary);
  }

  .points-breakdown {
    font-size: 0.8125rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  /* Rank card */
  .rank-card {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius, 8px);
    padding: 0.75rem 1rem;
  }
  .rank-title { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text-secondary); margin: 0; }
  .rank-position { font-size: 1.125rem; font-weight: 700; color: var(--celine-text); margin: 0; }
  .rank-top { font-size: 0.8125rem; color: var(--celine-primary); font-weight: 600; margin: 0; }
  .rank-hint { font-size: 0.75rem; color: var(--celine-text-tertiary); margin: 0; }
</style>
