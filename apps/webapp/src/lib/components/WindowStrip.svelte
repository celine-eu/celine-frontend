<script lang="ts">
  import { api, type FlexibilityHistoryItem, type SuggestionItem } from '$lib/api';
  import { roundPromise } from '$lib/points';
  import { Icon } from '@celine-eu/ui';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    suggestions: SuggestionItem[];
    committed: FlexibilityHistoryItem[];
    oncommitted?: () => void;
  }

  let { suggestions, committed, oncommitted }: Props = $props();

  type Segment = {
    key: string;
    startMs: number;
    range: string;                    // "8-10", or "8:30-10" when minutes are non-zero
    dayKey: string;                   // local YYYY-MM-DD — groups segments by calendar day
    points: number | null;            // rounded promise
    state: 'open' | 'committed';
    suggestion: SuggestionItem | null; // null when committed
  };

  // period_starts committed in this session, before the parent's history
  // refetch lands. Self-clears once the history prop contains the window
  // (whatever its status) — so a later cancel reopens the segment.
  let optimisticStarts = $state<string[]>([]);

  let selected = $state<Segment | null>(null);
  let saving = $state(false);
  let errorMsg = $state('');

  function startKey(iso: string): string {
    return new Date(iso).toISOString();
  }

  function hourLabel(iso: string): string {
    const d = new Date(iso);
    return d.getMinutes() === 0
      ? String(d.getHours())
      : `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function rangeLabel(startIso: string, endIso: string): string {
    return `${hourLabel(startIso)}-${hourLabel(endIso)}`;
  }

  function dayKeyFrom(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayKeyOf(iso: string): string {
    return dayKeyFrom(new Date(iso));
  }

  // The 48h forecast can reach the day after tomorrow, so days beyond tomorrow get
  // their own dated heading rather than being lumped under "Tomorrow".
  function dayLabel(dayKey: string, loc: string): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dayKey === dayKeyFrom(new Date())) return $t('suggestions.history_today');
    if (dayKey === dayKeyFrom(tomorrow)) return $t('suggestions.history_tomorrow');
    return new Date(`${dayKey}T00:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'short' });
  }

  // Same day-relative bucketing the retired suggestion card used for the reason line.
  function reasonKey(periodStart: string): string {
    const start = new Date(periodStart);
    const now = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((startDay - today) / 86_400_000);
    if (diffDays <= 0) return 'suggestion_card.reason_today';
    if (diffDays === 1) return 'suggestion_card.reason_tomorrow';
    return 'suggestion_card.reason_upcoming';
  }

  $effect(() => {
    if (optimisticStarts.length === 0) return;
    const historyStarts = new Set(committed.map((i) => startKey(i.period_start)));
    const remaining = optimisticStarts.filter((s) => !historyStarts.has(s));
    if (remaining.length !== optimisticStarts.length) optimisticStarts = remaining;
  });

  const segments = $derived.by(() => {
    const now = Date.now();
    const out: Segment[] = [];
    const committedStarts = new Set<string>();
    for (const item of committed) {
      if (item.status !== 'committed' && item.status !== 'settled') continue;
      if (new Date(item.period_end).getTime() < now) continue;
      committedStarts.add(startKey(item.period_start));
      out.push({
        key: `c-${item.id}`,
        startMs: new Date(item.period_start).getTime(),
        range: rangeLabel(item.period_start, item.period_end),
        dayKey: dayKeyOf(item.period_start),
        points: item.reward_points_estimated != null ? roundPromise(item.reward_points_estimated) : null,
        state: 'committed',
        suggestion: null,
      });
    }
    for (const s of suggestions) {
      if (new Date(s.period_end).getTime() < now) continue;
      if (committedStarts.has(startKey(s.period_start))) continue; // committed wins
      const isOptimistic = optimisticStarts.includes(startKey(s.period_start));
      out.push({
        key: `s-${s.id}`,
        startMs: new Date(s.period_start).getTime(),
        range: rangeLabel(s.period_start, s.period_end),
        dayKey: dayKeyOf(s.period_start),
        points: s.reward_points != null ? roundPromise(s.reward_points) : null,
        state: isOptimistic ? 'committed' : 'open',
        suggestion: isOptimistic ? null : s,
      });
    }
    return out.sort((a, b) => a.startMs - b.startMs);
  });

  // Grouped by calendar day, chronological — segments are already sorted by start.
  const dayGroups = $derived.by(() => {
    const groups: { dayKey: string; list: Segment[] }[] = [];
    for (const seg of segments) {
      const last = groups[groups.length - 1];
      if (last && last.dayKey === seg.dayKey) last.list.push(seg);
      else groups.push({ dayKey: seg.dayKey, list: [seg] });
    }
    return groups;
  });

  function open(seg: Segment) {
    if (seg.state === 'committed' || !seg.suggestion) return;
    errorMsg = '';
    selected = seg;
  }

  function close() {
    if (!saving) selected = null;
  }

  async function commit(seg: Segment) {
    if (saving) return;
    if (!seg.suggestion) return;
    const s = seg.suggestion;
    saving = true;
    errorMsg = '';
    try {
      await api.suggestionRespond(s.id, 'accepted', s.reward_points ?? undefined, s.period_start, s.period_end);
      optimisticStarts = [...optimisticStarts, startKey(s.period_start)];
      selected = null;
      oncommitted?.();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }
</script>

{#snippet dayGroup(label: string, list: Segment[])}
  <div class="day-group">
    <p class="day-label">{label}</p>
    <div class="segments">
      {#each list as seg (seg.key)}
        <button
          class="segment"
          class:committed={seg.state === 'committed'}
          disabled={seg.state === 'committed'}
          aria-pressed={seg.state === 'committed'}
          onclick={() => open(seg)}
        >
          <span class="seg-range">{seg.range}</span>
          {#if seg.points != null}
            <span class="seg-points">~{seg.points} pts</span>
          {/if}
          <span class="seg-state">
            {#if seg.state === 'committed'}
              <Icon name="check" size={14} class="seg-check-icon" />
            {:else}
              <span class="seg-box"></span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  </div>
{/snippet}

{#if segments.length === 0}
  <div class="empty-state">
    <Icon name="sun" size={40} class="empty-icon" />
    <p class="empty-title">{$t('suggestions.no_opportunities_title')}</p>
    <p class="empty-text">{$t('suggestions.no_opportunities_body')}</p>
  </div>
{:else}
  <div class="strip">
    {#each dayGroups as group (group.dayKey)}
      {@render dayGroup(dayLabel(group.dayKey, $locale ?? 'en'), group.list)}
    {/each}
  </div>
{/if}

{#if selected && selected.suggestion}
  <div class="overlay-root">
    <button class="backdrop" aria-label={$t('suggestions.strip_not_now')} onclick={close}></button>
    <div class="popover" role="dialog" aria-modal="true">
      <p class="pop-title">
        {$t('suggestions.strip_commit_title', { values: { range: selected.range } })}
        {#if selected.dayKey !== dayKeyFrom(new Date())}
          <span class="pop-day">· {dayLabel(selected.dayKey, $locale ?? 'en')}</span>
        {/if}
      </p>
      {#if selected.points != null}
        <p class="pop-points">+{selected.points} pts</p>
      {/if}
      <div class="meta-row">
        <span class="impact-chip">
          <Icon name="zap" size={12} />
          {#if selected.suggestion.impact_kwh_estimated != null}
            {selected.suggestion.impact_kwh_estimated.toFixed(1)} kWh
          {:else}
            {$t('suggestion_card.community_impact', { values: { kwh: selected.suggestion.community_kwh.toFixed(0) } })}
          {/if}
        </span>
        {#if selected.suggestion.confidence != null}
          <div class="confidence-wrap" title="Confidence: {(selected.suggestion.confidence * 100).toFixed(0)}%">
            <div class="confidence-bar" style="width: {(selected.suggestion.confidence * 100).toFixed(0)}%"></div>
          </div>
        {/if}
      </div>
      <p class="reason">{$t(reasonKey(selected.suggestion.period_start))}</p>
      {#if errorMsg}
        <p class="error-msg">{errorMsg}</p>
      {/if}
      <div class="actions">
        <button class="btn btn-secondary" disabled={saving} onclick={close}>
          {$t('suggestions.strip_not_now')}
        </button>
        <button class="btn btn-primary" disabled={saving} onclick={() => selected && commit(selected)}>
          {saving ? $t('suggestion_card.saving') : $t('suggestions.strip_commit')}
        </button>
      </div>
    </div>
  </div>
{/if}

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

<style>
  .strip { display: flex; flex-direction: column; gap: var(--celine-space-md); }

  .day-group { display: flex; flex-direction: column; gap: 0.375rem; }
  .day-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--celine-text-tertiary);
    margin: 0;
  }

  .segments { display: flex; flex-wrap: wrap; gap: 0.5rem; }

  .segment {
    flex: 1 1 0;
    min-width: 6rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.625rem 0.5rem;
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    cursor: pointer;
    transition: border-color var(--celine-transition-fast);
  }
  .segment:hover:not(:disabled) { border-color: var(--celine-primary); }
  .segment.committed {
    background: var(--celine-bg);
    opacity: 0.65;
    cursor: default;
  }

  .seg-range { font-size: 0.9375rem; font-weight: 700; color: var(--celine-text); }
  .seg-points { font-size: 0.75rem; font-weight: 600; color: #92400e; background: #fef3c7; border-radius: 999px; padding: 0.0625rem 0.5rem; }
  .segment.committed .seg-points { background: var(--celine-border); color: var(--celine-text-secondary); }

  .seg-state { display: flex; align-items: center; height: 1rem; }
  .seg-box {
    width: 0.875rem;
    height: 0.875rem;
    border: 1.5px solid var(--celine-text-tertiary);
    border-radius: 3px;
  }
  :global(.seg-check-icon) { color: var(--celine-success, #10b981); }

  /* Empty state (copy of the page's retired block) */
  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: var(--celine-space-lg) 0; text-align: center; }
  :global(.empty-icon) { color: var(--celine-text-tertiary); }
  .empty-title { font-weight: 600; color: var(--celine-text); margin: 0; }
  .empty-text { font-size: 0.875rem; color: var(--celine-text-secondary); margin: 0; }

  /* Confirm popover */
  .overlay-root { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; }
  .backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.4); border: none; cursor: default; }
  .popover {
    position: relative;
    width: min(22rem, calc(100vw - 2rem));
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-md);
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-sm);
  }
  .pop-title { font-size: 1rem; font-weight: 700; color: var(--celine-text); margin: 0; }
  .pop-day { font-weight: 500; color: var(--celine-text-secondary); }
  .pop-points { font-size: 1.25rem; font-weight: 800; color: var(--celine-primary); margin: 0; }

  .meta-row { display: flex; align-items: center; gap: var(--celine-space-sm); }
  .impact-chip {
    display: flex; align-items: center; gap: 0.25rem;
    font-size: 0.75rem; color: var(--celine-text-secondary);
    background: var(--celine-bg); border: 1px solid var(--celine-border);
    border-radius: 999px; padding: 0.125rem 0.5rem;
  }
  .confidence-wrap { flex: 1; height: 3px; background: var(--celine-border); border-radius: 2px; overflow: hidden; }
  .confidence-bar { height: 100%; background: var(--celine-primary); border-radius: 2px; opacity: 0.5; }

  .reason { font-size: 0.8125rem; color: var(--celine-text-secondary); margin: 0; }
  .error-msg { color: var(--celine-danger-text); font-size: 0.8125rem; margin: 0; }

  .actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: var(--celine-space-xs); }
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
  .btn-primary { background: var(--celine-primary); color: #fff; border-color: var(--celine-primary); }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
  .btn-secondary { background: var(--celine-bg); color: var(--celine-text-secondary); border-color: var(--celine-border); }
  .btn-secondary:hover:not(:disabled) { border-color: var(--celine-text-tertiary); color: var(--celine-text); }
</style>
