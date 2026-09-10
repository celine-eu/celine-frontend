<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { meStore } from '$lib/stores';
  import ExportButtons from '$lib/components/ExportButtons.svelte';
  import {
    getDevice,
    getDevices,
    type DeviceDetailResponse,
    type DeviceList,
    type DeviceStatus,
    type EngagementState,
  } from '$lib/api';

  let board = $state<DeviceList | null>(null);
  let selected = $state<DeviceDetailResponse | null>(null);
  let loading = $state(true);
  let detailLoading = $state(false);
  let error = $state(false);
  let search = $state('');
  let status = $state<DeviceStatus | ''>('');
  let engagement = $state<EngagementState | ''>('');
  let sort = $state<'device_id' | 'last_seen' | 'gap_minutes' | 'coverage_percent' | 'points_30d'>('gap_minutes');
  let page = $state(1);
  const pageSize = 8;

  async function loadDevices(reset = false) {
    const me = $meStore;
    if (!me) return;
    if (reset) page = 1;
    loading = true;
    error = false;
    try {
      board = await getDevices(me.communityKey, {
        period: '30d', search, status, engagement, sort, order: sort === 'device_id' ? 'asc' : 'desc', page, pageSize,
      });
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  async function openDevice(deviceId: string) {
    const me = $meStore;
    if (!me) return;
    detailLoading = true;
    try {
      selected = await getDevice(me.communityKey, deviceId);
    } finally {
      detailLoading = false;
    }
  }

  function applyFilters(event: SubmitEvent) {
    event.preventDefault();
    void loadDevices(true);
  }

  function changePage(value: number) {
    page = value;
    void loadDevices();
  }

  function formatDate(value?: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function formatGap(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    return `${Math.floor(minutes / 1440)} g ${Math.floor((minutes % 1440) / 60)} h`;
  }

  onMount(loadDevices);
</script>

<svelte:head><title>{$_('nav.devices')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading">
    <div><span>{$_('devices.eyebrow')}</span><h1>{$_('devices.title')}</h1><p>{$_('devices.subtitle')}</p></div>
    <div class="heading-actions">{#if $meStore}<ExportButtons communityKey={$meStore.communityKey} dataset="devices" period="30d" />{/if}{#if board?.partial}<div class="partial" title={board.missingSources.join(', ')}>{$_('common.partial')}</div>{/if}</div>
  </header>

  {#if board}
    <section class="summary-grid" aria-label={$_('devices.summary')}>
      <article class="summary reporting"><small>{$_('meters.reporting')}</small><strong>{board.summary.reporting}</strong></article>
      <article class="summary degraded"><small>{$_('meters.degraded')}</small><strong>{board.summary.degraded}</strong></article>
      <article class="summary silent"><small>{$_('meters.silent')}</small><strong>{board.summary.silent}</strong></article>
      <article class="summary engagement"><small>{$_('devices.active')}</small><strong>{board.summary.active}</strong><span>{board.summary.dormant} {$_('devices.dormant').toLowerCase()} · {board.summary.neverActivated} {$_('devices.never_activated').toLowerCase()}</span></article>
    </section>
  {/if}

  <section class="table-panel">
    <form class="filters" onsubmit={applyFilters}>
      <label class="search"><span>{$_('devices.search')}</span><input bind:value={search} placeholder="IT001E…" /></label>
      <label><span>{$_('devices.meter_status')}</span><select bind:value={status}><option value="">{$_('common.all')}</option><option value="reporting">{$_('meters.reporting')}</option><option value="degraded">{$_('meters.degraded')}</option><option value="silent">{$_('meters.silent')}</option></select></label>
      <label><span>{$_('devices.engagement')}</span><select bind:value={engagement}><option value="">{$_('common.all')}</option><option value="active">{$_('devices.active')}</option><option value="dormant">{$_('devices.dormant')}</option><option value="never-activated">{$_('devices.never_activated')}</option></select></label>
      <label><span>{$_('common.sort')}</span><select bind:value={sort}><option value="gap_minutes">{$_('devices.gap')}</option><option value="last_seen">{$_('devices.last_seen')}</option><option value="coverage_percent">{$_('devices.coverage')}</option><option value="points_30d">{$_('devices.points')}</option><option value="device_id">Device ID</option></select></label>
      <button type="submit">{$_('common.apply')}</button>
    </form>

    {#if loading}
      <div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
    {:else if error}
      <div class="state error"><strong>!</strong><p>{$_('devices.error')}</p><button onclick={() => loadDevices()}>{$_('error.retry')}</button></div>
    {:else if !board || board.items.length === 0}
      <div class="state"><strong>∅</strong><p>{$_('devices.empty')}</p></div>
    {:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>Device ID</th><th>{$_('devices.last_seen')}</th><th>{$_('devices.gap')}</th><th>{$_('devices.coverage')}</th><th>{$_('devices.points')}</th><th>{$_('devices.engagement')}</th><th>{$_('devices.meter_status')}</th><th></th></tr></thead>
          <tbody>
            {#each board.items as device}
              <tr>
                <td><code>{device.deviceId}</code></td><td>{formatDate(device.lastSeen)}</td><td>{formatGap(device.gapMinutes)}</td>
                <td><div class="coverage"><span style={`width:${device.coveragePercent}%`}></span></div><small>{device.coveragePercent}%</small></td>
                <td>{device.points30d}</td><td><span class="tag neutral">{$_(`device_engagement.${device.engagementState}`)}</span></td>
                <td><span class={`tag ${device.meterStatus}`}>{$_(`meter_state.${device.meterStatus}`)}</span></td>
                <td><button class="detail" onclick={() => openDevice(device.deviceId)}>{$_('common.details')}</button></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <footer class="pagination"><span>{board.total} {$_('devices.results')}</span><div><button disabled={page === 1} onclick={() => changePage(page - 1)}>←</button><strong>{page}</strong><button disabled={page * pageSize >= board.total} onclick={() => changePage(page + 1)}>→</button></div></footer>
    {/if}
  </section>
</div>

{#if detailLoading}<div class="drawer-backdrop"><div class="drawer" role="dialog" aria-modal="true" aria-label={$_('common.loading')}><div class="state"><div class="spinner"></div></div></div></div>{/if}
{#if selected && !detailLoading}
  <div class="drawer-backdrop">
    <button class="backdrop-close" aria-label={$_('common.close')} onclick={() => (selected = null)}></button>
    <div class="drawer" role="dialog" aria-modal="true" aria-label={$_('devices.detail_title')}>
      <header><div><span>{$_('devices.detail_title')}</span><h2>{selected.device.deviceId}</h2></div><button aria-label={$_('common.close')} onclick={() => (selected = null)}>×</button></header>
      {#if selected.partial}<div class="partial">{$_('common.partial')}</div>{/if}
      <section class="detail-grid">
        <div><small>{$_('devices.meter_status')}</small><strong class={`status-text ${selected.device.meterStatus}`}>{$_(`meter_state.${selected.device.meterStatus}`)}</strong></div>
        <div><small>{$_('devices.engagement')}</small><strong>{$_(`device_engagement.${selected.device.engagementState}`)}</strong></div>
        <div><small>{$_('devices.last_seen')}</small><strong>{formatDate(selected.device.lastSeen)}</strong></div>
        <div><small>{$_('devices.coverage')}</small><strong>{selected.device.coveragePercent}%</strong></div>
        <div><small>{$_('devices.received_intervals')}</small><strong>{selected.device.receivedIntervals} / {selected.device.expectedIntervals}</strong></div>
        <div><small>{$_('devices.points')}</small><strong>{selected.device.points30d}</strong></div>
      </section>
      <section class="gaps"><h3>{$_('devices.gaps_title')}</h3>{#if selected.device.gaps.length === 0}<p>{$_('devices.no_gaps')}</p>{:else}{#each selected.device.gaps as gap}<article><div><strong>{formatGap(gap.sizeMinutes)}</strong><span>{formatDate(gap.start)} → {formatDate(gap.end)}</span></div><small>{gap.expectedIntervals} {$_('devices.intervals_missing')}</small></article>{/each}{/if}</section>
      <p class="privacy">{$_('devices.privacy')}</p>
    </div>
  </div>
{/if}

<style>
  .page-wrap { max-width: 1500px; margin: 0 auto; padding: 1.6rem 2rem 3rem; }
  .page-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:1rem; margin-bottom:1.1rem; }
  .heading-actions { display:flex; align-items:center; gap:.5rem; }
  .page-heading span { color:var(--community-primary); text-transform:uppercase; letter-spacing:.11em; font-size:.65rem; font-weight:800; }
  h1 { margin:.3rem 0; font-size:clamp(1.6rem,3vw,2.25rem); } .page-heading p { margin:0; color:var(--community-muted); font-size:.82rem; }
  .partial { width:max-content; padding:.35rem .6rem; border-radius:999px; background:var(--community-warning-soft); color:var(--community-warning); font-size:.65rem; font-weight:750; }
  .summary-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:.75rem; margin-bottom:.9rem; }
  .summary { padding:1rem; border:1px solid var(--community-border); border-radius:14px; background:var(--community-surface); box-shadow:var(--community-shadow); }
  .summary small,.summary strong,.summary span { display:block; } .summary small { color:var(--community-muted); font-size:.65rem; } .summary strong { margin:.35rem 0 .1rem; font-size:1.65rem; } .summary span { color:var(--community-muted); font-size:.6rem; }
  .summary.reporting strong { color:var(--community-success); } .summary.degraded strong { color:var(--community-warning); } .summary.silent strong { color:var(--community-danger); }
  .table-panel { overflow:hidden; border:1px solid var(--community-border); border-radius:16px; background:var(--community-surface); box-shadow:var(--community-shadow); }
  .filters { display:grid; grid-template-columns:1.4fr repeat(3,1fr) auto; gap:.65rem; align-items:end; padding:1rem; border-bottom:1px solid var(--community-border); background:var(--community-surface-soft); }
  label { display:grid; gap:.3rem; } label span { color:var(--community-muted); font-size:.61rem; font-weight:700; }
  input,select { min-width:0; height:38px; padding:0 .65rem; border:1px solid var(--community-border); border-radius:9px; background:var(--community-surface); color:var(--community-text); font-size:.72rem; }
  button { border:0; border-radius:9px; cursor:pointer; } .filters button { height:38px; padding:0 1rem; background:var(--community-primary); color:white; font-weight:700; }
  .table-scroll { overflow-x:auto; } table { width:100%; border-collapse:collapse; font-size:.7rem; } th { padding:.75rem; color:var(--community-muted); text-align:left; font-size:.58rem; text-transform:uppercase; letter-spacing:.05em; } td { padding:.8rem .75rem; border-top:1px solid var(--community-border); white-space:nowrap; } code { color:var(--community-primary-strong); font-size:.68rem; font-weight:700; }
  .coverage { display:inline-block; width:64px; height:5px; margin-right:.4rem; overflow:hidden; border-radius:4px; background:var(--community-border); vertical-align:middle; }.coverage span { display:block; height:100%; background:var(--community-primary); }.coverage + small { color:var(--community-muted); }
  .tag { display:inline-block; padding:.28rem .48rem; border-radius:999px; font-size:.58rem; font-weight:750; }.tag.reporting { color:var(--community-success); background:var(--community-primary-soft); }.tag.degraded { color:var(--community-warning); background:var(--community-warning-soft); }.tag.silent { color:var(--community-danger); background:var(--community-danger-soft); }.tag.neutral { color:var(--community-muted); background:var(--community-surface-soft); }
  .detail { padding:.35rem .55rem; background:var(--community-primary-soft); color:var(--community-primary-strong); font-size:.62rem; font-weight:700; }
  .pagination { display:flex; justify-content:space-between; align-items:center; padding:.75rem 1rem; border-top:1px solid var(--community-border); color:var(--community-muted); font-size:.65rem; }.pagination div { display:flex; align-items:center; gap:.55rem; }.pagination button { width:30px; height:30px; background:var(--community-surface-soft); color:var(--community-text); }.pagination button:disabled { opacity:.35; cursor:not-allowed; }
  .state { min-height:280px; display:grid; place-content:center; justify-items:center; gap:.6rem; color:var(--community-muted); text-align:center; }.state p { margin:0; }.state.error strong { color:var(--community-danger); font-size:1.5rem; }.state.error button { padding:.5rem .8rem; background:var(--community-primary); color:white; }.spinner { width:25px; height:25px; border:3px solid var(--community-border); border-top-color:var(--community-primary); border-radius:50%; animation:spin .8s linear infinite; }
  .drawer-backdrop { position:fixed; inset:0; z-index:80; display:flex; justify-content:flex-end; background:rgba(15,23,42,.34); backdrop-filter:blur(2px); }.drawer { width:min(92vw,510px); height:100%; overflow-y:auto; padding:1.3rem; background:var(--community-surface); box-shadow:-18px 0 50px rgba(15,23,42,.16); }.drawer > header { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:1rem; border-bottom:1px solid var(--community-border); }.drawer header span { color:var(--community-primary); font-size:.6rem; font-weight:800; text-transform:uppercase; letter-spacing:.1em; }.drawer h2 { margin:.3rem 0 0; font-family:monospace; font-size:1rem; }.drawer header button { width:34px; height:34px; background:var(--community-surface-soft); color:var(--community-text); font-size:1.2rem; }
  .backdrop-close { position:absolute; inset:0; width:100%; height:100%; border-radius:0; background:transparent; }
  .drawer { position:relative; z-index:1; }
  .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:.7rem; margin:1rem 0; }.detail-grid div { padding:.8rem; border-radius:11px; background:var(--community-surface-soft); }.detail-grid small,.detail-grid strong { display:block; }.detail-grid small { color:var(--community-muted); font-size:.58rem; }.detail-grid strong { margin-top:.3rem; font-size:.75rem; }.status-text.reporting { color:var(--community-success); }.status-text.degraded { color:var(--community-warning); }.status-text.silent { color:var(--community-danger); }
  .gaps h3 { margin:1.3rem 0 .6rem; font-size:.8rem; }.gaps > p { color:var(--community-muted); font-size:.7rem; }.gaps article { display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.75rem 0; border-top:1px solid var(--community-border); }.gaps article strong,.gaps article span { display:block; }.gaps article strong { font-size:.72rem; }.gaps article span,.gaps article small { margin-top:.2rem; color:var(--community-muted); font-size:.6rem; }.privacy { margin-top:1.4rem; padding:.75rem; border-radius:10px; background:var(--community-primary-soft); color:var(--community-primary-strong); font-size:.64rem; line-height:1.5; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:1050px){.summary-grid{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:1fr 1fr 1fr}.search{grid-column:span 2}}
  @media(max-width:650px){.page-wrap{padding:1.1rem .8rem 5rem}.summary-grid{grid-template-columns:1fr 1fr}.filters{grid-template-columns:1fr}.search{grid-column:auto}.page-heading{align-items:flex-start;flex-direction:column}.heading-actions{width:100%;flex-wrap:wrap}.detail-grid{grid-template-columns:1fr}}
</style>
