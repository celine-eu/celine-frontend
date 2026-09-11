<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { communityStore } from '$lib/stores';
  import { getDataFlow, type DataFlow, type Period } from '$lib/api';

  let dataFlow = $state<DataFlow | null>(null);
  let period = $state<Period>('7d');
  let loading = $state(true);
  let error = $state(false);

  async function load() {
    const community = $communityStore;
    if (!community) return;
    loading = true;
    error = false;
    try { dataFlow = await getDataFlow(community.key, period); }
    catch { error = true; }
    finally { loading = false; }
  }

  function changePeriod(event: Event) {
    period = (event.currentTarget as HTMLSelectElement).value as Period;
    void load();
  }

  function formatDate(value?: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle:'short', timeStyle:'short' }).format(new Date(value));
  }

  function freshness(minutes?: number): string {
    if (minutes === undefined) return '—';
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  onMount(load);
</script>

<svelte:head><title>{$_('nav.data_flow')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading"><div><span>{$_('dataflow.eyebrow')}</span><h1>{$_('dataflow.title')}</h1><p>{$_('dataflow.subtitle')}</p></div><label><small>{$_('common.period')}</small><select value={period} onchange={changePeriod}><option value="today">{$_('period.today')}</option><option value="7d">{$_('period.7d')}</option><option value="30d">{$_('period.30d')}</option></select></label></header>

  {#if loading}<div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
  {:else if error || !dataFlow}<div class="state error"><strong>!</strong><p>{$_('dataflow.error')}</p><button onclick={load}>{$_('error.retry')}</button></div>
  {:else}
    {#if dataFlow.partial}<div class="partial"><strong>{$_('common.partial')}</strong><span>{dataFlow.missingSources.join(', ')}</span></div>{/if}
    <section class="coverage-panel">
      <div class="coverage-score"><div style={`--coverage:${dataFlow.coveragePercent * 3.6}deg`}><strong>{dataFlow.coveragePercent}%</strong><span>{$_('dataflow.coverage')}</span></div></div>
      <div class="coverage-copy"><h2>{$_('dataflow.intervals_title')}</h2><p>{$_('dataflow.intervals_help')}</p><div><article><small>{$_('dataflow.received')}</small><strong>{dataFlow.receivedIntervals.toLocaleString()}</strong></article><article><small>{$_('dataflow.expected')}</small><strong>{dataFlow.expectedIntervals.toLocaleString()}</strong></article><article><small>{$_('dataflow.gaps')}</small><strong>{dataFlow.gapCount}</strong></article></div></div>
    </section>

    <section class="pipeline-panel">
      <header><div><h2>{$_('dataflow.pipelines')}</h2><p>{$_('dataflow.pipelines_help')}</p></div><small>{$_('common.updated')} {formatDate(dataFlow.updatedAt)}</small></header>
      {#if dataFlow.pipelines.length === 0}<div class="state compact"><p>{$_('dataflow.empty')}</p></div>
      {:else}<div class="pipeline-list">{#each dataFlow.pipelines as pipeline}<article><span class={`status-dot ${pipeline.state}`}></span><div class="pipeline-name"><strong>{pipeline.name}</strong><small>{pipeline.id}</small></div><div><small>{$_('dataflow.status')}</small><strong class={`state-label ${pipeline.state}`}>{$_(`pipeline_state.${pipeline.state}`)}</strong></div><div><small>{$_('dataflow.last_success')}</small><strong>{formatDate(pipeline.lastSuccessAt)}</strong></div><div><small>{$_('dataflow.freshness')}</small><strong>{freshness(pipeline.freshnessMinutes)}</strong></div>{#if pipeline.message}<p>{pipeline.message}</p>{/if}</article>{/each}</div>{/if}
    </section>
  {/if}
</div>

<style>
  .page-wrap{max-width:1400px;margin:0 auto;padding:1.6rem 2rem 3rem}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.page-heading>div>span{color:var(--community-primary);font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.11em}h1{margin:.3rem 0;font-size:clamp(1.6rem,3vw,2.25rem)}.page-heading p{margin:0;color:var(--community-muted);font-size:.82rem}.page-heading label{display:grid;gap:.3rem}.page-heading small{color:var(--community-muted);font-size:.6rem;font-weight:700}.page-heading select{height:38px;padding:0 2rem 0 .7rem;border:1px solid var(--community-border);border-radius:9px;background:var(--community-surface);color:var(--community-text)}
  .partial{display:flex;gap:.6rem;align-items:center;margin-bottom:.8rem;padding:.65rem .8rem;border-radius:11px;background:var(--community-warning-soft);color:var(--community-warning);font-size:.65rem}.partial span{color:var(--community-muted)}
  .coverage-panel{display:grid;grid-template-columns:250px 1fr;gap:1rem;padding:1.25rem;border:1px solid var(--community-border);border-radius:16px;background:var(--community-surface);box-shadow:var(--community-shadow)}.coverage-score{display:grid;place-items:center}.coverage-score>div{width:155px;height:155px;display:grid;place-content:center;justify-items:center;border-radius:50%;background:radial-gradient(circle at center,var(--community-surface) 62%,transparent 64%),conic-gradient(var(--community-primary) var(--coverage),var(--community-border) 0)}.coverage-score strong{font-size:1.7rem}.coverage-score span{color:var(--community-muted);font-size:.62rem}.coverage-copy{align-self:center}.coverage-copy h2{margin:0;font-size:1rem}.coverage-copy>p{margin:.35rem 0 1rem;color:var(--community-muted);font-size:.7rem}.coverage-copy>div{display:grid;grid-template-columns:repeat(3,1fr);gap:.65rem}.coverage-copy article{padding:.8rem;border-radius:11px;background:var(--community-surface-soft)}.coverage-copy small,.coverage-copy strong{display:block}.coverage-copy small{color:var(--community-muted);font-size:.58rem}.coverage-copy strong{margin-top:.25rem;font-size:1.05rem}
  .pipeline-panel{margin-top:.9rem;border:1px solid var(--community-border);border-radius:16px;background:var(--community-surface);box-shadow:var(--community-shadow);overflow:hidden}.pipeline-panel>header{display:flex;justify-content:space-between;align-items:flex-start;padding:1rem 1.1rem;border-bottom:1px solid var(--community-border)}.pipeline-panel h2{margin:0;font-size:.9rem}.pipeline-panel header p{margin:.3rem 0 0;color:var(--community-muted);font-size:.67rem}.pipeline-panel header>small{color:var(--community-muted);font-size:.58rem}.pipeline-list article{display:grid;grid-template-columns:auto minmax(190px,1.4fr) repeat(3,minmax(120px,1fr));align-items:center;gap:.8rem;padding:.9rem 1.1rem;border-top:1px solid var(--community-border)}.pipeline-list article:first-child{border-top:0}.status-dot{width:9px;height:9px;border-radius:50%;background:var(--community-muted)}.status-dot.success{background:var(--community-success)}.status-dot.running{background:var(--community-primary);box-shadow:0 0 0 4px var(--community-primary-soft)}.status-dot.stale{background:var(--community-warning)}.status-dot.failed{background:var(--community-danger)}.pipeline-name strong,.pipeline-name small,.pipeline-list article>div>small,.pipeline-list article>div>strong{display:block}.pipeline-name strong{font-size:.72rem}.pipeline-name small,.pipeline-list article>div>small{margin-top:.15rem;color:var(--community-muted);font-size:.56rem}.pipeline-list article>div>strong{margin-top:.2rem;font-size:.66rem}.pipeline-list article>p{grid-column:2/-1;margin:0;padding:.4rem .55rem;border-radius:7px;background:var(--community-warning-soft);color:var(--community-warning);font-size:.59rem}.state-label.success{color:var(--community-success)}.state-label.running{color:var(--community-primary)}.state-label.stale{color:var(--community-warning)}.state-label.failed{color:var(--community-danger)}
  .state{min-height:380px;display:grid;place-content:center;justify-items:center;gap:.6rem;color:var(--community-muted);text-align:center}.state.compact{min-height:180px}.state p{margin:0}.state.error strong{color:var(--community-danger);font-size:1.5rem}.state.error button{padding:.5rem .8rem;border:0;border-radius:9px;background:var(--community-primary);color:white;cursor:pointer}.spinner{width:25px;height:25px;border:3px solid var(--community-border);border-top-color:var(--community-primary);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:850px){.coverage-panel{grid-template-columns:1fr}.pipeline-list article{grid-template-columns:auto 1fr 1fr}.pipeline-list article>div:nth-of-type(n+3){display:none}}
  @media(max-width:600px){.page-wrap{padding:1.1rem .8rem 5rem}.page-heading{align-items:flex-start}.coverage-copy>div{grid-template-columns:1fr}.pipeline-list article{grid-template-columns:auto 1fr}.pipeline-list article>div:nth-of-type(n+2){display:none}}
</style>
