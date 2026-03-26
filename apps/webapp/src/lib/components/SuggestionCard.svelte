<script lang="ts">
  import type { SuggestionItem, GamificationResponse } from '$lib/api';
  import { api } from '$lib/api';
  import { Icon } from '@celine-eu/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    suggestion: SuggestionItem;
    ongamificationupdated?: (data: GamificationResponse) => void;
  }

  let { suggestion, ongamificationupdated }: Props = $props();

  type CardState = 'idle' | 'loading' | 'committed' | 'accepted' | 'declined' | 'error';
  let cardState: CardState = $state('idle');
  let earnedPoints = $state(0);
  let windowEnd = $state('');
  let errorMsg = $state('');

  const TYPE_ICONS: Record<string, string> = {
    'shift-consumption': 'clock',
    'delay-load': 'clock',
    'avoid-peak': 'alert-triangle',
  };

  function typeIcon(type: string): string {
    return TYPE_ICONS[type] ?? 'zap';
  }

  function fmtPeriodEnd(isoStr: string): string {
    try {
      return new Date(isoStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoStr;
    }
  }

  async function respond(response: 'accepted' | 'declined') {
    cardState = 'loading';
    try {
      const result = await api.suggestionRespond(suggestion.id, response, suggestion.reward_points);
      if (response === 'accepted') {
        ongamificationupdated?.(result);
        if (result.pending_commitment) {
          if (result.pending_commitment.status === 'settled') {
            earnedPoints = result.pending_commitment.reward_points_actual ?? suggestion.reward_points;
            cardState = 'accepted';
          } else {
            earnedPoints = result.pending_commitment.reward_points_estimated;
            windowEnd = fmtPeriodEnd(result.pending_commitment.period_end);
            cardState = 'committed';
          }
        } else {
          earnedPoints = suggestion.reward_points;
          cardState = 'accepted';
        }
      } else {
        cardState = 'declined';
      }
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      cardState = 'error';
    }
  }
</script>

{#if cardState !== 'declined'}
  <div class="suggestion-card" class:accepted={cardState === 'accepted'} class:committed={cardState === 'committed'}>
    {#if cardState === 'accepted'}
      <div class="confirmation">
        <Icon name="check-circle" size={20} class="check-icon" />
        <span>{$t('suggestion_card.done', { values: { points: earnedPoints } })}</span>
      </div>
    {:else if cardState === 'committed'}
      <div class="commitment">
        <Icon name="clock" size={20} class="clock-icon" />
        <span>{$t('suggestion_card.committed', { values: { points: earnedPoints, time: windowEnd } })}</span>
      </div>
    {:else}
      <div class="card-header">
        <div class="type-badge">
          <Icon name={typeIcon(suggestion.suggestion_type) as any} size={16} />
        </div>
        <div class="shift-label">
          <span class="from-label">{$t('suggestion_card.from_label', { values: { period: $t(`suggestion_card.period.${suggestion.from_period}`), range: suggestion.clock_range } })}</span>
          <Icon name="chevron-right" size={14} class="arrow-icon" />
          <span class="to-label">{suggestion.to_is_tomorrow ? $t('suggestion_card.to_label_tomorrow', { values: { period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } }) : $t('suggestion_card.to_label_today', { values: { period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } })}</span>
        </div>
        <div class="reward-badge">+{suggestion.reward_points} pts</div>
      </div>

      <p class="description">{$t('suggestion_card.description', { values: { period: $t(`suggestion_card.period.${suggestion.from_period}`), range: suggestion.clock_range, target_period: $t(`suggestion_card.period.${suggestion.to_period}`), time: suggestion.to_time } })}</p>
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
          class="btn btn-primary"
          disabled={cardState === 'loading'}
          onclick={() => respond('accepted')}
        >
          {cardState === 'loading' ? $t('suggestion_card.saving') : $t('suggestion_card.remind_me')}
        </button>
      </div>
    {/if}
  </div>
{/if}

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
    border-color: var(--celine-success);
    background: var(--celine-success-bg, rgba(34,197,94,0.05));
  }

  .suggestion-card.committed {
    border-color: var(--celine-warning, #f59e0b);
    background: rgba(245,158,11,0.05);
  }

  .confirmation {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--celine-success);
    font-size: 0.875rem;
    padding: var(--celine-space-sm) 0;
  }
  :global(.check-icon) { color: var(--celine-success); }

  .commitment {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--celine-warning-text, #92400e);
    font-size: 0.875rem;
    padding: var(--celine-space-sm) 0;
  }
  :global(.clock-icon) { color: var(--celine-warning, #f59e0b); }

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

</style>
