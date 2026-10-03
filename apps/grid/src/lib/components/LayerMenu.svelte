<script lang="ts">
  /**
   * Top-right map menu.
   * Two groups: geometric elements (what is drawn) and risks (how it is coloured),
   * plus a basemap switcher and a colour legend.
   */
  import { _ } from 'svelte-i18n';
  import { layers } from '$lib/stores/layers.svelte';
  import { RISK_COLORS, TREE_TIER_COLORS, THERMAL_TIER_COLORS, UNIFORM_GREY } from '$lib/mapPaint';

  const showRiskLegend = $derived(layers.windRisk || layers.heatRisk);
</script>

<div class="layer-menu" role="group" aria-label={$_('layer.menu')}>
  <fieldset class="group">
    <legend>{$_('layer.group_elements')}</legend>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.overheadBare} />
      <span class="swatch swatch-line-solid"></span>
      {$_('conductor.overhead_bare')}
    </label>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.overheadInsulated} />
      <span class="swatch swatch-line-dotted"></span>
      {$_('conductor.overhead_insulated')}
    </label>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.undergroundCable} />
      <span class="swatch swatch-line-dashed"></span>
      {$_('conductor.underground_cable')}
    </label>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.cabine} />
      <span class="swatch swatch-dot" style:background="#1E88E5"></span>
      {$_('layer.cabine')}
    </label>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.joints} />
      <span class="swatch swatch-dot" style:background={layers.heatRisk ? UNIFORM_GREY : THERMAL_TIER_COLORS.high}></span>
      {$_('layer.joints')}
    </label>
    <!-- Tier colours are only painted when heat-risk colouring is off; with it on,
         joints are grey unless they carry a WARNING/ALERT (see the Heat legend). -->
    {#if layers.joints && !layers.heatRisk}
      <div class="legend" aria-label={$_('legend.thermal')}>
        {#each ['low', 'mid', 'high', 'unmodelled'] as tier}
          <span class="legend-item">
            <span class="swatch swatch-dot" style:background={THERMAL_TIER_COLORS[tier]}></span>
            {$_(`thermal_tier.${tier}`)}
          </span>
        {/each}
      </div>
    {/if}
  </fieldset>

  <fieldset class="group">
    <legend>{$_('layer.group_risks')}</legend>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.windRisk} />
      <span class="swatch swatch-line-solid" style:background={RISK_COLORS.ALERT}></span>
      {$_('layer.wind')}
    </label>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.heatRisk} />
      <span class="swatch swatch-line-dashed" style:background={RISK_COLORS.ALERT}></span>
      {$_('layer.heat')}
    </label>
    <label class="layer-toggle">
      <input type="checkbox" bind:checked={layers.treeStrike} />
      <span class="swatch swatch-line-solid" style:background={TREE_TIER_COLORS.high}></span>
      {$_('layer.tree_strike')}
    </label>
    {#if showRiskLegend}
      <div class="legend" aria-label={$_('legend.risk')}>
        {#each ['ALERT', 'WARNING', 'NORMAL'] as level}
          <span class="legend-item">
            <span class="swatch swatch-dot" style:background={RISK_COLORS[level as keyof typeof RISK_COLORS]}></span>
            {$_(`risk.${level.toLowerCase()}`)}
          </span>
        {/each}
      </div>
    {/if}
    {#if layers.treeStrike}
      <div class="legend" aria-label={$_('legend.tree_strike')}>
        {#each ['low', 'mid', 'high'] as tier}
          <span class="legend-item">
            <span class="swatch swatch-dot" style:background={TREE_TIER_COLORS[tier]}></span>
            {$_(`tree_tier.${tier}`)}
          </span>
        {/each}
      </div>
    {/if}
  </fieldset>

  <fieldset class="group">
    <legend>{$_('layer.basemap')}</legend>
    <div class="segmented" role="radiogroup" aria-label={$_('layer.basemap')}>
      <button
        type="button"
        role="radio"
        aria-checked={layers.basemap === 'auto'}
        class:active={layers.basemap === 'auto'}
        onclick={() => (layers.basemap = 'auto')}
      >{$_('layer.basemap_auto')}</button>
      <button
        type="button"
        role="radio"
        aria-checked={layers.basemap === 'satellite'}
        class:active={layers.basemap === 'satellite'}
        onclick={() => (layers.basemap = 'satellite')}
      >{$_('layer.basemap_satellite')}</button>
    </div>
  </fieldset>
</div>

<style>
  .layer-menu {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: var(--celine-bg-elevated, rgba(255, 255, 255, 0.95));
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    padding: 0.25rem 0.75rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    max-width: 240px;
  }

  .group {
    border: 0;
    margin: 0;
    padding: 0.25rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .group + .group {
    border-top: 1px solid var(--celine-border, #e2e8f0);
    padding-top: 0.5rem;
  }
  .group legend {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--celine-text-muted, #64748b);
    padding: 0;
    margin-bottom: 0.25rem;
  }

  .layer-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--celine-text, #1e293b);
    cursor: pointer;
  }
  .layer-toggle input[type='checkbox'] {
    width: 14px;
    height: 14px;
    cursor: pointer;
    accent-color: var(--celine-primary, #0d9488);
  }

  .swatch {
    width: 18px;
    height: 4px;
    border-radius: 2px;
    display: inline-block;
    flex-shrink: 0;
  }
  .swatch-line-solid { background: #6b7280; }
  .swatch-line-dotted {
    background: repeating-linear-gradient(90deg, #6b7280 0 2px, transparent 2px 5px);
  }
  .swatch-line-dashed {
    background: repeating-linear-gradient(90deg, #6b7280 0 6px, transparent 6px 10px);
  }
  .swatch.swatch-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 2px 0 2px 22px;
    font-size: 11px;
    color: var(--celine-text, #1e293b);
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .segmented {
    display: inline-flex;
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    overflow: hidden;
  }
  .segmented button {
    flex: 1;
    border: 0;
    background: transparent;
    color: var(--celine-text, #1e293b);
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .segmented button.active {
    background: var(--celine-primary, #0d9488);
    color: #fff;
  }
</style>
