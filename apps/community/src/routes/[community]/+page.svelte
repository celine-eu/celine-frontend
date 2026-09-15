<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { communityStore, meStore } from '$lib/stores';
  import { getOverview, type Overview, type Period } from '$lib/api';

  // Section links carry the REC, like every link in the shell does.
  const base = $derived(`/${encodeURIComponent($communityStore?.key ?? '')}`);
  import KpiCard from '$lib/components/KpiCard.svelte';
  import EnergyChart from '$lib/components/EnergyChart.svelte';

  let period = $state<Period>('30d');
  let overview = $state<Overview | null>(null);
  let loading = $state(true);
  let error = $state(false);

  async function loadOverview() {
    const community = $communityStore;
    if (!community) return;
    loading = true;
    error = false;
    try {
      overview = await getOverview(community.key, period);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  function changePeriod(event: Event) {
    period = (event.currentTarget as HTMLSelectElement).value as Period;
    void loadOverview();
  }

  function formatNumber(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
  }

  function formatUpdated(value: string): string {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  function totalMeters(value: Overview): number {
    return Math.max(
      1,
      value.meterHealth.reporting + value.meterHealth.degraded + value.meterHealth.silent,
    );
  }

  onMount(loadOverview);
</script>

<svelte:head><title>{$_('nav.overview')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <section class="page-heading">
    <div>
      <div class="eyebrow">{$_('overview.eyebrow')}</div>
      <h1>{$_('overview.title')}, {$meStore?.name?.split(' ')[0] ?? 'Manager'}.</h1>
      <p>{$_('overview.subtitle')}</p>
    </div>
    <label class="period-select">
      <span>Periodo</span>
      <select value={period} onchange={changePeriod}>
        <option value="today">{$_('period.today')}</option>
        <option value="7d">{$_('period.7d')}</option>
        <option value="30d">{$_('period.30d')}</option>
      </select>
    </label>
  </section>

  {#if loading}
    <div class="kpi-grid" aria-label="Loading overview">
      {#each Array(4) as item}<div class="skeleton kpi-skeleton" aria-hidden={item === undefined}></div>{/each}
    </div>
    <div class="skeleton body-skeleton"></div>
  {:else if error || !overview}
    <div class="error-state">
      <div>!</div><h2>{$_('error.title')}</h2>
      <button onclick={loadOverview}>{$_('error.retry')}</button>
    </div>
  {:else}
    <div class="meta-row">
      <span
        class:estimated={overview.estimated || overview.partial}
        title={overview.missingSources.join(', ')}
      >{overview.partial ? 'Dati parziali' : overview.estimated ? 'Dati stimati' : 'Dati validati'}</span>
      <small>{$_('common.updated')} {formatUpdated(overview.updatedAt)} · Europe/Rome</small>
    </div>

    <section class="kpi-grid">
      {#each overview.kpis as kpi}
        <KpiCard
          label={$_(`kpi.${kpi.id}`)}
          value={formatNumber(kpi.value)}
          unit={kpi.unit}
          change={kpi.change}
          tone={kpi.id === 'shared' ? 'accent' : 'default'}
        />
      {/each}
    </section>

    <section class="dashboard-grid">
      <article class="panel energy-panel">
        <header><div><h2>{$_('overview.energy')}</h2><p>{$_('overview.energy_help')}</p></div></header>
        <EnergyChart points={overview.energy} />
      </article>

      <article class="panel objectives-panel">
        <header><h2>{$_('overview.objectives')}</h2><span>{period === 'today' ? 'Oggi' : 'Agosto'}</span></header>
        <div class="objective-list">
          {#each overview.objectives as objective}
            <div class="objective">
              <div><strong>{$_(`objective.${objective.id}`)}</strong><span>{objective.current}{objective.unit} / {objective.target}{objective.unit}</span></div>
              <div class="progress" aria-label={`${objective.current} of ${objective.target}`}><span style={`width: ${Math.min(100, (objective.current / objective.target) * 100)}%`}></span></div>
            </div>
          {/each}
        </div>
      </article>

      <article class="panel population-panel">
        <header><div><h2>{$_('overview.population')}</h2><p>{$_('overview.population_help')}</p></div></header>
        <div class="population-grid">
          <div><span>{overview.population.administrativeMembers}</span><small>{$_('population.administrative')}</small></div>
          <div><span>{overview.population.monitoredMembers}</span><small>{$_('population.monitored_members')}</small></div>
          <div><span>{overview.population.monitoredDevices}</span><small>{$_('population.devices')}</small></div>
          <div class:warning={overview.population.unregisteredMeters > 0}><span>{overview.population.unregisteredMeters}</span><small>{$_('population.unregistered')}</small></div>
        </div>
      </article>

      <article class="panel meters-panel">
        <header><h2>{$_('overview.meters')}</h2><a href={`${base}/data-flow`}>Apri dettaglio →</a></header>
        <div class="meter-bar" aria-label="Meter health distribution">
          <span class="reporting" style={`width: ${(overview.meterHealth.reporting / totalMeters(overview)) * 100}%`}></span>
          <span class="degraded" style={`width: ${(overview.meterHealth.degraded / totalMeters(overview)) * 100}%`}></span>
          <span class="silent" style={`width: ${(overview.meterHealth.silent / totalMeters(overview)) * 100}%`}></span>
        </div>
        <div class="meter-stats">
          <div><i class="reporting"></i><span>{$_('meters.reporting')}</span><strong>{overview.meterHealth.reporting}</strong></div>
          <div><i class="degraded"></i><span>{$_('meters.degraded')}</span><strong>{overview.meterHealth.degraded}</strong></div>
          <div><i class="silent"></i><span>{$_('meters.silent')}</span><strong>{overview.meterHealth.silent}</strong></div>
        </div>
      </article>

      <article class="panel window-panel">
        <header><div><h2>{$_('overview.window')}</h2><p>{$_('overview.window_help')}</p></div><span class="window-id">{overview.windowStory.id}</span></header>
        <div class="window-summary">
          <div><strong>{overview.windowStory.deliveredKwh} kWh</strong><span>{$_('chain.delivered_kwh')}</span></div>
          <div><strong>{overview.windowStory.baselineMultiplier}×</strong><span>{$_('chain.baseline')}</span></div>
        </div>
        <div class="chain">
          {#each overview.windowStory.steps as step, index}
            <div class="chain-step">
              <span>{step.value}</span><small title={$_(`chain.${step.id}_help`)}>{$_(`chain.${step.id}`)}</small>
            </div>
            {#if index < overview.windowStory.steps.length - 1}<div class="chain-line"></div>{/if}
          {/each}
        </div>
        <a class="detail-link" href={`${base}/flexibility`}>{$_('overview.view_detail')} →</a>
      </article>
    </section>
  {/if}
</div>

<style>
  .page-wrap { max-width: 1500px; margin: 0 auto; padding: 1.6rem 2rem 3rem; }
  .page-heading { display: flex; justify-content: space-between; align-items: end; gap: 2rem; margin-bottom: 1.15rem; }
  .eyebrow { color: var(--community-primary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.66rem; font-weight: 800; margin-bottom: 0.45rem; }
  h1 { margin: 0; font-size: clamp(1.65rem, 3vw, 2.35rem); line-height: 1.08; letter-spacing: -0.045em; }
  .page-heading p { margin: 0.5rem 0 0; color: var(--community-muted); font-size: 0.84rem; }
  .period-select { display: grid; gap: 0.3rem; }
  .period-select span { color: var(--community-muted); font-size: 0.65rem; font-weight: 700; }
  select { min-width: 160px; padding: 0.62rem 2.1rem 0.62rem 0.8rem; border: 1px solid var(--community-border); border-radius: 11px; background: var(--community-surface); color: var(--community-text); font-size: 0.78rem; font-weight: 650; }
  .meta-row { display: flex; justify-content: flex-end; align-items: center; gap: 0.7rem; margin-bottom: 0.7rem; color: var(--community-muted); }
  .meta-row > span { padding: 0.25rem 0.5rem; border-radius: 999px; background: var(--community-primary-soft); color: var(--community-success); font-size: 0.62rem; font-weight: 750; }
  .meta-row > span.estimated { color: var(--community-warning); background: var(--community-warning-soft); }
  .meta-row small { font-size: 0.65rem; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.85rem; }
  .dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.65fr) minmax(300px, 0.85fr); gap: 0.9rem; margin-top: 0.9rem; align-items: start; }
  .panel { min-width: 0; padding: 1.15rem; border: 1px solid var(--community-border); border-radius: var(--community-radius); background: var(--community-surface); box-shadow: var(--community-shadow); }
  .panel header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
  .panel h2 { margin: 0; font-size: 0.92rem; letter-spacing: -0.02em; }
  .panel header p { margin: 0.3rem 0 0; color: var(--community-muted); font-size: 0.68rem; line-height: 1.45; }
  .panel header > span, .panel header a { color: var(--community-primary); font-size: 0.65rem; font-weight: 700; text-decoration: none; }
  .objectives-panel { grid-row: span 2; }
  .objective-list { display: grid; gap: 1.2rem; }
  .objective > div:first-child { display: flex; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.45rem; }
  .objective strong { font-size: 0.72rem; }
  .objective span { color: var(--community-muted); font-size: 0.66rem; }
  .progress { height: 7px; overflow: hidden; border-radius: 999px; background: var(--community-surface-soft); }
  .progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--community-primary), #34d399); }
  .population-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
  .population-grid > div { min-width: 0; padding: 0.8rem; border-radius: 12px; background: var(--community-surface-soft); }
  .population-grid span, .population-grid small { display: block; }
  .population-grid span { font-size: 1.25rem; font-weight: 780; }
  .population-grid small { margin-top: 0.2rem; color: var(--community-muted); font-size: 0.61rem; line-height: 1.3; }
  .population-grid .warning { background: var(--community-warning-soft); }
  .population-grid .warning span { color: var(--community-warning); }
  .meter-bar { height: 10px; display: flex; overflow: hidden; border-radius: 999px; background: var(--community-border); }
  .meter-bar span { height: 100%; }
  .reporting { background: #16a36a; }
  .degraded { background: #f59e0b; }
  .silent { background: #e05252; }
  .meter-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-top: 1rem; }
  .meter-stats div { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.4rem; color: var(--community-muted); font-size: 0.65rem; }
  .meter-stats i { width: 7px; height: 7px; border-radius: 50%; }
  .meter-stats strong { color: var(--community-text); font-size: 0.78rem; }
  .window-panel { grid-column: 1 / -1; }
  .window-id { padding: 0.3rem 0.55rem; border-radius: 999px; background: var(--community-surface-soft); color: var(--community-muted) !important; }
  .window-summary { display: flex; gap: 2rem; margin-bottom: 1.2rem; }
  .window-summary strong, .window-summary span { display: block; }
  .window-summary strong { font-size: 1.25rem; }
  .window-summary span { color: var(--community-muted); font-size: 0.62rem; }
  .chain { display: flex; align-items: center; }
  .chain-step { flex: 0 0 auto; text-align: center; }
  .chain-step span { width: 38px; height: 38px; display: grid; place-items: center; margin: 0 auto 0.35rem; border-radius: 50%; background: var(--community-primary-soft); color: var(--community-primary-strong); font-size: 0.76rem; font-weight: 800; }
  .chain-step small { color: var(--community-muted); font-size: 0.59rem; font-weight: 650; }
  .chain-line { flex: 1; min-width: 18px; height: 2px; margin: 0 0.4rem 1.2rem; background: var(--community-border); }
  .detail-link { display: block; width: max-content; margin: 1.2rem 0 0 auto; color: var(--community-primary); text-decoration: none; font-size: 0.7rem; font-weight: 750; }
  .skeleton { position: relative; overflow: hidden; border-radius: var(--community-radius); background: var(--community-border); }
  .skeleton::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg, transparent, var(--community-surface), transparent); animation: shine 1.4s infinite; }
  .kpi-skeleton { height: 135px; }
  .body-skeleton { height: 390px; margin-top: 0.9rem; }
  .error-state { min-height: 360px; display: grid; place-content: center; justify-items: center; gap: 0.7rem; text-align: center; }
  .error-state > div { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 50%; background: var(--community-danger-soft); color: var(--community-danger); font-weight: 800; }
  .error-state h2 { margin: 0; font-size: 1rem; }
  .error-state button { border: 0; border-radius: 10px; padding: 0.6rem 1rem; background: var(--community-primary); color: #fff; cursor: pointer; font-weight: 700; }
  @keyframes shine { to { transform: translateX(100%); } }
  @media (max-width: 1100px) {
    .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .dashboard-grid { grid-template-columns: 1fr; }
    .objectives-panel { grid-row: auto; }
    .window-panel { grid-column: auto; }
  }
  @media (max-width: 680px) {
    .page-wrap { padding: 1.2rem 1rem 2rem; }
    .page-heading { align-items: flex-start; flex-direction: column; gap: 1rem; }
    .period-select, select { width: 100%; }
    .kpi-grid { grid-template-columns: 1fr 1fr; gap: 0.6rem; }
    .population-grid { grid-template-columns: 1fr 1fr; }
    .chain { overflow-x: auto; padding-bottom: 0.5rem; }
    .chain-line { min-width: 22px; }
    .meta-row { justify-content: space-between; }
  }
</style>
