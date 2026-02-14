<script lang="ts">
  import { Icon } from '@celine-eu/ui';

  type IconName = 'zap' | 'plug' | 'battery-charging' | 'leaf' | 'activity' | 'trending-up' | 'trending-down';
  type Variant = 'default' | 'production' | 'consumption' | 'self-consumption';
  type Trend = 'up' | 'down' | 'neutral' | null;

  interface Props {
    label: string;
    value: string;
    unit?: string;
    subtext?: string;
    variant?: Variant;
    icon?: IconName;
    trend?: Trend;
    trendValue?: string;
  }

  let { 
    label, 
    value, 
    unit = 'kWh', 
    subtext = '',
    variant = 'default',
    icon = 'activity',
    trend = null,
    trendValue = ''
  }: Props = $props();
</script>

<div class="stat-card stat-card--{variant}">
  <div class="stat-card__header">
    <span class="stat-card__icon">
      <Icon name={icon} size={18} />
    </span>
    <span class="stat-card__label">{label}</span>
  </div>
  
  <div class="stat-card__value-row">
    <span class="stat-card__value">{value}</span>
    <span class="stat-card__unit">{unit}</span>
  </div>

  {#if subtext || (trend && trendValue)}
    <div class="stat-card__footer">
      {#if trend && trendValue}
        <span class="stat-card__trend stat-card__trend--{trend}">
          <Icon name={trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'activity'} size={14} />
          {trendValue}
        </span>
      {/if}
      {#if subtext}
        <span class="stat-card__subtext">{subtext}</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stat-card {
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-md);
    transition: all var(--celine-transition-base);
  }

  .stat-card:hover {
    box-shadow: var(--celine-shadow-md);
  }

  .stat-card__header {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
    margin-bottom: var(--celine-space-sm);
  }

  .stat-card__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--celine-radius-sm);
    background: var(--celine-bg-sunken);
    color: var(--celine-text-secondary);
  }

  .stat-card__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--celine-text-tertiary);
  }

  .stat-card__value-row {
    display: flex;
    align-items: baseline;
    gap: 0.25em;
  }

  .stat-card__value {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--celine-text);
  }

  .stat-card__unit {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--celine-text-secondary);
  }

  .stat-card__footer {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    margin-top: var(--celine-space-sm);
    font-size: 0.8125rem;
  }

  .stat-card__subtext {
    color: var(--celine-text-secondary);
  }

  .stat-card__trend {
    display: inline-flex;
    align-items: center;
    gap: 0.25em;
    font-weight: 500;
  }

  .stat-card__trend--up {
    color: var(--celine-success);
  }

  .stat-card__trend--down {
    color: var(--celine-danger);
  }

  .stat-card__trend--neutral {
    color: var(--celine-text-secondary);
  }

  /* Variant colors */
  .stat-card--production .stat-card__icon {
    background: var(--celine-success-bg);
    color: var(--celine-success);
  }
  .stat-card--production .stat-card__value {
    color: var(--celine-success);
  }

  .stat-card--consumption .stat-card__icon {
    background: var(--celine-warning-bg);
    color: var(--celine-warning);
  }
  .stat-card--consumption .stat-card__value {
    color: var(--celine-warning);
  }

  .stat-card--self-consumption .stat-card__icon {
    background: var(--celine-info-bg);
    color: var(--celine-info);
  }
  .stat-card--self-consumption .stat-card__value {
    color: var(--celine-info);
  }

  /* Responsive */
  @media (min-width: 768px) {
    .stat-card {
      padding: var(--celine-space-lg);
    }

    .stat-card__value {
      font-size: 2rem;
    }
  }
</style>
