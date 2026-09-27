<script lang="ts">
  import { onMount } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import {
    attachMeter,
    detachMeter,
    getMemberMeters,
    getMembers,
    sendMemberEmail,
    type MemberMeter,
    type MemberSummary,
    type MeterOutcome,
    type MeterType,
  } from '$lib/api';
  import { outcomeMessage, type OutcomeMessage, type SendIntent } from '$lib/memberSend';
  import { METER_TYPES, SENSOR_ID_MAX_LENGTH, defaultMeterType, meterOutcomeMessage, normalizeSensorId } from '$lib/memberMeter';
  import { communityStore } from '$lib/stores';
  import MemberSends from '$lib/components/MemberSends.svelte';

  // The one page that shows participants by name. Names are held in this
  // component's state only, for as long as the page is open: nothing is written
  // to storage, and nothing here is exported.
  const statuses = ['active', 'pending', 'suspended', 'inactive'];

  let members = $state<MemberSummary[]>([]);
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(false);
  let search = $state('');
  let status = $state('');
  let view = $state<'members' | 'sends'>('members');

  // The buttons exist only with `members.invite`, which `/api/me` reports only
  // when this deployment can send.
  const canInvite = $derived(($communityStore?.capabilities ?? []).includes('members.invite'));

  // Confirmation is the decision: nothing is requested until the manager confirms
  // in the dialog. One press at a time, so a double click cannot become a cooldown.
  let pending = $state<{ member: MemberSummary; intent: SendIntent } | null>(null);
  let sending = $state(false);
  let outcomes = $state<Record<string, OutcomeMessage>>({});

  function ask(member: MemberSummary, intent: SendIntent) {
    if (sending || member.status !== 'active') return;
    pending = { member, intent };
  }

  async function confirmSend() {
    const community = $communityStore;
    const request = pending;
    if (!community || !request || sending) return;
    sending = true;
    try {
      const outcome = await sendMemberEmail(community.key, request.member.key, request.intent);
      outcomes = {
        ...outcomes,
        [request.member.key]: outcomeMessage(outcome, (key, options) => $_(key, options), $locale ?? 'en'),
      };
    } finally {
      sending = false;
      pending = null;
    }
  }

  // The meter dialog (celine-community ADR-0004). The sensor id is typed, never
  // offered: no list, no suggestion, no lookup of unattached meters (D18). It lives
  // in this component's state while the dialog is open and is cleared when it
  // closes: never in browser storage, never in a URL. The list shows only whether a
  // member has a meter, and no outcome sentence carries the id.
  const canMeter = $derived(($communityStore?.capabilities ?? []).includes('members.meter'));

  type MeterConfirm = { press: 'attach'; sensorId: string; meterType: MeterType } | { press: 'detach'; sensorId: string };

  let meterFor = $state<MemberSummary | null>(null);
  let meterList = $state<MemberMeter[]>([]);
  let meterReading = $state(false);
  let meterReadFailed = $state(false);
  let sensorInput = $state('');
  let meterType = $state<MeterType>('consumption');
  let meterConfirm = $state<MeterConfirm | null>(null);
  let meterBusy = $state(false);
  let meterMessage = $state<OutcomeMessage | null>(null);
  let meterOutcomes = $state<Record<string, OutcomeMessage>>({});
  // A read answered after the dialog moved on to another member is dropped.
  let meterRead = 0;

  function meterSentence(outcome: MeterOutcome): OutcomeMessage {
    return meterOutcomeMessage(outcome, (key, options) => $_(key, options));
  }

  function setHasMeter(memberKey: string, value: boolean | null) {
    members = members.map((item) => (item.key === memberKey ? { ...item, hasMeter: value } : item));
  }

  async function readMeters(member: MemberSummary): Promise<boolean> {
    const community = $communityStore;
    if (!community) return false;
    const ticket = ++meterRead;
    meterReading = true;
    meterReadFailed = false;
    try {
      const read = await getMemberMeters(community.key, member.key);
      if (ticket !== meterRead || meterFor?.key !== member.key) return false;
      if (read.ok) {
        meterList = read.meters.meters;
        if (!sensorInput) meterType = read.meters.defaultMeterType;
        setHasMeter(member.key, meterList.length > 0);
        return true;
      }
      meterList = [];
      meterReadFailed = true;
      meterMessage = meterSentence(read.outcome);
      return false;
    } finally {
      if (ticket === meterRead) meterReading = false;
    }
  }

  function openMeter(member: MemberSummary) {
    if (meterBusy) return;
    meterFor = member;
    meterList = [];
    sensorInput = '';
    meterType = defaultMeterType(member.role);
    meterConfirm = null;
    meterMessage = null;
    void readMeters(member);
  }

  function closeMeter() {
    if (meterBusy) return;
    meterRead++;
    meterFor = null;
    meterList = [];
    sensorInput = '';
    meterConfirm = null;
    meterMessage = null;
  }

  function askAttach() {
    if (meterBusy) return;
    const sensorId = normalizeSensorId(sensorInput);
    if (!sensorId) {
      // Refused here, before any request: the BFF would answer `sensor_id_blank`.
      meterMessage = meterSentence({ status: 422, code: 'sensor_id_blank', press: 'attach' });
      return;
    }
    meterMessage = null;
    meterConfirm = { press: 'attach', sensorId, meterType };
  }

  function askDetach(meter: MemberMeter) {
    if (meterBusy) return;
    meterMessage = null;
    meterConfirm = { press: 'detach', sensorId: meter.sensorId };
  }

  // Confirmation is the decision, and one press is in flight at a time.
  async function confirmMeter() {
    const community = $communityStore;
    const member = meterFor;
    const request = meterConfirm;
    if (!community || !member || !request || meterBusy) return;
    meterBusy = true;
    try {
      const outcome =
        request.press === 'attach'
          ? await attachMeter(community.key, member.key, request.sensorId, request.meterType)
          : await detachMeter(community.key, member.key, request.sensorId);
      const message = meterSentence(outcome);
      meterMessage = message;
      meterOutcomes = { ...meterOutcomes, [member.key]: message };
      if (outcome.code === 'attached' || outcome.code === 'already_attached') {
        sensorInput = '';
        setHasMeter(member.key, true);
      }
      if (outcome.code === 'attached' || outcome.code === 'detached' || outcome.code === 'meter_not_found') {
        // The list's flag follows the member's meters as the registry now has them.
        const keep = meterMessage;
        if (!(await readMeters(member)) && outcome.code === 'detached') setHasMeter(member.key, null);
        meterMessage = keep;
      }
    } finally {
      meterBusy = false;
      meterConfirm = null;
    }
  }

  function meterFlag(member: MemberSummary): string {
    if (member.hasMeter === true) return $_('members.has_meter_yes');
    if (member.hasMeter === false) return $_('members.has_meter_no');
    return $_('members.has_meter_unknown');
  }

  function displayName(member: MemberSummary): string {
    return member.name ?? member.key;
  }

  async function load(more = false) {
    const community = $communityStore;
    if (!community) return;
    if (more) loadingMore = true;
    else loading = true;
    error = false;
    try {
      const page = await getMembers(community.key, {
        q: search.trim(),
        status,
        cursor: more ? nextCursor : null,
      });
      members = more ? [...members, ...page.items] : page.items;
      nextCursor = page.nextCursor ?? null;
    } catch {
      error = true;
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function applyFilters(event: SubmitEvent) {
    event.preventDefault();
    void load();
  }

  function statusLabel(value: string): string {
    return $_(`member_status.${value}`, { default: value });
  }

  onMount(() => load());
</script>

<svelte:head><title>{$_('nav.members')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading">
    <div><span>{$_('members.eyebrow')}</span><h1>{$_('members.title')}</h1><p>{$_('members.subtitle')}</p></div>
  </header>

  <div class="tabs" role="tablist">
    <button role="tab" aria-selected={view === 'members'} class:active={view === 'members'} onclick={() => (view = 'members')}>{$_('members.tab_members')}</button>
    <button role="tab" aria-selected={view === 'sends'} class:active={view === 'sends'} onclick={() => (view = 'sends')}>{$_('members.tab_sends')}</button>
  </div>

  {#if view === 'sends' && $communityStore}
    <MemberSends communityKey={$communityStore.key} />
  {:else}
  <section class="table-panel">
    <form class="filters" onsubmit={applyFilters}>
      <label class="search"><span>{$_('members.search')}</span><input bind:value={search} maxlength="200" autocomplete="off" /></label>
      <label><span>{$_('members.status')}</span><select bind:value={status}><option value="">{$_('common.all')}</option>{#each statuses as value}<option {value}>{statusLabel(value)}</option>{/each}</select></label>
      <button type="submit">{$_('common.apply')}</button>
    </form>

    {#if loading}
      <div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
    {:else if error && members.length === 0}
      <div class="state error"><strong>!</strong><p>{$_('members.error')}</p><button onclick={() => load()}>{$_('error.retry')}</button></div>
    {:else if members.length === 0 && !nextCursor}
      <div class="state"><strong>∅</strong><p>{$_('members.empty')}</p></div>
    {:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>{$_('members.name')}</th><th>{$_('members.key')}</th><th>{$_('members.role')}</th><th>{$_('members.area')}</th><th>{$_('members.status')}</th><th>{$_('members.has_meter')}</th>{#if canInvite}<th>{$_('members.actions')}</th>{/if}</tr></thead>
          <tbody>
            {#each members as member (member.key)}
              <tr>
                <td>{#if member.name}<strong>{member.name}</strong>{:else}<em class="no-name">{$_('members.no_name')}</em>{/if}</td>
                <td><code>{member.key}</code></td>
                <td>{member.role}</td>
                <td>{member.area}</td>
                <td><span class={`tag status-${member.status}`}>{statusLabel(member.status)}</span></td>
                <td class="meter">
                  <span class={`tag meter-${member.hasMeter === true ? 'yes' : member.hasMeter === false ? 'no' : 'unknown'}`} title={member.hasMeter == null ? $_('members.has_meter_unknown_hint') : undefined}>{meterFlag(member)}</span>
                  {#if canMeter}
                    <button class="send secondary" disabled={meterBusy} onclick={() => openMeter(member)}>{$_(member.hasMeter === false ? 'members.meter.open_attach' : 'members.meter.open_manage')}</button>
                    {#if meterOutcomes[member.key]}<p class={`outcome ${meterOutcomes[member.key].tone}`} role="status">{meterOutcomes[member.key].text}</p>{/if}
                  {/if}
                </td>
                {#if canInvite}
                  <td class="actions">
                    <div class="buttons" title={member.status === 'active' ? undefined : $_('members.inactive_reason', { values: { status: statusLabel(member.status) } })}>
                      <button class="send" disabled={sending || member.status !== 'active'} onclick={() => ask(member, 'invitation')}>{$_('members.send_invitation')}</button>
                      <button class="send secondary" disabled={sending || member.status !== 'active'} onclick={() => ask(member, 'password_reset')}>{$_('members.reset_password')}</button>
                    </div>
                    {#if outcomes[member.key]}<p class={`outcome ${outcomes[member.key].tone}`} role="status">{outcomes[member.key].text}</p>{/if}
                  </td>
                {/if}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <footer class="pagination">
        <span>{members.length} {$_('members.loaded')}{#if search.trim()}{' · '}{$_('members.search_scope')}{/if}</span>
        {#if error}<span class="inline-error">{$_('members.error')}</span>{/if}
        {#if nextCursor}<button class="more" disabled={loadingMore} onclick={() => load(true)}>{loadingMore ? $_('common.loading') : $_('members.load_more')}</button>{/if}
      </footer>
    {/if}
  </section>
  {/if}
</div>

{#if pending}
  <div class="dialog-backdrop">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="send-dialog-title">
      <h2 id="send-dialog-title">{$_(pending.intent === 'invitation' ? 'members.confirm_invitation_title' : 'members.confirm_reset_title', { values: { member: displayName(pending.member) } })}</h2>
      <p><code>{pending.member.key}</code></p>
      <p>{$_('members.confirm_body')}</p>
      <div class="dialog-actions">
        <button class="send secondary" disabled={sending} onclick={() => (pending = null)}>{$_('members.cancel')}</button>
        <button class="send" disabled={sending} onclick={confirmSend}>{sending ? $_('members.sending') : $_('members.confirm')}</button>
      </div>
    </div>
  </div>
{/if}

{#if meterFor}
  <div class="dialog-backdrop">
    <div class="dialog meter-dialog" role="dialog" aria-modal="true" aria-labelledby="meter-dialog-title">
      <h2 id="meter-dialog-title">{$_('members.meter.dialog_title', { values: { member: displayName(meterFor) } })}</h2>
      <p><code>{meterFor.key}</code></p>
      <p class="hint">{$_('members.meter.privacy')}</p>

      {#if meterConfirm}
        <h3>{$_(meterConfirm.press === 'attach' ? 'members.meter.confirm_attach_title' : 'members.meter.confirm_detach_title', { values: { member: displayName(meterFor) } })}</h3>
        <p><code>{meterConfirm.sensorId}</code>{#if meterConfirm.press === 'attach'} · {$_(`members.meter.type.${meterConfirm.meterType}`)}{/if}</p>
        <p>{$_(meterConfirm.press === 'attach' ? 'members.meter.confirm_attach_body' : 'members.meter.confirm_detach_body')}</p>
        <div class="dialog-actions">
          <button class="send secondary" disabled={meterBusy} onclick={() => (meterConfirm = null)}>{$_('members.meter.back')}</button>
          <button class="send" disabled={meterBusy} onclick={confirmMeter}>{meterBusy ? $_('members.meter.working') : $_('members.meter.confirm')}</button>
        </div>
      {:else}
        <h3>{$_('members.meter.current')}</h3>
        {#if meterReading}
          <p>{$_('members.meter.loading')}</p>
        {:else if !meterReadFailed}
          {#if meterList.length === 0}
            <p>{$_('members.meter.none')}</p>
          {:else}
            <ul class="meters">
              {#each meterList as meter}
                <li><code>{meter.sensorId}</code>{#if meter.meterType}<span>{$_(`members.meter.type.${meter.meterType}`, { default: meter.meterType })}</span>{/if}<button class="send secondary" disabled={meterBusy} onclick={() => askDetach(meter)}>{$_('members.meter.detach')}</button></li>
              {/each}
            </ul>
          {/if}
        {/if}

        <form class="attach" onsubmit={(event) => { event.preventDefault(); askAttach(); }}>
          <label><span>{$_('members.meter.sensor_id')}</span><input bind:value={sensorInput} maxlength={SENSOR_ID_MAX_LENGTH} autocomplete="off" spellcheck="false" autocapitalize="off" /></label>
          <label><span>{$_('members.meter.meter_type')}</span><select bind:value={meterType}>{#each METER_TYPES as value}<option {value}>{$_(`members.meter.type.${value}`)}</option>{/each}</select></label>
          <p class="hint">{$_('members.meter.sensor_id_hint')}</p>
          <div class="dialog-actions">
            <button type="button" class="send secondary" disabled={meterBusy} onclick={closeMeter}>{$_('members.meter.close')}</button>
            <button type="submit" class="send" disabled={meterBusy}>{$_('members.meter.attach')}</button>
          </div>
        </form>
      {/if}
      {#if meterMessage}<p class={`outcome ${meterMessage.tone}`} role="status">{meterMessage.text}</p>{/if}
    </div>
  </div>
{/if}

<style>
  .page-wrap { max-width: 1500px; margin: 0 auto; padding: 1.6rem 2rem 3rem; }
  .page-heading { display:flex; justify-content:space-between; align-items:flex-end; gap:1rem; margin-bottom:1.1rem; }
  .page-heading span { color:var(--community-primary); text-transform:uppercase; letter-spacing:.11em; font-size:.65rem; font-weight:800; }
  h1 { margin:.3rem 0; font-size:clamp(1.6rem,3vw,2.25rem); } .page-heading p { margin:0; color:var(--community-muted); font-size:.82rem; }
  .table-panel { overflow:hidden; border:1px solid var(--community-border); border-radius:16px; background:var(--community-surface); box-shadow:var(--community-shadow); }
  .filters { display:grid; grid-template-columns:2fr 1fr auto; gap:.65rem; align-items:end; padding:1rem; border-bottom:1px solid var(--community-border); background:var(--community-surface-soft); }
  label { display:grid; gap:.3rem; } label span { color:var(--community-muted); font-size:.61rem; font-weight:700; }
  input,select { min-width:0; height:38px; padding:0 .65rem; border:1px solid var(--community-border); border-radius:9px; background:var(--community-surface); color:var(--community-text); font-size:.72rem; }
  button { border:0; border-radius:9px; cursor:pointer; } .filters button { height:38px; padding:0 1rem; background:var(--community-primary); color:white; font-weight:700; }
  .table-scroll { overflow-x:auto; } table { width:100%; border-collapse:collapse; font-size:.7rem; } th { padding:.75rem; color:var(--community-muted); text-align:left; font-size:.58rem; text-transform:uppercase; letter-spacing:.05em; } td { padding:.8rem .75rem; border-top:1px solid var(--community-border); white-space:nowrap; } code { color:var(--community-primary-strong); font-size:.68rem; font-weight:700; }
  .no-name { color:var(--community-muted); font-style:italic; }
  .tag { display:inline-block; padding:.28rem .48rem; border-radius:999px; font-size:.58rem; font-weight:750; color:var(--community-muted); background:var(--community-surface-soft); }.tag.status-active { color:var(--community-success); background:var(--community-primary-soft); }.tag.status-suspended { color:var(--community-warning); background:var(--community-warning-soft); }
  .pagination { display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.75rem 1rem; border-top:1px solid var(--community-border); color:var(--community-muted); font-size:.65rem; }
  .more { padding:.5rem .8rem; background:var(--community-primary-soft); color:var(--community-primary-strong); font-weight:700; }.more:disabled { opacity:.5; cursor:default; }
  .inline-error { color:var(--community-danger); }
  .tabs { display:flex; gap:.35rem; margin-bottom:.8rem; } .tabs button { padding:.5rem .85rem; border-radius:9px; background:var(--community-surface-soft); color:var(--community-muted); font-size:.7rem; font-weight:700; } .tabs button.active { background:var(--community-primary-soft); color:var(--community-primary-strong); }
  .actions { white-space:normal; min-width:230px; } .buttons { display:flex; gap:.35rem; flex-wrap:wrap; }
  .send { padding:.42rem .6rem; background:var(--community-primary); color:#fff; font-size:.6rem; font-weight:700; } .send.secondary { background:var(--community-primary-soft); color:var(--community-primary-strong); } .send:disabled { opacity:.45; cursor:default; }
  .outcome { margin:.4rem 0 0; max-width:320px; font-size:.6rem; line-height:1.4; } .outcome.success { color:var(--community-success); } .outcome.warning { color:var(--community-warning); } .outcome.error { color:var(--community-danger); }
  .dialog-backdrop { position:fixed; inset:0; z-index:80; display:grid; place-items:center; padding:1rem; background:rgba(15,23,42,.34); backdrop-filter:blur(2px); }
  .dialog { width:min(92vw,440px); padding:1.3rem; border-radius:14px; background:var(--community-surface); box-shadow:var(--community-shadow); } .dialog h2 { margin:0 0 .5rem; font-size:.95rem; } .dialog p { margin:.4rem 0; color:var(--community-muted); font-size:.72rem; line-height:1.5; } .dialog-actions { display:flex; justify-content:flex-end; gap:.5rem; margin-top:1rem; }
  .meter { white-space:normal; min-width:150px; } .meter .tag { margin-right:.35rem; } .tag.meter-yes { color:var(--community-success); background:var(--community-primary-soft); }
  .meter-dialog { width:min(92vw,520px); } .dialog h3 { margin:.9rem 0 .3rem; font-size:.78rem; } .dialog .hint { font-size:.64rem; }
  .meters { margin:.3rem 0; padding:0; list-style:none; display:grid; gap:.35rem; } .meters li { display:flex; align-items:center; gap:.5rem; font-size:.7rem; } .meters li span { color:var(--community-muted); } .meters li button { margin-left:auto; }
  .attach { display:grid; grid-template-columns:2fr 1fr; gap:.55rem; margin-top:.9rem; } .attach .hint, .attach .dialog-actions { grid-column:1 / -1; }
  .state { min-height:280px; display:grid; place-content:center; justify-items:center; gap:.6rem; color:var(--community-muted); text-align:center; }.state p { margin:0; }.state.error strong { color:var(--community-danger); font-size:1.5rem; }.state.error button { padding:.5rem .8rem; background:var(--community-primary); color:white; }.spinner { width:25px; height:25px; border:3px solid var(--community-border); border-top-color:var(--community-primary); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:650px){.page-wrap{padding:1.1rem .8rem 5rem}.filters{grid-template-columns:1fr}.page-heading{align-items:flex-start;flex-direction:column}.pagination{flex-wrap:wrap}}
</style>
