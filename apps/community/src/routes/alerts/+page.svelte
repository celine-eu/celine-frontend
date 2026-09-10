<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    acknowledgeAlert,
    assignAlert,
    getAlerts,
    muteAlert,
    type AlertsResponse,
    type AlertState,
    type ManagerAlert,
    type Severity,
  } from '$lib/api';
  import { meStore } from '$lib/stores';
  import ExportButtons from '$lib/components/ExportButtons.svelte';

  let inbox = $state<AlertsResponse | null>(null);
  let loading = $state(true);
  let error = $state(false);
  let actionId = $state<string | null>(null);
  let severity = $state<Severity | ''>('');
  let filterState = $state<AlertState | ''>('');
  let source = $state('');

  async function load() {
    const me = $meStore;
    if (!me) return;
    loading = true;
    error = false;
    try {
      inbox = await getAlerts(me.communityKey, { severity, state: filterState, source });
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  function updateAlert(updated: ManagerAlert) {
    if (!inbox) return;
    inbox = { ...inbox, items: inbox.items.map((item) => item.id === updated.id ? updated : item) };
  }

  async function acknowledge(alertId: string) {
    const me = $meStore;
    if (!me) return;
    actionId = alertId;
    try { updateAlert(await acknowledgeAlert(me.communityKey, alertId)); } finally { actionId = null; }
  }

  async function mute(alertId: string) {
    const me = $meStore;
    if (!me) return;
    actionId = alertId;
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    try { updateAlert(await muteAlert(me.communityKey, alertId, until)); } finally { actionId = null; }
  }

  async function assign(alertId: string) {
    const me = $meStore;
    if (!me) return;
    actionId = alertId;
    try { updateAlert(await assignAlert(me.communityKey, alertId, me.sub)); } finally { actionId = null; }
  }

  function formatDate(value?: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  onMount(load);
</script>

<svelte:head><title>{$_('nav.alerts')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading"><div><span>{$_('alerts.eyebrow')}</span><h1>{$_('alerts.title')}</h1><p>{$_('alerts.subtitle')}</p></div><div class="heading-actions">{#if $meStore}<ExportButtons communityKey={$meStore.communityKey} dataset="alerts" />{/if}{#if inbox}<div class="total"><strong>{inbox.total}</strong><small>{$_('alerts.results')}</small></div>{/if}</div></header>

  <section class="panel">
    <form class="filters" onsubmit={(event) => { event.preventDefault(); void load(); }}>
      <label><span>{$_('alerts.severity')}</span><select bind:value={severity}><option value="">{$_('common.all')}</option><option value="critical">{$_('severity.critical')}</option><option value="high">{$_('severity.high')}</option><option value="medium">{$_('severity.medium')}</option><option value="low">{$_('severity.low')}</option></select></label>
      <label><span>{$_('alerts.state')}</span><select bind:value={filterState}><option value="">{$_('common.all')}</option><option value="open">{$_('alert_state.open')}</option><option value="acknowledged">{$_('alert_state.acknowledged')}</option><option value="muted">{$_('alert_state.muted')}</option></select></label>
      <label><span>{$_('alerts.source')}</span><select bind:value={source}><option value="">{$_('common.all')}</option><option value="meter-health">{$_('alert_source.meter-health')}</option><option value="gamification">{$_('alert_source.gamification')}</option><option value="flexibility">{$_('alert_source.flexibility')}</option><option value="anti-gaming">{$_('alert_source.anti-gaming')}</option></select></label>
      <button>{$_('common.apply')}</button>
    </form>

    {#if loading}<div class="state-view"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
    {:else if error}<div class="state-view error"><strong>!</strong><p>{$_('alerts.error')}</p><button onclick={load}>{$_('error.retry')}</button></div>
    {:else if !inbox || inbox.items.length === 0}<div class="state-view"><strong>✓</strong><p>{$_('alerts.empty')}</p></div>
    {:else}<div class="alert-list">{#each inbox.items as alert (alert.id)}<article class={`severity-border ${alert.severity}`}><div class="alert-icon"><span>{alert.severity === 'critical' ? '!' : alert.severity === 'high' ? '↑' : '•'}</span></div><div class="alert-main"><div class="meta"><span class={`tag ${alert.severity}`}>{$_(`severity.${alert.severity}`)}</span><span class="tag neutral">{$_(`alert_source.${alert.source}`)}</span><span class={`tag state-${alert.state}`}>{$_(`alert_state.${alert.state}`)}</span></div><h2>{alert.title}</h2><p>{alert.detail}</p><small>{formatDate(alert.createdAt)}{#if alert.resourceId} · <code>{alert.resourceId}</code>{/if}{#if alert.assignedTo} · {$_('alerts.assigned_to')} <code>{alert.assignedTo}</code>{/if}{#if alert.mutedUntil} · {$_('alerts.muted_until')} {formatDate(alert.mutedUntil)}{/if}</small></div><div class="actions"><button disabled={alert.acknowledged || actionId === alert.id} onclick={() => acknowledge(alert.id)}>{alert.acknowledged ? $_('alerts.acknowledged') : $_('alerts.ack')}</button><button class="secondary" disabled={actionId === alert.id} onclick={() => mute(alert.id)}>{$_('alerts.mute_24h')}</button><button class="secondary" disabled={actionId === alert.id || Boolean(alert.assignedTo)} onclick={() => assign(alert.id)}>{alert.assignedTo ? $_('alerts.assigned') : $_('alerts.assign_me')}</button></div></article>{/each}</div>{/if}
  </section>
  <p class="audit-notice">{$_('alerts.audit_notice')}</p>
</div>

<style>
  .heading-actions{display:flex;align-items:flex-end;gap:.65rem}
  .page-wrap{max-width:1400px;margin:0 auto;padding:1.6rem 2rem 3rem}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.page-heading>div>span{color:var(--community-primary);font-size:.62rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:.3rem 0;font-size:clamp(1.6rem,3vw,2.25rem)}.page-heading p{margin:0;color:var(--community-muted);font-size:.8rem}.total{text-align:right}.total strong,.total small{display:block}.total strong{font-size:1.45rem}.total small{color:var(--community-muted);font-size:.58rem}.panel{overflow:hidden;border:1px solid var(--community-border);border-radius:15px;background:var(--community-surface);box-shadow:var(--community-shadow)}.filters{display:grid;grid-template-columns:repeat(3,1fr) auto;gap:.7rem;align-items:end;padding:1rem;border-bottom:1px solid var(--community-border);background:var(--community-surface-soft)}.filters label{display:grid;gap:.3rem}.filters label span{color:var(--community-muted);font-size:.59rem;font-weight:700}.filters select{height:38px;padding:0 .65rem;border:1px solid var(--community-border);border-radius:9px;background:var(--community-surface);color:var(--community-text)}.filters button,.state-view button{height:38px;padding:0 .9rem;border:0;border-radius:9px;background:var(--community-primary);color:#fff;font-weight:700;cursor:pointer}
  .alert-list{padding:0 1rem}.alert-list article{display:grid;grid-template-columns:auto 1fr auto;gap:.8rem;align-items:start;padding:1rem .3rem;border-bottom:1px solid var(--community-border);border-left:3px solid transparent}.alert-list article.severity-border.critical{border-left-color:var(--community-danger)}.alert-list article.severity-border.high{border-left-color:#f97316}.alert-list article.severity-border.medium{border-left-color:var(--community-warning)}.alert-list article.severity-border.low{border-left-color:var(--community-primary)}.alert-icon span{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--community-surface-soft);color:var(--community-muted);font-weight:800}.meta{display:flex;gap:.35rem;flex-wrap:wrap}.tag{padding:.25rem .43rem;border-radius:999px;font-size:.51rem;font-weight:750}.tag.low,.tag.state-open{background:var(--community-primary-soft);color:var(--community-primary)}.tag.medium,.tag.state-muted{background:var(--community-warning-soft);color:var(--community-warning)}.tag.high,.tag.critical{background:var(--community-danger-soft);color:var(--community-danger)}.tag.neutral,.tag.state-acknowledged{background:var(--community-surface-soft);color:var(--community-muted)}.alert-main h2{margin:.45rem 0 .25rem;font-size:.76rem}.alert-main p{margin:0;color:var(--community-muted);font-size:.65rem;line-height:1.45}.alert-main>small{display:block;margin-top:.45rem;color:var(--community-muted);font-size:.55rem}.alert-main code{color:var(--community-primary-strong);font-size:.55rem}.actions{display:flex;gap:.35rem;align-items:center}.actions button{padding:.42rem .6rem;border:0;border-radius:8px;background:var(--community-primary);color:#fff;font-size:.55rem;font-weight:700;cursor:pointer}.actions button.secondary{background:var(--community-primary-soft);color:var(--community-primary-strong)}.actions button:disabled{opacity:.45;cursor:default}.state-view{min-height:340px;display:grid;place-content:center;justify-items:center;gap:.6rem;color:var(--community-muted)}.state-view p{margin:0}.state-view.error strong{color:var(--community-danger);font-size:1.5rem}.spinner{width:25px;height:25px;border:3px solid var(--community-border);border-top-color:var(--community-primary);border-radius:50%;animation:spin .8s linear infinite}.audit-notice{margin:.7rem .2rem;color:var(--community-muted);font-size:.59rem;text-align:right}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:900px){.alert-list article{grid-template-columns:auto 1fr}.actions{grid-column:2;flex-wrap:wrap}}@media(max-width:650px){.page-wrap{padding:1.1rem .8rem 5rem}.page-heading{align-items:flex-start;flex-direction:column}.heading-actions{width:100%;flex-wrap:wrap}.filters{grid-template-columns:1fr 1fr}.filters button{grid-column:span 2}.alert-list{padding:0 .6rem}.alert-list article{grid-template-columns:1fr}.alert-icon{display:none}.actions{grid-column:1}}
</style>
