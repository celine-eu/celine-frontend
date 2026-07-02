<script lang="ts">
  import { page } from '$app/state';
  import { api, type ForecastResponse, type SuggestionItem, type CommitmentHistoryResponse } from '$lib/api';
  import { ForecastCard, SuggestionCard } from '$lib/components';
  import { AskAssistantButton } from '@celine-eu/assistant-ui';
  import { Icon, Skeleton } from '@celine-eu/ui';
  import { onMount } from 'svelte';
  import { t, locale } from 'svelte-i18n';

  let forecastData = $state<ForecastResponse | null>(null);
  let forecastLoading = $state(true);

  let suggestions = $state<SuggestionItem[]>([]);
  let suggestionsLoading = $state(true);

  let history = $state<CommitmentHistoryResponse | null>(null);
  let historyLoading = $state(true);

  function buildAssistantHref(prompt: string, section: string): string {
    const url = new URL('/assistant', page.url.origin);
    url.searchParams.set('prompt', prompt);
    url.searchParams.set('page', 'suggestions');
    url.searchParams.set('section', section);
    return `${url.pathname}${url.search}`;
  }

  function assistantPrompt(section: 'opportunities' | 'forecast' | 'history'): string {
    return $t(`suggestions.ask_ai.${section}`);
  }

  function handleResponded(id: string, response: 'accepted' | 'declined') {
    suggestions = suggestions.filter(s => s.id !== id);
    if (response === 'accepted') {
      api.gamificationHistory().then(h => { history = h; }).catch(() => {});
    }
  }

  function fmtDate(isoStr: string): string {
    try {
      return new Date(isoStr).toLocaleDateString($locale ?? undefined, {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch {
      return isoStr;
    }
  }

  function fmtTime(isoStr: string): string {
    try {
      return new Date(isoStr).toLocaleTimeString($locale ?? undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoStr;
    }
  }

  function fmtWindowDate(isoStr: string): string {
    try {
      const d = new Date(isoStr);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      if (d.toDateString() === today.toDateString()) return $t('suggestions.history_today');
      if (d.toDateString() === tomorrow.toDateString()) return $t('suggestions.history_tomorrow');
      return d.toLocaleDateString($locale ?? undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return isoStr;
    }
  }

  function statusLabel(status: string): string {
    if (status === 'settled') return $t('suggestions.history_settled');
    if (status === 'committed') return $t('suggestions.history_committed');
    if (status === 'cancelled') return $t('suggestions.history_cancelled');
    return $t('suggestions.history_rejected');
  }

  function statusVariant(status: string): string {
    if (status === 'settled') return 'settled';
    if (status === 'committed') return 'committed';
    return 'rejected';
  }

  async function cancelCommitment(id: string) {
    try {
      await api.cancelCommitment(id);
      // Optimistic: mark cancelled immediately
      if (history) {
        history = {
          ...history,
          items: history.items.map(i => i.id === id ? { ...i, status: 'cancelled' } : i)
        };
      }
      // Reload both lists from server
      const [s, h] = await Promise.all([api.suggestions(), api.gamificationHistory()]);
      suggestions = s.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);
      history = h;
    } catch {
      // silent fail — UI stays as-is
    }
  }

  onMount(async () => {
    const [f, s, h] = await Promise.allSettled([
      api.forecast(),
      api.suggestions(),
      api.gamificationHistory(),
    ]);

    if (f.status === 'fulfilled') forecastData = f.value;
    forecastLoading = false;

    if (s.status === 'fulfilled') suggestions = s.value.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);
    suggestionsLoading = false;

    if (h.status === 'fulfilled') history = h.value;
    historyLoading = false;
  });
</script>

<section class="suggestions-page">
  <header class="page-header">
    <a href="/" class="back-link">
      <Icon name="chevron-left" size={18} />
      {$t('suggestions.back')}
    </a>
    <h1 class="page-title">{$t('suggestions.title')}</h1>
    <p class="page-subtitle">{$t('suggestions.subtitle')}</p>
  </header>

  <!-- Suggestions (anchored for flex banner link) -->
  <section class="section-card" id="opportunities" data-tour="suggestions-opportunities">
    <header class="section-header">
      <Icon name="zap" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.opportunities_title')}</h2>
        <p class="section-period">{$t('suggestions.opportunities_period')}</p>
      </div>
      <span data-tour="ask-ai">
      <AskAssistantButton
        iconOnly
        prompt={assistantPrompt('opportunities')}
        href={buildAssistantHref(assistantPrompt('opportunities'), 'opportunities')}
      />
      </span>
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
            onresponded={(response) => handleResponded(suggestion.id, response)}
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

  <!-- 48h energy outlook -->
  <section class="section-card" data-tour="suggestions-forecast">
    <header class="section-header">
      <Icon name="activity" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.forecast_section_title')}</h2>
        <p class="section-period">{$t('suggestions.forecast_section_period')}</p>
      </div>
      <AskAssistantButton
        iconOnly
        prompt={assistantPrompt('forecast')}
        href={buildAssistantHref(assistantPrompt('forecast'), 'forecast')}
      />
    </header>
    <ForecastCard data={forecastData} loading={forecastLoading} />
  </section>

  <!-- Flexibility History -->
  <section class="section-card" data-tour="suggestions-history">
    <header class="section-header">
      <Icon name="clock" size={22} class="section-icon" />
      <div>
        <h2 class="section-title">{$t('suggestions.history_title')}</h2>
        <p class="section-period">{$t('suggestions.history_period')}</p>
      </div>
      <AskAssistantButton
        iconOnly
        prompt={assistantPrompt('history')}
        href={buildAssistantHref(assistantPrompt('history'), 'history')}
      />
    </header>

    {#if historyLoading}
      <div class="history-list">
        <Skeleton variant="card" />
        <Skeleton variant="card" />
        <Skeleton variant="card" />
      </div>
    {:else if history && history.items.length > 0}
      <div class="history-list">
        {#each history.items as item (item.id)}
          <div class="history-item history-item--{statusVariant(item.status)}">
            <div class="history-item__left">
              <div class="history-item__header">
                <span class="history-window">
                  {fmtWindowDate(item.period_start)} · {fmtTime(item.period_start)}–{fmtTime(item.period_end)}
                </span>
                <span class="history-status">{statusLabel(item.status)}</span>
              </div>
              <span class="history-type">{item.suggestion_type.replace(/-/g, ' ')}</span>
              <span class="history-date">{$t('suggestions.history_responded_on', { values: { date: fmtDate(item.committed_at) } })}</span>
            </div>
            <div class="history-item__right">
              {#if item.status === 'settled' && item.reward_points_actual != null}
                <span class="history-pts history-pts--earned">
                  {$t('suggestions.history_earned', { values: { pts: item.reward_points_actual } })}
                </span>
                {#if item.impact_kwh_actual != null}
                  <span class="history-impact">{item.impact_kwh_actual.toFixed(1)} kWh</span>
                {/if}
              {:else if item.status === 'committed'}
                <span class="history-pts history-pts--pending">
                  {$t('suggestions.history_estimated', { values: { pts: item.reward_points_estimated } })}
                </span>
                <button class="cancel-btn" onclick={() => cancelCommitment(item.id)}>
                  {$t('suggestions.history_cancel')}
                </button>
              {:else if item.status === 'rejected'}
                <span class="history-pts history-pts--missed">—</span>
              {:else}
                <span class="history-pts history-pts--missed">—</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
      {#if history.total_points_earned > 0}
        <p class="history-total">
          Total earned: <strong>{history.total_points_earned} pts</strong>
        </p>
      {/if}
    {:else}
      <div class="empty-state">
        <Icon name="clock" size={40} class="empty-icon" />
        <p class="empty-title">{$t('suggestions.history_empty_title')}</p>
        <p class="empty-text">{$t('suggestions.history_empty_body')}</p>
      </div>
    {/if}
  </section>
</section>

<style>
  .suggestions-page {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-lg);
  }

  .page-header { margin-bottom: var(--celine-space-sm); }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--celine-space-xs);
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    text-decoration: none;
    margin-bottom: var(--celine-space-sm);
    transition: color var(--celine-transition-fast);
  }

  .back-link:hover { color: var(--celine-primary); }

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

  /* Suggestions list */
  .suggestions-list {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  /* History list */
  .history-list {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-sm);
  }

  .history-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--celine-space-md);
    padding: var(--celine-space-sm) var(--celine-space-md);
    border-radius: var(--celine-radius-md);
    border: 1px solid var(--celine-border);
    background: var(--celine-bg);
  }

  .history-item--settled {
    border-color: rgba(16,185,129,0.3);
    background: rgba(16,185,129,0.04);
  }

  .history-item--committed {
    border-color: rgba(245,158,11,0.3);
    background: rgba(245,158,11,0.04);
  }

  .history-item--rejected {
    opacity: 0.65;
  }

  .history-item__left {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .history-item__header {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    flex-wrap: wrap;
  }

  .history-window {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--celine-text);
  }

  .history-status {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.125rem 0.4375rem;
    border-radius: 999px;
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    color: var(--celine-text-secondary);
    white-space: nowrap;
  }

  .history-item--settled .history-status {
    color: var(--celine-success, #10b981);
    border-color: rgba(16,185,129,0.3);
    background: rgba(16,185,129,0.08);
  }
  .history-item--committed .history-status {
    color: var(--celine-warning, #f59e0b);
    border-color: rgba(245,158,11,0.3);
    background: rgba(245,158,11,0.08);
  }

  .history-type {
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
    text-transform: capitalize;
  }

  .history-date {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
  }

  .history-item__right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .history-pts {
    font-size: 0.9375rem;
    font-weight: 700;
  }

  .history-pts--earned { color: var(--celine-success, #10b981); }
  .history-pts--pending { color: var(--celine-warning, #f59e0b); }
  .history-pts--missed { color: var(--celine-text-tertiary); }

  .history-impact {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
  }

  .cancel-btn {
    margin-top: 4px;
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
    background: none;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-sm);
    padding: 2px 8px;
    cursor: pointer;
    transition: color var(--celine-transition-fast), border-color var(--celine-transition-fast);
  }

  .cancel-btn:hover {
    color: var(--celine-error, #ef4444);
    border-color: var(--celine-error, #ef4444);
  }

  .history-total {
    margin: var(--celine-space-md) 0 0;
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    text-align: right;
  }

  /* Empty state */
  .empty-state { text-align: center; padding: var(--celine-space-xl) var(--celine-space-md); }
  :global(.empty-icon) { color: var(--celine-text-tertiary); opacity: 0.5; margin-bottom: var(--celine-space-sm); }
  .empty-title { font-size: 0.9375rem; font-weight: 600; color: var(--celine-text); margin: 0 0 var(--celine-space-xs); }
  .empty-text { font-size: 0.875rem; color: var(--celine-text-secondary); margin: 0; }

  @media (min-width: 640px) {
    .section-card { padding: var(--celine-space-lg); }
    .page-title { font-size: 1.75rem; }
  }

  @media (min-width: 768px) {
    .section-card { padding: var(--celine-space-xl); }
    .section-title { font-size: 1.125rem; }
  }
</style>
