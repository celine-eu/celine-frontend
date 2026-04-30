<script lang="ts">
  import type { SuggestionItem } from '$lib/api';
  import { api } from '$lib/api';
  import { Icon } from '@celine-eu/ui';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    suggestion: SuggestionItem;
    onresponded?: (response: 'accepted' | 'declined') => void;
  }

  let { suggestion, onresponded }: Props = $props();

  type CardState = 'idle' | 'accepting' | 'rejecting' | 'accepted' | 'rejected' | 'error';
  let cardState: CardState = $state('idle');
  let errorMsg = $state('');

  const TYPE_ICONS: Record<string, string> = {
    'shift-consumption': 'clock',
    'delay-load': 'clock',
    'avoid-peak': 'alert-triangle',
  };

  function typeIcon(type: string): string {
    return TYPE_ICONS[type] ?? 'zap';
  }

  function isBusy(s: CardState): boolean {
    return s === 'accepting' || s === 'rejecting';
  }

  async function accept() {
    cardState = 'accepting';
    try {
      await api.suggestionRespond(
        suggestion.id,
        'accepted',
        suggestion.reward_points,
        suggestion.period_start,
        suggestion.period_end,
      );
      cardState = 'accepted';
      setTimeout(() => onresponded?.('accepted'), 2000);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      cardState = 'error';
    }
  }

  async function reject() {
    cardState = 'rejecting';
    try {
      await api.suggestionRespond(
        suggestion.id,
        'declined',
        suggestion.reward_points,
        suggestion.period_start,
        suggestion.period_end,
      );
      cardState = 'rejected';
      setTimeout(() => onresponded?.('declined'), 1200);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      cardState = 'error';
    }
  }
</script>

<div class="suggestion-card" class:accepted={cardState === 'accepted'} class:rejected={cardState === 'rejected'}>
  {#if cardState === 'accepted'}
    <div class="commitment commitment--accepted">
      <Icon name="check-circle" size={20} class="check-icon" />
      <span>{$t('suggestion_card.done', { values: { points: suggestion.reward_points } })}</span>
    </div>
  {:else if cardState === 'rejected'}
    <div class="commitment commitment--rejected">
      <Icon name="x-circle" size={20} class="x-icon" />
      <span>{$t('suggestion_card.rejected')}</span>
    </div>
  {:else}
    <div class="card-header">
      <div class="type-badge">
        <Icon name={typeIcon(suggestion.suggestion_type) as any} size={16} />
      </div>
      <div class="shift-label">
        {#if suggestion.from_period}
          <span class="from-label">{$t('suggestion_card.from_label', { values: { period: $t(`suggestion_card.period.${suggestion.from_period}`), range: suggestion.clock_range } })}</span>
          {#if suggestion.to_period}
            <Icon name="chevron-right" size={14} class="arrow-icon" />
            <span class="to-label">{suggestion.to_is_tomorrow ? $t('suggestion_card.to_label_tomorrow', { values: { period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } }) : $t('suggestion_card.to_label_today', { values: { period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } })}</span>
          {/if}
        {:else}
          <span class="from-label">{$t('suggestion_card.window_label', { values: { range: suggestion.clock_range } })}</span>
        {/if}
      </div>
      <div class="reward-badge">+{suggestion.reward_points} pts</div>
    </div>

    <p class="description">{suggestion.from_period ? $t('suggestion_card.description', { values: { period: $t(`suggestion_card.period.${suggestion.from_period}`), range: suggestion.clock_range, target_period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } }) : $t('suggestion_card.description_today', { values: { range: suggestion.clock_range, target_period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } })}</p>
    <p class="reason">{$t('suggestion_card.reason')}</p>

    <div class="meta-row">
      <span class="impact-chip">
        <Icon name="zap" size={12} /> {suggestion.impact_kwh_estimated.toFixed(1)} kWh
      </span>
      <div class="confidence-wrap" title="Confidence: {(suggestion.confidence * 100).toFixed(0)}%">
        <div class="confidence-bar" style="width: {(suggestion.confidence * 100).toFixed(0)}%"></div>
      </div>
    </div>

    {#if cardState === 'error'}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <div class="actions">
      <button
        class="btn btn-secondary"
        disabled={isBusy(cardState)}
        onclick={reject}
      >
        {cardState === 'rejecting' ? $t('suggestion_card.saving') : $t('suggestion_card.not_now')}
      </button>
      <button
        class="btn btn-primary"
        disabled={isBusy(cardState)}
        onclick={accept}
      >
        {cardState === 'accepting' ? $t('suggestion_card.saving') : $t('suggestion_card.accept')}
      </button>
    </div>
  {/if}
</div>

<style>
  .suggestion-card {
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-md);
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-sm);
    transition: border-color var(--celine-transition-fast);
  }

  .suggestion-card.accepted {
    border-color: var(--celine-success, #10b981);
    background: rgba(16,185,129,0.05);
  }

  .suggestion-card.rejected {
    border-color: var(--celine-border);
    opacity: 0.7;
  }

  .commitment {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    padding: var(--celine-space-sm) 0;
  }

  .commitment--accepted {
    color: var(--celine-success-text, #065f46);
  }
  :global(.check-icon) { color: var(--celine-success, #10b981); }

  .commitment--rejected {
    color: var(--celine-text-secondary);
  }
  :global(.x-icon) { color: var(--celine-text-tertiary); }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    flex-wrap: wrap;
  }

  .type-badge {
    background: var(--celine-primary-bg, rgba(99,102,241,0.1));
    color: var(--celine-primary);
    border-radius: var(--celine-radius-sm);
    padding: 0.25rem;
    display: flex;
    align-items: center;
  }

  .shift-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--celine-text);
    flex: 1;
  }
  :global(.arrow-icon) { color: var(--celine-text-tertiary); }
  .from-label { color: var(--celine-text-secondary); }
  .to-label { color: var(--celine-primary); }

  .reward-badge {
    background: #fef3c7;
    color: #92400e;
    border-radius: 999px;
    padding: 0.1875rem 0.625rem;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .description {
    font-size: 0.875rem;
    color: var(--celine-text);
    margin: 0;
  }

  .reason {
    font-size: 0.8125rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
  }

  .impact-chip {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: 999px;
    padding: 0.125rem 0.5rem;
  }

  .confidence-wrap {
    flex: 1;
    height: 3px;
    background: var(--celine-border);
    border-radius: 2px;
    overflow: hidden;
  }
  .confidence-bar {
    height: 100%;
    background: var(--celine-primary);
    border-radius: 2px;
    opacity: 0.5;
  }

  .error-msg {
    color: var(--celine-danger-text);
    font-size: 0.8125rem;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: var(--celine-space-xs);
  }

  .btn {
    padding: 0.4375rem 1rem;
    border-radius: var(--celine-radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all var(--celine-transition-fast);
  }

  .btn:disabled { opacity: 0.6; cursor: not-allowed; }

  .btn-primary {
    background: var(--celine-primary);
    color: #fff;
    border-color: var(--celine-primary);
  }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }

  .btn-secondary {
    background: var(--celine-bg);
    color: var(--celine-text-secondary);
    border-color: var(--celine-border);
  }
  .btn-secondary:hover:not(:disabled) {
    border-color: var(--celine-text-tertiary);
    color: var(--celine-text);
  }
</style>
