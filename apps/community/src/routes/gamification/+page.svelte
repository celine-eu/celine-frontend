<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    getPointsDistribution,
    getPointsLedger,
    type Period,
    type PointsDistribution,
    type PointsLedger,
  } from '$lib/api';
  import { meStore } from '$lib/stores';
  import ExportButtons from '$lib/components/ExportButtons.svelte';

  let period = $state<Period>('30d');
  let distribution = $state<PointsDistribution | null>(null);
  let ledger = $state<PointsLedger | null>(null);
  let loading = $state(true);
  let detailLoading = $state(false);
  let error = $state(false);

  async function load() {
    const me = $meStore;
    if (!me) return;
    loading = true;
    error = false;
    ledger = null;
    try {
      distribution = await getPointsDistribution(me.communityKey, period);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  async function openLedger(deviceId: string) {
    const me = $meStore;
    if (!me) return;
    detailLoading = true;
    try {
      ledger = await getPointsLedger(me.communityKey, deviceId, period);
    } finally {
      detailLoading = false;
    }
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function formatNumber(value: number, maximumFractionDigits = 1): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits }).format(value);
  }

  function bucketHeight(count: number): number {
    const maximum = Math.max(...(distribution?.buckets.map((item) => item.count) ?? [1]));
    return Math.max(8, count / maximum * 100);
  }

  onMount(load);
</script>

