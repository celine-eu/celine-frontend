<script lang="ts">
  import type { GamificationFairResponse } from '$lib/api';
  import BoardCard from '$lib/components/BoardCard.svelte';
  import WeeklyScoreBars from '$lib/components/WeeklyScoreBars.svelte';
  import { levelProgressPct, weekLine } from '$lib/fairCopy';
  import { seasonDaysLeft, seasonMonthsLabel } from '$lib/season';
  import { Icon, Skeleton } from '@celine-eu/ui';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    data: GamificationFairResponse | null;
    loading?: boolean;
  }

  let { data, loading = false }: Props = $props();

  function levelLabel(level: number): string {
    const key = `gamification.levels.${level}` as Parameters<typeof $t>[0];
    const label = $t(key);
    return label !== key ? label : `${$t('gamification_fair.level')} ${level}`;
  }

  function statusParams(d: GamificationFairResponse): Record<string, number | string> {
    return { valid: d.season?.valid_weeks ?? 0, required: Math.max(1, d.season?.required_weeks ?? 1) };
  }

  /** `not_yet_ranked` has three different stories (first week, too few weeks, no valid week yet). */
  function statusKey(d: GamificationFairResponse): string {
    if (d.status === 'not_yet_ranked') {
      const reason = d.status_reason ?? 'no_valid_week';
      return `gamification_fair.status.not_yet_ranked_${reason === 'min_weeks' ? 'min_weeks' : reason === 'first_week' ? 'first_week' : 'no_valid_week'}`;
    }
    return `gamification_fair.status.${d.status}`;
  }

  const BADGE_ICONS: Record<string, string> = {
    'first-valid-week': 'calendar',
    'first-kept': 'zap',
    'four-at-max': 'sun',
    'on-the-rise': 'trending-up',
    'first-shift': 'zap',
    'peak-saver': 'sun',
    'solar-champion': 'leaf',
    'streak-3': 'trending-up',
  };
</script>

