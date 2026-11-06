<script lang="ts">
  import type { BoardStanding } from '$lib/api';
  import { boardLine } from '$lib/fairCopy';
  import { t } from 'svelte-i18n';

  interface Props {
    standing: BoardStanding;
    category: 'household' | 'public_entity' | null | undefined;
  }

  let { standing, category }: Props = $props();

  const ICONS: Record<string, string> = { virtuosi: '🌞', in_crescita: '📈', generale: '🏆' };
</script>

<div class="board-card" class:ranked={standing.rank != null}>
  <div class="board-head">
    <span class="board-icon" aria-hidden="true">{ICONS[standing.board]}</span>
    <span class="board-title">{$t(`gamification_fair.boards.${standing.board}`)}</span>
    {#if category}
      <span class="board-category">{$t(`gamification_fair.category.${category}`)}</span>
    {/if}
  </div>
  {#if standing.rank != null}
    <p class="board-rank">
      {$t('suggestions.ranking_position', { values: { position: standing.rank, total: standing.total_ranked } })}
    </p>
    {#if standing.score != null}
      <p class="board-score">{Math.round(standing.score)} · {standing.weeks_counted} {$t('gamification_fair.weeks')}</p>
    {/if}
  {:else}
    <p class="board-rank board-rank--none">{$t('gamification_fair.no_position_yet')}</p>
    {#if standing.total_ranked > 0}
      <p class="board-score">{$t('gamification_fair.ranked_in_category', { values: { n: standing.total_ranked } })}</p>
    {/if}
  {/if}
  {#if boardLine(standing, $t)}
    <p class="board-why">{boardLine(standing, $t)}</p>
  {/if}
</div>

<style>
  .board-card {
    flex: 1 1 160px;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: 12px;
    padding: 0.75rem;
  }
  .board-card.ranked { border-color: var(--celine-primary); }
  .board-head { display: flex; align-items: center; gap: 0.375rem; flex-wrap: wrap; }
  .board-icon { font-size: 1rem; }
  .board-title { font-weight: 700; font-size: 0.875rem; color: var(--celine-text); }
  .board-category { font-size: 0.6875rem; color: var(--celine-text-tertiary); margin-left: auto; }
  .board-rank { margin: 0; font-size: 1rem; font-weight: 700; color: var(--celine-text); }
  .board-rank--none { font-weight: 500; color: var(--celine-text-secondary); font-size: 0.875rem; }
  .board-score { margin: 0; font-size: 0.75rem; color: var(--celine-text-secondary); }
  .board-why { margin: 0; font-size: 0.75rem; color: var(--celine-text-tertiary); }
</style>
