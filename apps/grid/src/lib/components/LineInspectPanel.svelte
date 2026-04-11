<script lang="ts">
  import { _ } from 'svelte-i18n';

  interface Props {
    feature: Record<string, unknown> | null;
    onclose: () => void;
  }

  let { feature, onclose }: Props = $props();

  const WIND_FIELDS = [
    'line_name', 'conductor_type', 'substation_name', 'operational_unit',
    'municipality', 'risk_level', 'date', 'gust_excess', 'wind_speed_max', 'wind_gusts_max',
  ] as const;

  const HEAT_FIELDS = [
    'line_name', 'conductor_type', 'substation_name', 'operational_unit',
    'municipality', 'risk_level', 'date', 'temp_max_c', 'p90_threshold',
    'consecutive_heat_days', 'altitude_band', 'forecast_model',
  ] as const;

  const RISK_COLORS: Record<string, string> = {
    ALERT: '#D00000',
    WARNING: '#F7D000',
    NORMAL: '#00A000',
  };

  function isHeat(f: Record<string, unknown>) {
    return 'temp_max_c' in f || f['conductor_type'] === 'underground_cable';
  }

  function fmt(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return v.toFixed(2).replace(/\.?0+$/, '');
    return String(v);
  }

  function fmtField(key: string, v: unknown): string {
    if (key === 'conductor_type' && typeof v === 'string') {
      return $_(`conductor.${v}`, { default: v });
    }
    return fmt(v);
  }
</script>

{#if feature}
  <aside class="inspect-panel" role="complementary" aria-label="Line details">
    <div class="panel-header">
      <span class="panel-title">{String(feature.line_name ?? $_('panel.line_name'))}</span>
      <button class="close-btn" onclick={onclose} aria-label="Close">✕</button>
    </div>

    {#if feature.risk_level}
      <div
        class="risk-badge"
        style:background={RISK_COLORS[String(feature.risk_level)] ?? '#808080'}
      >
        {feature.risk_level}
      </div>
    {/if}

    <dl class="prop-list">
      {#each (isHeat(feature) ? HEAT_FIELDS : WIND_FIELDS) as key}
        {#if feature[key] !== undefined && feature[key] !== null}
          <div class="prop-row">
            <dt>{$_(`panel.${key}`, { default: key })}</dt>
            <dd>{fmtField(key, feature[key])}</dd>
          </div>
        {/if}
      {/each}
    </dl>
  </aside>
{/if}

<style>
  .inspect-panel {
    position: absolute;
    bottom: 1rem;
    right: 1rem;
    width: 280px;
    max-height: 60vh;
    overflow-y: auto;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    z-index: 50;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem 0.5rem;
    border-bottom: 1px solid var(--celine-border, #e2e8f0);
  }

  .panel-title {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--celine-text, #1e293b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 0.875rem;
    cursor: pointer;
    color: var(--celine-text-muted, #64748b);
    padding: 0.125rem 0.25rem;
    flex-shrink: 0;
  }

  .risk-badge {
    display: inline-block;
    margin: 0.5rem 1rem;
    padding: 0.2rem 0.75rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    color: #fff;
  }

  .prop-list {
    padding: 0.5rem 1rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .prop-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem;
  }

  dt {
    font-size: 0.75rem;
    color: var(--celine-text-muted, #64748b);
  }

  dd {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--celine-text, #1e293b);
    word-break: break-word;
  }
</style>