<div class="fair-panel">
  {#if loading}
    <Skeleton variant="heading" width="50%" />
    <Skeleton variant="rect" height="12px" />
    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  {:else if data}
    {#if data.season}
      <div class="season-chip">
        <Icon name="calendar" size={14} />
        {$t('gamification.season_chip', {
          values: { months: seasonMonthsLabel(data.season.start, data.season.end, $locale ?? 'en'), days: seasonDaysLeft(data.season.end) }
        })}
      </div>
    {/if}

    {#if data.status !== 'ranked'}
      <div class="status-banner" class:status-warn={data.status === 'silent' || data.status === 'quarantined' || data.status === 'unavailable'} role="status">
        <Icon name="info" size={16} />
        <span>{$t(statusKey(data), { values: statusParams(data) })}</span>
      </div>
    {/if}

    <div class="points-section">
      <div class="points-top">
        <span class="points-total">{data.season_points.toLocaleString()}</span>
        <span class="points-unit">{$t('gamification.pts')}</span>
        <span class="level-label">{$t('gamification_fair.level')} {data.level} — {levelLabel(data.level)}</span>
      </div>
      <div class="progress-wrap" title="{data.season_points} / {data.next_level_at} {$t('gamification.pts')}">
        <div class="progress-bar" style="width: {levelProgressPct(data.season_points, data.level, data.next_level_at)}%"></div>
      </div>
      <p class="progress-hint">
        {$t('gamification.pts_to_level', { values: { pts: data.next_level_at - data.season_points, level: data.level + 1 } })}
      </p>
    </div>

    {#if data.boards.length > 0}
      <div class="boards-row">
        {#each data.boards as standing (standing.board)}
          <BoardCard {standing} category={data.category} />
        {/each}
      </div>
    {/if}

    {#if data.latest_week}
      {@const w = data.latest_week}
      <div class="week-section">
        <p class="week-title">
          {$t('gamification_fair.because')}
          <span class="week-period">{$t('gamification_fair.week_of', { values: { date: new Date(w.week_start + 'T12:00:00Z').toLocaleDateString($locale ?? 'en', { day: 'numeric', month: 'short' }) } })}</span>
        </p>
        <ul class="week-list">
          <li>
            <span class="comp-name">{$t('gamification_fair.components.level')}</span>
            <span class="comp-points">{w.level_points ?? '—'}</span>
            <span class="comp-why">{weekLine(w, 'level', $t)}</span>
          </li>
          <li>
            <span class="comp-name">{$t('gamification_fair.components.growth')}</span>
            <span class="comp-points">{w.growth_points ?? '—'}</span>
            <span class="comp-why">{weekLine(w, 'growth', $t)}</span>
          </li>
          <li>
            <span class="comp-name">{$t('gamification_fair.components.actions')}</span>
            <span class="comp-points">{w.actions_points}</span>
            <span class="comp-why">{weekLine(w, 'actions', $t)}</span>
          </li>
        </ul>
        {#if w.flags.length > 0}
          <p class="week-flag">
            {#each w.flags as flag (flag)}{$t(`gamification_fair.flags.${flag}`)}{/each}
          </p>
        {/if}
      </div>
    {/if}

    {#if data.weekly_history.length > 0}
      <div class="trend-section">
        <p class="trend-label">
          {$t('gamification_fair.history_title')}
          <span class="trend-period">{$t('gamification_fair.history_period')}</span>
        </p>
        <WeeklyScoreBars data={data.weekly_history} height="160px" />
      </div>
    {/if}

    {#if data.badges.length > 0}
      <div class="badges-section">
        <p class="badges-label">{$t('gamification.your_badges')}</p>
        <div class="badges-grid">
          {#each data.badges as badge (badge.badge_id)}
            <div class="badge-chip" title="{$t(`gamification.badges.${badge.badge_id}`)} · {$t('gamification.earned')} {new Date(badge.earned_at).toLocaleDateString()}">
              <Icon name={(BADGE_ICONS[badge.badge_id] ?? badge.icon ?? 'zap') as any} size={16} class="badge-icon" />
              <span class="badge-label">{$t(`gamification.badges.${badge.badge_id}`)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="footer-cta">
      <a href="/suggestions" class="cta-link">
        <Icon name="trending-up" size={14} />
        {$t('gamification_fair.earn_cta', { values: { pts: data.actions.points_per_kept ?? 5 } })}
      </a>
    </div>
  {:else}
    <p class="empty">{$t('gamification.no_data')}</p>
  {/if}
</div>

<style>
  .fair-panel { display: flex; flex-direction: column; gap: var(--celine-space-md); }
  .season-chip {
    display: inline-flex; align-items: center; gap: 0.375rem; align-self: flex-start;
    background: var(--celine-bg); border: 1px solid var(--celine-border); border-radius: 999px;
    padding: 0.25rem 0.75rem; font-size: 0.75rem; font-weight: 600; color: var(--celine-text-secondary);
  }
  .status-banner {
    display: flex; align-items: flex-start; gap: 0.5rem; font-size: 0.8125rem; color: var(--celine-text-secondary);
    background: var(--celine-bg); border: 1px solid var(--celine-border); border-radius: 10px; padding: 0.5rem 0.75rem;
  }
  .status-warn { border-color: #f59e0b; }
  .points-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .points-top { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
  .points-total { font-size: 2.5rem; font-weight: 800; color: var(--celine-text); line-height: 1; }
  .points-unit { font-size: 1rem; color: var(--celine-text-secondary); font-weight: 500; }
  .level-label { font-size: 0.875rem; color: var(--celine-primary); font-weight: 600; margin-left: auto; }
  .progress-wrap { height: 8px; background: var(--celine-border); border-radius: 4px; overflow: hidden; }
  .progress-bar { height: 100%; background: linear-gradient(90deg, var(--celine-primary), #a78bfa); border-radius: 4px; transition: width 0.5s ease; }
  .progress-hint { font-size: 0.75rem; color: var(--celine-text-tertiary); margin: 0; }
  .boards-row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .week-section { display: flex; flex-direction: column; gap: 0.375rem; }
  .week-title { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text-secondary); margin: 0; display: flex; gap: 0.5rem; align-items: baseline; }
  .week-period { font-size: 0.75rem; font-weight: 400; color: var(--celine-text-tertiary); }
  .week-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
  .week-list li { display: grid; grid-template-columns: auto auto 1fr; gap: 0.5rem; align-items: baseline; font-size: 0.8125rem; }
  .comp-name { font-weight: 600; color: var(--celine-text); }
  .comp-points { font-weight: 700; color: var(--celine-primary); }
  .comp-why { color: var(--celine-text-secondary); }
  .week-flag { margin: 0; font-size: 0.75rem; color: #b45309; }
  .trend-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .trend-label { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text-secondary); margin: 0; display: flex; align-items: baseline; gap: 0.5rem; }
  .trend-period { font-size: 0.75rem; font-weight: 400; color: var(--celine-text-tertiary); }
  .badges-section { display: flex; flex-direction: column; gap: 0.5rem; }
  .badges-label { font-size: 0.8125rem; font-weight: 600; color: var(--celine-text-secondary); margin: 0; }
  .badges-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .badge-chip {
    display: flex; align-items: center; gap: 0.375rem; background: var(--celine-bg); border: 1px solid var(--celine-border);
    border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.75rem; color: var(--celine-text); cursor: default;
  }
  :global(.badge-icon) { color: var(--celine-primary); }
  .badge-label { font-weight: 500; }
  .footer-cta { border-top: 1px solid var(--celine-border); padding-top: var(--celine-space-sm); }
  .cta-link { display: flex; align-items: center; gap: 0.375rem; font-size: 0.875rem; font-weight: 500; color: var(--celine-primary); text-decoration: none; }
  .cta-link:hover { text-decoration: underline; }
  .empty { color: var(--celine-text-tertiary); font-size: 0.875rem; margin: 0; }
  @media (max-width: 480px) {
    .week-list li { grid-template-columns: auto auto; }
    .comp-why { grid-column: 1 / -1; }
  }
</style>
