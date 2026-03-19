<script lang="ts">
  import type { GamificationResponse } from '$lib/api';
  import { Icon, Skeleton } from '@celine-eu/ui';

  interface Props {
    data: GamificationResponse | null;
    loading?: boolean;
  }

  let { data, loading = false }: Props = $props();

  const LEVEL_LABELS: Record<number, string> = {
    1: 'Energy Newcomer',
    2: 'Grid Helper',
    3: 'Eco Shifter',
    4: 'Solar Mover',
    5: 'Peak Buster',
    6: 'REC Champion',
    7: 'Community Hero',
  };

  function levelLabel(level: number): string {
    return LEVEL_LABELS[level] ?? `Level ${level}`;
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
    return BADGE_ICONS[badge_id] ?? icon ?? 'award';
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
    <div class="points-section">
      <div class="points-top">
        <span class="points-total">{data.total_points.toLocaleString()}</span>
        <span class="points-unit">pts</span>
        <span class="level-label">Level {data.level} — {levelLabel(data.level)}</span>
      </div>
      <div class="progress-wrap" title="{data.total_points} / {data.next_level_at} pts">
        <div class="progress-bar" style="width: {progressPct(data)}%"></div>
      </div>
      <p class="progress-hint">
        {data.next_level_at - data.total_points} pts to Level {data.level + 1}
      </p>
    </div>

    {#if data.badges && data.badges.length > 0}
      <div class="badges-section">
        <p class="badges-label">Your badges</p>
        <div class="badges-grid">
          {#each data.badges as badge}
            <div class="badge-chip" title="{badge.label} · earned {new Date(badge.earned_at).toLocaleDateString()}">
              <Icon name={badgeIcon(badge.badge_id, badge.icon)} size={16} class="badge-icon" />
              <span class="badge-label">{badge.label}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="footer-cta">
      <a href="/suggestions" class="cta-link">
        <Icon name="trending-up" size={14} />
        Shift loads to earn more points →
      </a>
    </div>
  {:else}
    <p class="empty">No gamification data yet.</p>
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
</style>
