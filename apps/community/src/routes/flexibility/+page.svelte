<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    getDemonstrationChain,
    getFlexibilityUptake,
    getFlexibilityWindow,
    getFlexibilityWindows,
    type DemonstrationChain,
    type FlexibilityUptake,
    type FlexibilityWindowDetail,
    type FlexibilityWindows,
    type Period,
  } from '$lib/api';
  import { meStore } from '$lib/stores';
  import ExportButtons from '$lib/components/ExportButtons.svelte';

  let period = $state<Period>('30d');
  let windows = $state<FlexibilityWindows | null>(null);
  let uptake = $state<FlexibilityUptake | null>(null);
  let chain = $state<DemonstrationChain | null>(null);
  let selected = $state<FlexibilityWindowDetail | null>(null);
  let loading = $state(true);
  let detailLoading = $state(false);
  let error = $state(false);

  async function load() {
    const me = $meStore;
    if (!me) return;
    loading = true;
    error = false;
    selected = null;
    try {
      [windows, uptake, chain] = await Promise.all([
        getFlexibilityWindows(me.communityKey, period),
        getFlexibilityUptake(me.communityKey, period),
        getDemonstrationChain(me.communityKey, period),
      ]);
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  async function openWindow(windowId: string) {
    const me = $meStore;
    if (!me) return;
    detailLoading = true;
    try {
      selected = await getFlexibilityWindow(me.communityKey, windowId, period);
    } finally {
      detailLoading = false;
    }
  }

  function formatNumber(value: number, digits = 1): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function mark(value: boolean): string {
    return value ? '✓' : '—';
  }

  onMount(load);
</script>

<svelte:head><title>{$_('nav.flexibility')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading">
    <div>
      <span>{$_('flexibility.eyebrow')}</span>
      <h1>{$_('flexibility.title')}</h1>
      <p>{$_('flexibility.subtitle')}</p>
    </div>
    <div class="heading-actions">{#if $meStore}<ExportButtons communityKey={$meStore.communityKey} dataset="flexibility" {period} />{/if}<label class="period">
      <span>{$_('common.period')}</span>
      <select bind:value={period} onchange={load}>
        <option value="today">{$_('period.today')}</option>
        <option value="7d">{$_('period.7d')}</option>
        <option value="30d">{$_('period.30d')}</option>
      </select>
    </label></div>
  </header>

  {#if loading}
    <div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
  {:else if error}
    <div class="state error">
      <strong>!</strong><p>{$_('flexibility.error')}</p><button onclick={load}>{$_('error.retry')}</button>
    </div>
  {:else if !windows || !uptake || !chain}
    <div class="state"><strong>∅</strong><p>{$_('flexibility.empty')}</p></div>
  {:else}
    {#if windows.partial || chain.partial}
      <div class="partial-banner">
        <strong>{$_('common.partial')}</strong>
        <span>{$_('flexibility.partial_help')}</span>
      </div>
    {/if}

    <section class="metric-grid" aria-label={$_('flexibility.summary')}>
      <article><small>{$_('flexibility.offered')}</small><strong>{formatNumber(uptake.offeredKwh)} <em>kWh</em></strong><span>{uptake.settledWindows} {$_('flexibility.settled_windows')}</span></article>
      <article><small>{$_('flexibility.committed')}</small><strong>{formatNumber(uptake.committedKwh)} <em>kWh</em></strong><span>{uptake.uptakePercent}% {$_('flexibility.uptake')}</span></article>
      <article><small>{$_('flexibility.delivered')}</small><strong>{formatNumber(uptake.deliveredKwh)} <em>kWh</em></strong><span>{uptake.deliveryPercent}% {$_('flexibility.delivery')}</span></article>
      <article class="effort"><small>{$_('flexibility.effort')}</small><strong>{chain.averageEffortMultiplier ? formatNumber(chain.averageEffortMultiplier, 2) : '—'}<em>×</em></strong><span>{$_('flexibility.effort_help')}</span></article>
    </section>

    <section class="story-panel">
      <header>
        <div><span>{$_('flexibility.pathway')}</span><h2>{$_('flexibility.chain_title')}</h2></div>
        <div class="correlation"><small>{$_('flexibility.chain_correlation')}</small><strong>{chain.correlationPercent}%</strong></div>
      </header>
      <p class="story">{chain.summary}</p>
      <p class="chain-help">{$_('flexibility.chain_help')}</p>
      <p class="disclaimer">{$_('flexibility.no_causality')}</p>

      <ol class="chain" aria-label={$_('flexibility.chain_title')}>
        {#each chain.steps as step, index (step.id)}
          <li>
            <div class="step-top">
              <span>{index + 1}</span>
              <div class="step-copy">
                <strong>{$_(`chain.${step.id}`)}</strong>
                <small>{$_(`chain.${step.id}_help`)}</small>
              </div>
            </div>
            <div class="step-count"><strong>{step.count}</strong><small>{$_('flexibility.device_count')}</small></div>
            {#if index > 0}
              <div class="conversion">
                <div><span>{step.conversionPercent}%</span><small>{$_('flexibility.from_previous_step')}</small></div>
                <small class="dropoff">{step.dropOff > 0 ? `${step.dropOff} ${$_('flexibility.did_not_continue')}` : $_('flexibility.no_dropoff')}</small>
              </div>
            {:else}
              <div class="conversion"><div><span>100%</span><small>{$_('flexibility.start')}</small></div></div>
            {/if}
          </li>
        {/each}
      </ol>
    </section>

    <section class="windows-panel">
      <header><div><span>{$_('flexibility.timeline')}</span><h2>{$_('flexibility.windows')}</h2></div><small>{$_('flexibility.windows_help')}</small></header>
      {#if windows.items.length === 0}
        <div class="empty">{$_('flexibility.empty')}</div>
      {:else}
        <div class="window-list">
          {#each windows.items as window (window.id)}
            <article class:upcoming={window.state === 'upcoming'}>
              <div class="timeline-dot"></div>
              <div class="window-main">
                <div class="window-title"><code>{window.id}</code><span class={`tag ${window.state}`}>{$_(`window_state.${window.state}`)}</span><span class={`tag correlation-${window.correlationState}`}>{$_(`correlation_state.${window.correlationState}`)}</span></div>
                <strong>{formatDate(window.start)} → {formatDate(window.end)}</strong>
                <small>{window.model ?? '—'} · {$_('flexibility.confidence')} {window.confidence ? `${formatNumber(window.confidence * 100)}%` : '—'}</small>
              </div>
              <div class="window-numbers">
                <div><small>{$_('flexibility.offered')}</small><strong>{formatNumber(window.offeredKwh)} kWh</strong></div>
                <div><small>{$_('flexibility.delivered')}</small><strong>{formatNumber(window.deliveredKwh)} kWh</strong></div>
                <div><small>{$_('flexibility.devices')}</small><strong>{window.participatingDevices}</strong></div>
              </div>
              <button onclick={() => openWindow(window.id)}>{$_('common.details')} →</button>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

{#if detailLoading}
  <div class="drawer-backdrop"><div class="drawer" role="dialog" aria-modal="true" aria-label={$_('common.loading')}><div class="state"><div class="spinner"></div></div></div></div>
{/if}
{#if selected && !detailLoading}
  <div class="drawer-backdrop">
    <button class="backdrop-close" aria-label={$_('common.close')} onclick={() => (selected = null)}></button>
    <div class="drawer" role="dialog" aria-modal="true" aria-label={$_('flexibility.detail_title')}>
      <header>
        <div><span>{$_('flexibility.detail_title')}</span><h2>{selected.window.id}</h2><small>{formatDate(selected.window.start)}</small></div>
        <button aria-label={$_('common.close')} onclick={() => (selected = null)}>×</button>
      </header>

      {#if selected.partial}
        <div class="partial-banner compact"><strong>{$_('common.partial')}</strong><span>{$_('flexibility.correlation_warning')}</span></div>
      {/if}

      <p class="detail-story">{selected.narrative}</p>
      <div class="detail-kpis">
        <div><small>{$_('flexibility.correlation')}</small><strong>{selected.correlationPercent}%</strong></div>
        <div><small>{$_('flexibility.delivery')}</small><strong>{selected.window.deliveryRate}%</strong></div>
        <div><small>{$_('flexibility.devices')}</small><strong>{selected.devices.length}</strong></div>
      </div>

      <div class="mini-chain">
        {#each selected.steps as step (step.id)}
          <div><small>{$_(`chain.${step.id}`)}</small><strong>{step.count}</strong><span>{step.conversionPercent}%</span></div>
        {/each}
      </div>

      <h3>{$_('flexibility.device_outcomes')}</h3>
      {#if selected.devices.length === 0}
        <p class="empty">{$_('flexibility.pending_outcomes')}</p>
      {:else}
        <div class="table-scroll">
          <table>
            <thead><tr><th>Device ID</th><th>{$_('chain.nudged')}</th><th>{$_('chain.read')}</th><th>{$_('chain.opened')}</th><th>{$_('chain.committed')}</th><th>{$_('flexibility.delivered')}</th><th>{$_('chain.baseline')}</th><th>{$_('flexibility.effort')}</th><th>{$_('chain.points')}</th><th>{$_('flexibility.correlation')}</th></tr></thead>
            <tbody>{#each selected.devices as device (device.deviceId)}<tr><td><code>{device.deviceId}</code></td><td>{mark(device.nudged)}</td><td>{mark(device.read)}</td><td>{mark(device.opened)}</td><td>{mark(device.committed)}</td><td>{device.deliveredKwh === undefined ? '—' : `${formatNumber(device.deliveredKwh)} kWh`}</td><td>{device.baselineKwh === undefined ? '—' : `${formatNumber(device.baselineKwh)} kWh`}</td><td>{device.effortMultiplier === undefined ? '—' : `${formatNumber(device.effortMultiplier, 2)}×`}</td><td>{device.points ?? '—'}</td><td><span class={`tag correlation-${device.correlationState}`}>{$_(`correlation_state.${device.correlationState}`)}</span></td></tr>{/each}</tbody>
          </table>
        </div>
      {/if}
      <p class="privacy">{$_('flexibility.privacy')}</p>
      <p class="disclaimer">{$_('flexibility.no_causality')}</p>
    </div>
  </div>
{/if}

<style>
  .heading-actions{display:flex;align-items:end;gap:.45rem}
  .page-wrap{max-width:1500px;margin:0 auto;padding:1.6rem 2rem 3rem}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1.1rem}.page-heading>div>span,.story-panel header>div>span,.windows-panel header>div>span,.drawer header span{color:var(--community-primary);text-transform:uppercase;letter-spacing:.11em;font-size:.62rem;font-weight:800}h1{margin:.3rem 0;font-size:clamp(1.6rem,3vw,2.25rem)}.page-heading p{margin:0;color:var(--community-muted);font-size:.82rem}.period{display:grid;gap:.3rem}.period span{color:var(--community-muted);font-size:.6rem;font-weight:700}.period select{height:38px;padding:0 .7rem;border:1px solid var(--community-border);border-radius:9px;background:var(--community-surface);color:var(--community-text)}
  .partial-banner{display:flex;gap:.6rem;align-items:center;margin-bottom:.8rem;padding:.7rem .85rem;border:1px solid color-mix(in srgb,var(--community-warning) 30%,transparent);border-radius:11px;background:var(--community-warning-soft);color:var(--community-warning);font-size:.68rem}.partial-banner.compact{margin:1rem 0}.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:.8rem}.metric-grid article{padding:1rem;border:1px solid var(--community-border);border-radius:14px;background:var(--community-surface);box-shadow:var(--community-shadow)}.metric-grid small,.metric-grid strong,.metric-grid span{display:block}.metric-grid small{color:var(--community-muted);font-size:.63rem}.metric-grid strong{margin:.4rem 0 .15rem;font-size:1.45rem}.metric-grid em{color:var(--community-muted);font-size:.7rem;font-style:normal}.metric-grid span{color:var(--community-muted);font-size:.62rem}.metric-grid .effort strong{color:var(--community-primary-strong)}
  .story-panel,.windows-panel{padding:1.1rem;border:1px solid var(--community-border);border-radius:16px;background:var(--community-surface);box-shadow:var(--community-shadow)}.story-panel>header,.windows-panel>header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem}.story-panel h2,.windows-panel h2{margin:.25rem 0 0;font-size:1rem}.correlation{text-align:right}.correlation small,.correlation strong{display:block}.correlation small{color:var(--community-muted);font-size:.58rem}.correlation strong{margin-top:.2rem;color:var(--community-primary);font-size:1rem}.story{margin:1rem 0 .35rem;font-size:.76rem}.disclaimer{margin:.35rem 0 1rem;color:var(--community-muted);font-size:.62rem;line-height:1.5}.chain{display:grid;grid-template-columns:repeat(7,1fr);gap:.45rem;margin:0;padding:0;list-style:none}.chain li{position:relative;min-width:0;padding:.75rem;border:1px solid var(--community-border);border-radius:11px;background:var(--community-surface-soft)}.chain li:not(:last-child)::after{content:'›';position:absolute;right:-.35rem;top:42%;z-index:1;color:var(--community-muted);font-weight:800}.step-top{display:flex;align-items:center;gap:.35rem;min-width:0}.step-top>span{display:grid;place-items:center;width:18px;height:18px;flex:0 0 18px;border-radius:50%;background:var(--community-primary-soft);color:var(--community-primary-strong);font-size:.52rem;font-weight:800}.step-top small{overflow:hidden;color:var(--community-muted);font-size:.55rem;text-overflow:ellipsis}.conversion{display:flex;justify-content:space-between;gap:.2rem;color:var(--community-muted);font-size:.54rem}.conversion span{color:var(--community-primary-strong);font-weight:750}
  .chain-help{margin:.35rem 0;color:var(--community-text);font-size:.65rem;line-height:1.5}.correlation{max-width:190px}.correlation small{line-height:1.35}.step-top{align-items:flex-start;gap:.45rem}.step-copy{min-width:0}.step-copy strong,.step-copy small{display:block}.step-copy strong{font-size:.6rem;line-height:1.3}.step-copy small{margin-top:.3rem;overflow:visible;color:var(--community-muted);font-size:.51rem;line-height:1.4;text-overflow:clip}.step-count{display:flex;align-items:baseline;gap:.3rem;margin:.75rem 0 .45rem}.step-count strong{font-size:1.25rem}.step-count small{color:var(--community-muted);font-size:.52rem}.conversion{display:grid;justify-content:stretch;gap:.3rem}.conversion>div{display:flex;align-items:baseline;gap:.3rem}.conversion .dropoff{line-height:1.35}
  .windows-panel{margin-top:.8rem}.windows-panel>header>small{max-width:430px;color:var(--community-muted);font-size:.62rem;text-align:right;line-height:1.5}.window-list{margin-top:1rem}.window-list article{position:relative;display:grid;grid-template-columns:minmax(240px,1fr) minmax(290px,.8fr) auto;align-items:center;gap:1rem;margin-left:.35rem;padding:.9rem .8rem .9rem 1.2rem;border-left:2px solid var(--community-primary-soft);border-bottom:1px solid var(--community-border)}.window-list article.upcoming{opacity:.75}.timeline-dot{position:absolute;left:-6px;width:10px;height:10px;border:2px solid var(--community-surface);border-radius:50%;background:var(--community-primary)}.window-title{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}.window-title code{color:var(--community-primary-strong);font-size:.68rem;font-weight:750}.window-main>strong,.window-main>small{display:block}.window-main>strong{margin:.4rem 0 .2rem;font-size:.67rem}.window-main>small{color:var(--community-muted);font-size:.58rem}.window-numbers{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem}.window-numbers small,.window-numbers strong{display:block}.window-numbers small{color:var(--community-muted);font-size:.55rem}.window-numbers strong{margin-top:.25rem;font-size:.68rem}.window-list button,.state button{padding:.48rem .7rem;border:0;border-radius:8px;background:var(--community-primary-soft);color:var(--community-primary-strong);font-size:.61rem;font-weight:750;cursor:pointer}.tag{display:inline-block;padding:.24rem .42rem;border-radius:999px;background:var(--community-surface-soft);color:var(--community-muted);font-size:.52rem;font-weight:750}.tag.settled,.tag.correlation-complete{background:var(--community-primary-soft);color:var(--community-success)}.tag.open,.tag.upcoming{background:var(--community-warning-soft);color:var(--community-warning)}.tag.correlation-partial{background:var(--community-warning-soft);color:var(--community-warning)}.tag.correlation-missing{background:var(--community-danger-soft);color:var(--community-danger)}
  .state{min-height:360px;display:grid;place-content:center;justify-items:center;gap:.6rem;color:var(--community-muted);text-align:center}.state p{margin:0}.state.error strong{color:var(--community-danger);font-size:1.5rem}.state.error button{background:var(--community-primary);color:#fff}.spinner{width:25px;height:25px;border:3px solid var(--community-border);border-top-color:var(--community-primary);border-radius:50%;animation:spin .8s linear infinite}.empty{padding:2rem;color:var(--community-muted);font-size:.7rem;text-align:center}
  .drawer-backdrop{position:fixed;inset:0;z-index:80;display:flex;justify-content:flex-end;background:rgba(15,23,42,.34);backdrop-filter:blur(2px)}.backdrop-close{position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent}.drawer{position:relative;z-index:1;width:min(96vw,880px);height:100%;overflow-y:auto;padding:1.3rem;background:var(--community-surface);box-shadow:-18px 0 50px rgba(15,23,42,.16)}.drawer>header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1rem;border-bottom:1px solid var(--community-border)}.drawer h2{margin:.25rem 0;font-family:monospace;font-size:1rem}.drawer header small{color:var(--community-muted);font-size:.6rem}.drawer header button{width:34px;height:34px;border:0;border-radius:9px;background:var(--community-surface-soft);color:var(--community-text);font-size:1.2rem;cursor:pointer}.detail-story{font-size:.73rem;line-height:1.5}.detail-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:.55rem}.detail-kpis div{padding:.7rem;border-radius:10px;background:var(--community-surface-soft)}.detail-kpis small,.detail-kpis strong{display:block}.detail-kpis small{color:var(--community-muted);font-size:.56rem}.detail-kpis strong{margin-top:.25rem;font-size:.82rem}.mini-chain{display:grid;grid-template-columns:repeat(7,1fr);gap:.3rem;margin:1rem 0}.mini-chain div{padding:.55rem;border-radius:8px;background:var(--community-surface-soft)}.mini-chain small,.mini-chain strong,.mini-chain span{display:block}.mini-chain small{overflow:hidden;color:var(--community-muted);font-size:.5rem;text-overflow:ellipsis}.mini-chain strong{margin:.3rem 0;font-size:.82rem}.mini-chain span{color:var(--community-primary);font-size:.52rem}.drawer h3{margin:1.2rem 0 .6rem;font-size:.78rem}.table-scroll{overflow-x:auto;border:1px solid var(--community-border);border-radius:10px}table{width:100%;border-collapse:collapse;font-size:.61rem}th{padding:.6rem;color:var(--community-muted);text-align:left;font-size:.5rem;text-transform:uppercase}td{padding:.65rem .6rem;border-top:1px solid var(--community-border);white-space:nowrap}td code{color:var(--community-primary-strong);font-size:.59rem;font-weight:700}.privacy{margin-top:1rem;padding:.75rem;border-radius:10px;background:var(--community-primary-soft);color:var(--community-primary-strong);font-size:.62rem;line-height:1.5}
  @keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:1150px){.chain{grid-template-columns:repeat(4,1fr)}.chain li::after{display:none}.window-list article{grid-template-columns:1fr auto}.window-numbers{grid-column:1}.metric-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:700px){.page-wrap{padding:1.1rem .8rem 5rem}.page-heading{align-items:flex-start;flex-direction:column}.heading-actions{width:100%;flex-wrap:wrap}.page-heading p{max-width:100%}.metric-grid{grid-template-columns:1fr 1fr}.chain{grid-template-columns:repeat(2,1fr)}.window-list article{grid-template-columns:1fr}.window-numbers{grid-template-columns:repeat(3,1fr)}.window-list button{width:max-content}.windows-panel>header>small{display:none}.mini-chain{grid-template-columns:repeat(4,1fr)}.drawer{padding:.9rem}.detail-kpis{grid-template-columns:1fr 1fr 1fr}}
</style>
