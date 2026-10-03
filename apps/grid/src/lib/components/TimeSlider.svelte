<script lang="ts">
  /**
   * Intra-day selector: position 0 = the daily view (unchanged default),
   * positions 1..3 = the three 8-hour windows of the selected day.
   */
  import { _ } from 'svelte-i18n';
  import { SLOTS, slotLabel, type Slot } from '$lib/timeWindows';

  interface Props {
    slot: Slot | null;
    onchange: (slot: Slot | null) => void;
  }
  let { slot, onchange }: Props = $props();

  const position = $derived(slot === null ? 0 : slot + 1);
  const labels = $derived([$_('slider.day'), ...SLOTS.map(slotLabel)]);

  function onInput(e: Event) {
    const v = Number((e.currentTarget as HTMLInputElement).value);
    onchange(v === 0 ? null : ((v - 1) as Slot));
  }
</script>

<div class="time-slider">
  <input
    type="range"
    min="0"
    max={SLOTS.length}
    step="1"
    value={position}
    oninput={onInput}
    aria-label={$_('filter.window')}
    aria-valuetext={labels[position]}
  />
  <div class="ticks">
    {#each labels as label, i}
      <button type="button" class="tick" class:active={i === position} onclick={() => onchange(i === 0 ? null : ((i - 1) as Slot))}>{label}</button>
    {/each}
  </div>
  {#if slot !== null}
    <p class="hint">{$_('slider.hint')}</p>
  {/if}
</div>

<style>
  .time-slider { display: flex; flex-direction: column; gap: 0.25rem; }
  input[type='range'] { width: 100%; accent-color: var(--celine-primary, #0d9488); cursor: pointer; }
  .ticks { display: flex; justify-content: space-between; }
  .tick {
    border: 0; background: transparent; padding: 0; font-size: 0.7rem; cursor: pointer;
    color: var(--celine-text-muted, #64748b);
  }
  .tick.active { color: var(--celine-primary, #0d9488); font-weight: 700; }
  .hint { margin: 0.25rem 0 0; font-size: 0.65rem; line-height: 1.3; color: var(--celine-text-muted, #64748b); }
</style>