<svelte:head><title>{$_('nav.gamification')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading">
    <div><span>{$_('gamification.eyebrow')}</span><h1>{$_('gamification.title')}</h1><p>{$_('gamification.subtitle')}</p></div>
    <div class="heading-actions">
      {#if $meStore}<ExportButtons communityKey={$meStore.communityKey} dataset="points" {period} />{/if}
      <label><span>{$_('common.period')}</span><select bind:value={period} onchange={load}><option value="today">{$_('period.today')}</option><option value="7d">{$_('period.7d')}</option><option value="30d">{$_('period.30d')}</option></select></label>
    </div>
  </header>

  {#if loading}
    <div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
  {:else if error}
    <div class="state error"><strong>!</strong><p>{$_('gamification.error')}</p><button onclick={load}>{$_('error.retry')}</button></div>
  {:else if distribution}
    {#if distribution.partial}<div class="partial">{$_('common.partial')} · {$_('gamification.partial_help')}</div>{/if}
    <section class="metric-grid">
      <article><small>{$_('gamification.coverage')}</small><strong>{formatNumber(distribution.coveragePercent)}%</strong><span>{distribution.awardedDevices} / {distribution.monitoredDevices} {$_('gamification.monitored')}</span></article>
      <article><small>{$_('gamification.median')}</small><strong>{formatNumber(distribution.medianPoints)}</strong><span>{$_('gamification.points')}</span></article>
      <article><small>{$_('gamification.deciles')}</small><strong>{formatNumber(distribution.bottomDecilePoints)}–{formatNumber(distribution.topDecilePoints)}</strong><span>{$_('gamification.bottom_top')}</span></article>
      <article><small>{$_('gamification.concentration')}</small><strong>{formatNumber(distribution.concentrationIndex, 2)}</strong><span>{$_('gamification.concentration_help')}</span></article>
    </section>

    <div class="two-columns">
      <section class="panel distribution">
        <header><div><span>{$_('gamification.distribution')}</span><h2>{$_('gamification.histogram')}</h2></div><small>{$_('gamification.denominator')}</small></header>
        <div class="histogram">
          {#each distribution.buckets as bucket (bucket.label)}
            <div class="bar-wrap"><strong>{bucket.count}</strong><div class="bar"><span style={`height:${bucketHeight(bucket.count)}%`}></span></div><small>{bucket.label}</small></div>
          {/each}
        </div>
      </section>

      <section class="panel leaderboard">
        <header><div><span>{$_('gamification.device_view')}</span><h2>{$_('gamification.leaderboard')}</h2></div></header>
        <div class="leader-list">
          {#each distribution.leaderboard as item (item.deviceId)}
            <button onclick={() => openLedger(item.deviceId)}><b>{item.rank}</b><code>{item.deviceId}</code><strong>{formatNumber(item.points)} pt</strong><span class:negative={item.trend < 0}>{item.trend > 0 ? '↑' : item.trend < 0 ? '↓' : '–'} {formatNumber(Math.abs(item.trend))}</span></button>
          {/each}
        </div>
      </section>
    </div>
  {/if}
</div>

{#if detailLoading}<div class="drawer-backdrop"><div class="drawer" role="dialog" aria-modal="true" aria-label={$_('common.loading')}><div class="state"><div class="spinner"></div></div></div></div>{/if}
{#if ledger && !detailLoading}
  <div class="drawer-backdrop"><button class="backdrop-close" aria-label={$_('common.close')} onclick={() => (ledger = null)}></button><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="ledger-title"><header><div><span>{$_('gamification.ledger')}</span><h2 id="ledger-title">{ledger.deviceId}</h2></div><button onclick={() => (ledger = null)} aria-label={$_('common.close')}>×</button></header><div class="ledger-summary"><div><small>{$_('gamification.settlement')}</small><strong>+{formatNumber(ledger.settlementPoints)}</strong></div><div><small>{$_('gamification.bonus')}</small><strong>+{formatNumber(ledger.bonusPoints)}</strong></div><div><small>{$_('gamification.cap')}</small><strong>{formatNumber(ledger.capAdjustments)}</strong></div><div><small>{$_('gamification.total')}</small><strong>{formatNumber(ledger.totalPoints)}</strong></div></div><div class="ledger-list">{#each ledger.entries as entry (entry.id)}<article><span class={`kind ${entry.kind}`}>{$_(`ledger_kind.${entry.kind}`)}</span><div><strong>{entry.description}</strong><code>{entry.sourceRef}</code><small>{formatDate(entry.occurredAt)}</small></div><b class:negative={entry.points < 0}>{entry.points > 0 ? '+' : ''}{formatNumber(entry.points)}</b></article>{/each}</div><p class="privacy">{$_('gamification.privacy')}</p></div></div>
{/if}

<style>
  .heading-actions{display:flex;align-items:flex-end;gap:.45rem}
  .page-wrap{max-width:1500px;margin:0 auto;padding:1.6rem 2rem 3rem}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.page-heading>div>span,.panel header>div>span,.drawer header span{color:var(--community-primary);font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:.3rem 0;font-size:clamp(1.6rem,3vw,2.25rem)}.page-heading p{margin:0;color:var(--community-muted);font-size:.8rem}.page-heading label{display:grid;gap:.3rem}.page-heading label span{color:var(--community-muted);font-size:.6rem}.page-heading select{height:38px;padding:0 .7rem;border:1px solid var(--community-border);border-radius:9px;background:var(--community-surface);color:var(--community-text)}
  .partial{margin-bottom:.8rem;padding:.7rem;border-radius:10px;background:var(--community-warning-soft);color:var(--community-warning);font-size:.65rem}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem;margin-bottom:.8rem}.metric-grid article,.panel{border:1px solid var(--community-border);border-radius:14px;background:var(--community-surface);box-shadow:var(--community-shadow)}.metric-grid article{padding:1rem}.metric-grid small,.metric-grid strong,.metric-grid span{display:block}.metric-grid small,.metric-grid span{color:var(--community-muted);font-size:.61rem}.metric-grid strong{margin:.4rem 0 .15rem;font-size:1.4rem}.two-columns{display:grid;grid-template-columns:1.3fr .9fr;gap:.8rem;margin-bottom:.8rem}.panel{padding:1rem}.panel>header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}.panel h2{margin:.25rem 0;font-size:.95rem}.panel header>small{color:var(--community-muted);font-size:.58rem}.histogram{height:210px;display:flex;align-items:flex-end;gap:.7rem;padding:1.4rem .5rem 0}.bar-wrap{height:100%;flex:1;display:grid;grid-template-rows:18px 1fr 20px;justify-items:center;gap:.2rem}.bar-wrap>strong{font-size:.58rem}.bar{width:min(42px,80%);height:100%;display:flex;align-items:flex-end;border-radius:6px 6px 2px 2px;background:var(--community-surface-soft);overflow:hidden}.bar span{width:100%;min-height:5px;background:linear-gradient(var(--community-primary),var(--community-primary-strong));border-radius:6px 6px 0 0}.bar-wrap small{color:var(--community-muted);font-size:.52rem}.leader-list{margin-top:.6rem}.leader-list button{width:100%;display:grid;grid-template-columns:25px 1fr auto 35px;align-items:center;gap:.5rem;padding:.65rem .2rem;border:0;border-top:1px solid var(--community-border);background:transparent;color:var(--community-text);text-align:left;cursor:pointer}.leader-list b{display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--community-primary-soft);color:var(--community-primary);font-size:.57rem}.leader-list code{font-size:.62rem}.leader-list strong{font-size:.66rem}.leader-list span{color:var(--community-success);font-size:.56rem}.negative{color:var(--community-danger)!important}
  .state button{padding:.45rem .65rem;border:0;border-radius:8px;background:var(--community-primary);color:#fff;font-size:.58rem;font-weight:700;cursor:pointer}.empty{padding:2rem;color:var(--community-muted);font-size:.7rem;text-align:center}
  .state{min-height:350px;display:grid;place-content:center;justify-items:center;gap:.6rem;color:var(--community-muted);text-align:center}.state p{margin:0}.state.error strong{color:var(--community-danger);font-size:1.5rem}.spinner{width:25px;height:25px;border:3px solid var(--community-border);border-top-color:var(--community-primary);border-radius:50%;animation:spin .8s linear infinite}.drawer-backdrop{position:fixed;inset:0;z-index:80;display:flex;justify-content:flex-end;background:rgba(15,23,42,.34);backdrop-filter:blur(2px)}.backdrop-close{position:absolute;inset:0;width:100%;border:0;background:transparent}.drawer{position:relative;z-index:1;width:min(94vw,540px);height:100%;overflow-y:auto;padding:1.3rem;background:var(--community-surface);box-shadow:-18px 0 50px rgba(15,23,42,.16)}.drawer>header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1rem;border-bottom:1px solid var(--community-border)}.drawer h2{margin:.25rem 0;font-family:monospace;font-size:1rem}.drawer header button{width:34px;height:34px;border:0;border-radius:9px;background:var(--community-surface-soft);color:var(--community-text);font-size:1.2rem}.ledger-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.45rem;margin:1rem 0}.ledger-summary div{padding:.65rem;border-radius:9px;background:var(--community-surface-soft)}.ledger-summary small,.ledger-summary strong{display:block}.ledger-summary small{color:var(--community-muted);font-size:.52rem}.ledger-summary strong{margin-top:.25rem;font-size:.8rem}.ledger-list article{display:grid;grid-template-columns:auto 1fr auto;gap:.7rem;padding:.8rem 0;border-top:1px solid var(--community-border)}.kind{height:max-content;padding:.25rem .4rem;border-radius:999px;background:var(--community-primary-soft);color:var(--community-primary);font-size:.5rem}.kind.cap{background:var(--community-warning-soft);color:var(--community-warning)}.ledger-list strong,.ledger-list code,.ledger-list small{display:block}.ledger-list strong{font-size:.67rem}.ledger-list code,.ledger-list small{margin-top:.2rem;color:var(--community-muted);font-size:.55rem}.ledger-list b{font-size:.72rem;color:var(--community-success)}.privacy{padding:.7rem;border-radius:9px;background:var(--community-primary-soft);color:var(--community-primary-strong);font-size:.61rem;line-height:1.5}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:950px){.metric-grid{grid-template-columns:repeat(2,1fr)}.two-columns{grid-template-columns:1fr}}@media(max-width:650px){.page-wrap{padding:1.1rem .8rem 5rem}.page-heading{align-items:flex-start;flex-direction:column}.heading-actions{width:100%;flex-wrap:wrap}.metric-grid{grid-template-columns:1fr 1fr}.ledger-summary{grid-template-columns:1fr 1fr}}
</style>
