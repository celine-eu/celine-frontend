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
    dayKey: string;                   // local YYYY-MM-DD — identifies the calendar day
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

  // The next actionable window — emphasised and scrolled into view on mount.
  const featuredKey = $derived(segments.find((s) => s.state === 'open')?.key ?? null);

  let stripEl = $state<HTMLDivElement | null>(null);
  let overflows = $state(false);
  let scrolled = $state(false);
  let activeIndex = $state(0);
  let rafId = 0;
  let centeredKey = '';

  // Keep the featured card centred whenever it changes (first load, after a commit).
  $effect(() => {
    const key = featuredKey;
    const el = stripEl;
    if (!el || !key || key === centeredKey) return;
    const card = el.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    if (!card) return;
    centeredKey = key;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    card.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
  });

  $effect(() => {
    // Re-measure when the segment count changes.
    segments.length;
    const el = stripEl;
    if (!el) return;
    const measure = () => { overflows = el.scrollWidth > el.clientWidth + 1; };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  });

  function onStripScroll() {
    const el = stripEl;
    if (!el || rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!el) return;
      if (el.scrollLeft > 4) scrolled = true;
      const count = segments.length;
      if (count < 2) { activeIndex = 0; return; }
      const pitch = (el.scrollWidth - el.clientWidth) / (count - 1);
      activeIndex = pitch > 0 ? Math.round(el.scrollLeft / pitch) : 0;
    });
  }

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

{#if segments.length === 0}
  <div class="empty-state">
    <Icon name="sun" size={40} class="empty-icon" />
    <p class="empty-title">{$t('suggestions.no_opportunities_title')}</p>
    <p class="empty-text">{$t('suggestions.no_opportunities_body')}</p>
  </div>
{:else}
  <div class="strip-wrap">
    {#if overflows && !scrolled}
      <p class="scroll-hint">
        {$t('suggestions.strip_scroll_hint')}
        <Icon name="chevron-right" size={16} />
      </p>
    {/if}

    <div class="strip" bind:this={stripEl} onscroll={onStripScroll}>
      {#each segments as seg (seg.key)}
        <button
          class="segment"
          class:committed={seg.state === 'committed'}
          class:featured={seg.key === featuredKey}
          data-key={seg.key}
          disabled={seg.state === 'committed'}
          aria-pressed={seg.state === 'committed'}
          onclick={() => open(seg)}
        >
          <span class="seg-icon"><Icon name="calendar" size={18} /></span>
          <span class="seg-day">{dayLabel(seg.dayKey, $locale ?? 'en')}</span>
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

    {#if overflows && segments.length > 1}
      <div class="dots" aria-hidden="true">
        {#each segments as seg, i (seg.key)}
          <span class="dot" class:active={i === activeIndex}></span>
        {/each}
      </div>
    {/if}
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
  .strip-wrap { display: flex; flex-direction: column; gap: 0.5rem; }

  .scroll-hint {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8125rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  /* Cards bleed to the section-card edge so the next one peeks in. */
  .strip {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    margin: 0 calc(-1 * var(--celine-space-md));
    padding: 0.25rem var(--celine-space-md);
  }
  .strip::-webkit-scrollbar { display: none; }

  .segment {
    flex: 0 0 clamp(7.5rem, 42vw, 9.5rem);
    scroll-snap-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3125rem;
    padding: 0.875rem 0.5rem;
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    cursor: pointer;
    transition: border-color var(--celine-transition-fast);
  }
  .segment:hover:not(:disabled) { border-color: var(--celine-primary); }
  .segment.committed {
    background: var(--celine-bg);
    opacity: 0.65;
    cursor: default;
  }
  .segment.featured {
    border-color: var(--celine-primary);
    box-shadow: 0 0 0 1px var(--celine-primary), 0 0 16px -6px var(--celine-primary);
    padding-block: 1.125rem;
  }

  .seg-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 999px;
    border: 1px solid var(--celine-border);
    color: var(--celine-primary);
  }
  .segment.featured .seg-icon { border-color: var(--celine-primary); }

  .seg-day {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--celine-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .segment.featured .seg-day { color: var(--celine-primary); }

  .seg-range { font-size: 1.125rem; font-weight: 700; color: var(--celine-text); white-space: nowrap; }
  .seg-points {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--celine-text-secondary);
    background: var(--celine-bg);
    border: 1px solid var(--celine-border);
    border-radius: 999px;
    padding: 0.0625rem 0.5rem;
    white-space: nowrap;
  }
  .segment.committed .seg-points { background: var(--celine-border); color: var(--celine-text-secondary); }

  .dots { display: flex; justify-content: center; gap: 0.3125rem; }
  .dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 999px;
    background: var(--celine-border);
    transition: background var(--celine-transition-fast), width var(--celine-transition-fast);
  }
  .dot.active { width: 1rem; background: var(--celine-primary); }

  @media (prefers-reduced-motion: reduce) {
    .segment, .dot { transition: none; }
  }

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
