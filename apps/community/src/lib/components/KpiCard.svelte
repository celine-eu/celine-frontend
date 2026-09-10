<script lang="ts">
  let {
    label,
    value,
    unit,
    change,
    tone = 'default',
  }: {
    label: string;
    value: string;
    unit: string;
    change: number;
    tone?: 'default' | 'accent';
  } = $props();
</script>

<article class:accent={tone === 'accent'} class="kpi-card">
  <div class="kpi-label">{label}</div>
  <div class="kpi-value">{value}<span>{unit}</span></div>
  <div class:positive={change >= 0} class:negative={change < 0} class="kpi-change">
    <span aria-hidden="true">{change >= 0 ? '↗' : '↘'}</span>
    {Math.abs(change).toFixed(1)}%
  </div>
</article>

<style>
  .kpi-card {
    min-width: 0;
    padding: 1.1rem 1.2rem;
    background: var(--community-surface);
    border: 1px solid var(--community-border);
    border-radius: var(--community-radius);
    box-shadow: var(--community-shadow);
  }

  .kpi-card.accent {
    background: linear-gradient(145deg, var(--community-primary-strong), #0f766e);
    color: #fff;
    border-color: transparent;
  }

  .kpi-label {
    color: var(--community-muted);
    font-size: 0.76rem;
    font-weight: 650;
    letter-spacing: 0.02em;
    margin-bottom: 0.65rem;
  }

  .accent .kpi-label {
    color: rgba(255, 255, 255, 0.76);
  }

  .kpi-value {
    font-size: clamp(1.45rem, 3vw, 2rem);
    font-weight: 760;
    letter-spacing: -0.04em;
  }

  .kpi-value span {
    font-size: 0.75rem;
    font-weight: 600;
    margin-left: 0.35rem;
    letter-spacing: 0;
    opacity: 0.7;
  }

  .kpi-change {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.65rem;
    padding: 0.2rem 0.45rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .positive {
    color: var(--community-success);
    background: var(--community-primary-soft);
  }

  .negative {
    color: var(--community-danger);
    background: var(--community-danger-soft);
  }

  .accent .positive,
  .accent .negative {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }
</style>
