<script lang="ts">
  import { onMount } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import {
    attachMeter,
    detachMeter,
    editMemberProfile,
    getCommunityAreas,
    getMemberMeters,
    getMembers,
    releaseMember,
    sendMemberEmail,
    type CommunityArea,
    type MemberDeliveryPoint,
    type MemberMeter,
    type MemberSummary,
    type MeterOutcome,
    type MeterType,
    type ProfileChanges,
    type ProfileOutcome,
  } from '$lib/api';
  import { outcomeMessage, type OutcomeMessage, type SendIntent } from '$lib/memberSend';
  import { METER_TYPES, SENSOR_ID_MAX_LENGTH, defaultMeterType, defaultPod, meterAccess, meterOutcomeMessage, normalizeSensorId } from '$lib/memberMeter';
  import {
    EDITABLE_ROLES,
    areaKeyLabel,
    areaLabel,
    areaOptions,
    canEditMember,
    isRoleEditable,
    normalizeRole,
    profileChanges,
    profileOutcomeMessage,
    warningKeys,
  } from '$lib/memberProfile';
  import { confirmsMember, releaseView, type ReleaseView } from '$lib/memberRelease';
  import { communityStore } from '$lib/stores';
  import MemberSends from '$lib/components/MemberSends.svelte';
  import AreaMap from '$lib/components/AreaMap.svelte';

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

  // The measurements dialog (celine-community ADR-0004, ADR-0005): the member's
  // delivery points (POD), read-only, and their meters. The sensor id is typed, never
  // offered: no list, no suggestion, no lookup of unattached meters (D18). The POD
  // and the sensor id live in this component's state while the dialog is open and
  // are cleared when it closes: never in browser storage, never in a URL. The list
  // shows only whether a member has a POD and a meter, and no outcome sentence
  // carries either id.
  const canMeter = $derived(($communityStore?.capabilities ?? []).includes('members.meter'));

  type MeterConfirm =
    | { press: 'attach'; sensorId: string; meterType: MeterType; pod: string | null }
    | { press: 'detach'; sensorId: string };

  let meterFor = $state<MemberSummary | null>(null);
  let meterList = $state<MemberMeter[]>([]);
  // `null` when the BFF sent no delivery points (it predates ADR-0005): no POD section.
  let podList = $state<MemberDeliveryPoint[] | null>(null);
  // The POD an attach links the meter to; '' is none (M5: optional).
  let podChoice = $state('');
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

  function setHasDeliveryPoint(memberKey: string, value: boolean) {
    members = members.map((item) => (item.key === memberKey ? { ...item, hasDeliveryPoint: value } : item));
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
        podList = read.meters.deliveryPoints ?? null;
        if (!sensorInput) {
          meterType = read.meters.defaultMeterType;
          podChoice = defaultPod(podList) ?? '';
        }
        setHasMeter(member.key, meterList.length > 0);
        if (podList) setHasDeliveryPoint(member.key, podList.length > 0);
        return true;
      }
      meterList = [];
      podList = null;
      meterReadFailed = true;
      meterMessage = meterSentence(read.outcome);
      return false;
    } finally {
      if (ticket === meterRead) meterReading = false;
    }
  }

  // Detach is offered for every member, so a manager can free a meter held by a
  // suspended member; attach only for active members (D45, amending D42).
  const meterAttach = $derived(meterFor ? meterAccess(meterFor).attach : false);

  function openMeter(member: MemberSummary) {
    if (meterBusy || !meterAccess(member).open) return;
    meterFor = member;
    meterList = [];
    podList = null;
    podChoice = '';
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
    podList = null;
    podChoice = '';
    sensorInput = '';
    meterConfirm = null;
    meterMessage = null;
  }

  function askAttach() {
    if (meterBusy || !meterAttach) return;
    const sensorId = normalizeSensorId(sensorInput);
    if (!sensorId) {
      // Refused here, before any request: the BFF would answer `sensor_id_blank`.
      meterMessage = meterSentence({ status: 422, code: 'sensor_id_blank', press: 'attach' });
      return;
    }
    meterMessage = null;
    // "None" sends no `pod`; a POD the member does not hold is the BFF's `pod_not_held`.
    meterConfirm = { press: 'attach', sensorId, meterType, pod: podChoice || null };
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
          ? await attachMeter(community.key, member.key, request.sensorId, request.meterType, request.pod)
          : await detachMeter(community.key, member.key, request.sensorId);
      const message = meterSentence(outcome);
      meterMessage = message;
      meterOutcomes = { ...meterOutcomes, [member.key]: message };
      if (outcome.code === 'attached' || outcome.code === 'already_attached') {
        sensorInput = '';
        podChoice = defaultPod(podList) ?? '';
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

  // The edit dialog (celine-community ADR-0003): role and area, nothing else. The
  // role moves between consumer and prosumer only; any other role is shown
  // read-only and only the area can change (D30). Saving shows what the change
  // does to the meter's data, and nothing is sent until the manager confirms.
  const canEdit = $derived(($communityStore?.capabilities ?? []).includes('members.edit'));

  let editFor = $state<MemberSummary | null>(null);
  let editAreas = $state<CommunityArea[]>([]);
  let areasLoading = $state(false);
  let areasFailed = $state(false);
  let draftRole = $state('');
  let draftArea = $state('');
  let editConfirm = $state<ProfileChanges | null>(null);
  let editBusy = $state(false);
  let editMessage = $state<OutcomeMessage | null>(null);
  let editOutcomes = $state<Record<string, OutcomeMessage>>({});
  // An areas read answered after the dialog moved on to another member is dropped.
  let areasRead = 0;

  const draftChanges = $derived(
    editFor ? profileChanges(editFor, { role: draftRole, area: draftArea }) : {},
  );
  const hasDraftChanges = $derived(draftChanges.role !== undefined || draftChanges.area !== undefined);

  function profileSentence(outcome: ProfileOutcome): OutcomeMessage {
    return profileOutcomeMessage(outcome, (key, options) => $_(key, options));
  }

  function roleLabel(role: string): string {
    return $_(`members.profile.role.${normalizeRole(role)}`, { default: role });
  }

  async function readAreas(member: MemberSummary) {
    const community = $communityStore;
    if (!community) return;
    const ticket = ++areasRead;
    areasLoading = true;
    areasFailed = false;
    try {
      const read = await getCommunityAreas(community.key);
      if (ticket !== areasRead || editFor?.key !== member.key) return;
      if (read.ok) {
        editAreas = read.areas;
      } else {
        editAreas = [];
        areasFailed = true;
        editMessage = profileSentence(read.outcome);
      }
    } finally {
      if (ticket === areasRead) areasLoading = false;
    }
  }

  function openEdit(member: MemberSummary) {
    // Only active members are edited (D45); the BFF refuses the rest.
    if (editBusy || !canEditMember(member.status)) return;
    editFor = member;
    editAreas = [];
    draftRole = normalizeRole(member.role);
    draftArea = member.area;
    editConfirm = null;
    editMessage = null;
    void readAreas(member);
  }

  function closeEdit() {
    if (editBusy) return;
    areasRead++;
    editFor = null;
    editAreas = [];
    editConfirm = null;
    editMessage = null;
  }

  function askSave() {
    if (editBusy || !hasDraftChanges) return;
    editMessage = null;
    editConfirm = { ...draftChanges };
  }

  // Confirmation is the decision, and one press is in flight at a time.
  async function confirmEdit() {
    const community = $communityStore;
    const member = editFor;
    const changes = editConfirm;
    if (!community || !member || !changes || editBusy) return;
    editBusy = true;
    try {
      const outcome = await editMemberProfile(community.key, member.key, changes);
      const message = profileSentence(outcome);
      editMessage = message;
      editOutcomes = { ...editOutcomes, [member.key]: message };
      if (outcome.code === 'updated' || outcome.code === 'unchanged') {
        // The row and the dialog follow the member as the registry now has them.
        const role = outcome.role || member.role;
        const area = outcome.area || member.area;
        members = members.map((item) => (item.key === member.key ? { ...item, role, area } : item));
        editFor = { ...member, role, area };
        draftRole = normalizeRole(role);
        draftArea = area;
      }
    } finally {
      editBusy = false;
      editConfirm = null;
    }
  }

  // Release (celine-community `members.release`): REC admins only, which `/api/me`
  // reports to them alone. The admin types the member key before anything is sent;
  // the answer lists onboarding's steps, and a partial release offers "Release
  // again", which is safe because the release is idempotent.
  const canRelease = $derived(($communityStore?.capabilities ?? []).includes('members.release'));

  let releaseFor = $state<MemberSummary | null>(null);
  let releaseTyped = $state('');
  let releaseBusy = $state(false);
  let releaseResult = $state<ReleaseView | null>(null);

  const releaseConfirmed = $derived(releaseFor ? confirmsMember(releaseTyped, releaseFor.key) : false);

  function openRelease(member: MemberSummary) {
    if (releaseBusy) return;
    releaseFor = member;
    releaseTyped = '';
    releaseResult = null;
  }

  function closeRelease() {
    if (releaseBusy) return;
    releaseFor = null;
    releaseTyped = '';
    releaseResult = null;
  }

  // The typed key is the decision; "Release again" repeats it for the same member.
  async function confirmRelease() {
    const community = $communityStore;
    const member = releaseFor;
    if (!community || !member || releaseBusy) return;
    if (!releaseResult && !confirmsMember(releaseTyped, member.key)) return;
    releaseBusy = true;
    try {
      const outcome = await releaseMember(community.key, member.key);
      const view = releaseView(outcome, displayName(member), (key, options) => $_(key, options));
      releaseResult = view;
      if (view.released) {
        // The row follows the registry: a released member is inactive.
        members = members.map((item) => (item.key === member.key ? { ...item, status: 'inactive' } : item));
      }
    } finally {
      releaseBusy = false;
    }
  }

  function meterFlag(member: MemberSummary): string {
    if (member.hasMeter === true) return $_('members.has_meter_yes');
    if (member.hasMeter === false) return $_('members.has_meter_no');
    return $_('members.has_meter_unknown');
  }

  // Yes or no, never which POD (M7).
  function deliveryPointFlag(member: MemberSummary): string {
    if (member.hasDeliveryPoint === true) return $_('members.has_meter_yes');
    if (member.hasDeliveryPoint === false) return $_('members.has_meter_no');
    return $_('members.has_meter_unknown');
  }

  function flagClass(value: boolean | null | undefined): string {
    return value === true ? 'yes' : value === false ? 'no' : 'unknown';
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
          <thead><tr><th>{$_('members.name')}</th><th>{$_('members.key')}</th><th>{$_('members.role')}</th><th>{$_('members.area')}</th><th>{$_('members.status')}</th><th>{$_('members.measurements')}</th>{#if canInvite || canEdit || canRelease}<th>{$_('members.actions')}</th>{/if}</tr></thead>
          <tbody>
            {#each members as member (member.key)}
              <tr>
                <td>{#if member.name}<strong>{member.name}</strong>{:else}<em class="no-name">{$_('members.no_name')}</em>{/if}</td>
                <td><code>{member.key}</code></td>
                <td>{member.role}</td>
                <td>{member.area}</td>
                <td><span class={`tag status-${member.status}`}>{statusLabel(member.status)}</span></td>
                <td class="meter">
                  <span class={`tag meter-${flagClass(member.hasDeliveryPoint)}`} title={member.hasDeliveryPoint == null ? $_('members.has_delivery_point_unknown_hint') : undefined}>{$_('members.measurements_delivery_point')}: {deliveryPointFlag(member)}</span>
                  <span class={`tag meter-${flagClass(member.hasMeter)}`} title={member.hasMeter == null ? $_('members.has_meter_unknown_hint') : undefined}>{$_('members.measurements_meter')}: {meterFlag(member)}</span>
                  {#if canMeter}
                    {@const access = meterAccess(member)}
                    <button class="send secondary" disabled={meterBusy || !access.open} title={access.attach ? undefined : $_('members.meter.inactive_reason', { values: { status: statusLabel(member.status) } })} onclick={() => openMeter(member)}>{$_(access.label)}</button>
                    {#if meterOutcomes[member.key]}<p class={`outcome ${meterOutcomes[member.key].tone}`} role="status">{meterOutcomes[member.key].text}</p>{/if}
                  {/if}
                </td>
                {#if canInvite || canEdit || canRelease}
                  <td class="actions">
                    <div class="buttons">
                      {#if canEdit}
                        <span class="buttons" title={canEditMember(member.status) ? undefined : $_('members.profile.inactive_reason', { values: { status: statusLabel(member.status) } })}>
                          <button class="send secondary" disabled={editBusy || !canEditMember(member.status)} onclick={() => openEdit(member)}>{$_('members.profile.open')}</button>
                        </span>
                      {/if}
                      {#if canInvite}
                        <span class="buttons" title={member.status === 'active' ? undefined : $_('members.inactive_reason', { values: { status: statusLabel(member.status) } })}>
                          <button class="send" disabled={sending || member.status !== 'active'} onclick={() => ask(member, 'invitation')}>{$_('members.send_invitation')}</button>
                          <button class="send secondary" disabled={sending || member.status !== 'active'} onclick={() => ask(member, 'password_reset')}>{$_('members.reset_password')}</button>
                        </span>
                      {/if}
                      {#if canRelease}
                        <button class="send danger" disabled={releaseBusy} onclick={() => openRelease(member)}>{$_('members.release.open')}</button>
                      {/if}
                    </div>
                    {#if canEdit && editOutcomes[member.key]}<p class={`outcome ${editOutcomes[member.key].tone}`} role="status">{editOutcomes[member.key].text}</p>{/if}
                    {#if canInvite && outcomes[member.key]}<p class={`outcome ${outcomes[member.key].tone}`} role="status">{outcomes[member.key].text}</p>{/if}
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

{#if releaseFor}
  <div class="dialog-backdrop">
    <div class="dialog release-dialog" role="dialog" aria-modal="true" aria-labelledby="release-dialog-title">
      <h2 id="release-dialog-title">{$_('members.release.dialog_title', { values: { member: displayName(releaseFor) } })}</h2>
      <p><code>{releaseFor.key}</code></p>

      {#if releaseResult}
        <p class={`outcome ${releaseResult.tone}`} role="status">{releaseResult.headline}</p>
        {#if releaseResult.steps.length}
          <ol class="steps">
            {#each releaseResult.steps as line}
              <li class={`step ${line.tone}`} data-code={line.code}>
                <div><strong>{line.title}</strong><span class={`tag step-${line.tone}`}>{line.statusLabel}</span></div>
                <p>{line.text}</p>
              </li>
            {/each}
          </ol>
        {/if}
        {#if releaseResult.again}<p class="hint">{$_('members.release.again_hint')}</p>{/if}
        <div class="dialog-actions">
          <button class="send secondary" disabled={releaseBusy} onclick={closeRelease}>{$_('members.release.close')}</button>
          {#if releaseResult.again}
            <button class="send danger" disabled={releaseBusy} onclick={confirmRelease}>{releaseBusy ? $_('members.release.working') : $_('members.release.again')}</button>
          {/if}
        </div>
      {:else}
        <p>{$_('members.release.intro')}</p>
        <ul class="effects">
          <li>{$_('members.release.effect_share')}</li>
          <li>{$_('members.release.effect_credential')}</li>
          <li>{$_('members.release.effect_login')}</li>
          <li>{$_('members.release.effect_inactive')}</li>
        </ul>
        <div class="warning" role="note">
          <p>{$_('members.release.retention')}</p>
          <p>{$_('members.release.rejoin')}</p>
        </div>
        <form class="release" onsubmit={(event) => { event.preventDefault(); void confirmRelease(); }}>
          <label><span>{$_('members.release.type_key', { values: { key: releaseFor.key } })}</span><input bind:value={releaseTyped} autocomplete="off" spellcheck="false" autocapitalize="off" /></label>
          <div class="dialog-actions">
            <button type="button" class="send secondary" disabled={releaseBusy} onclick={closeRelease}>{$_('members.release.cancel')}</button>
            <button type="submit" class="send danger" disabled={releaseBusy || !releaseConfirmed}>{releaseBusy ? $_('members.release.working') : $_('members.release.confirm')}</button>
          </div>
        </form>
      {/if}
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
        <p><code>{meterConfirm.sensorId}</code>{#if meterConfirm.press === 'attach'} · {$_(`members.meter.type.${meterConfirm.meterType}`)} · {#if meterConfirm.pod}{$_('members.measurements_delivery_point')} <code>{meterConfirm.pod}</code>{:else}{$_('members.meter.no_linked_pod')}{/if}{/if}</p>
        <p>{$_(meterConfirm.press === 'attach' ? 'members.meter.confirm_attach_body' : 'members.meter.confirm_detach_body')}</p>
        <div class="dialog-actions">
          <button class="send secondary" disabled={meterBusy} onclick={() => (meterConfirm = null)}>{$_('members.meter.back')}</button>
          <button class="send" disabled={meterBusy} onclick={confirmMeter}>{meterBusy ? $_('members.meter.working') : $_('members.meter.confirm')}</button>
        </div>
      {:else}
        {#if meterReading}
          <p>{$_('members.meter.loading')}</p>
        {:else if !meterReadFailed}
          {#if podList}
            <h3>{$_('members.meter.delivery_points')}</h3>
            {#if podList.length === 0}
              <p>{$_('members.meter.delivery_points_none')}</p>
            {:else}
              <ul class="meters pods">
                {#each podList as point}
                  <li><code>{point.id}</code>{#if !point.active}<span>{$_('members.meter.delivery_point_inactive')}</span>{/if}</li>
                {/each}
              </ul>
              <p class="hint">{$_('members.meter.delivery_points_hint')}</p>
            {/if}
          {/if}
          <h3>{$_('members.meter.current')}</h3>
          {#if meterList.length === 0}
            <p>{$_('members.meter.none')}</p>
          {:else}
            <ul class="meters">
              {#each meterList as meter}
                <li><code>{meter.sensorId}</code>{#if meter.meterType}<span>{$_(`members.meter.type.${meter.meterType}`, { default: meter.meterType })}</span>{/if}{#if podList}<span>{#if meter.pod}{$_('members.measurements_delivery_point')} <code>{meter.pod}</code>{:else}{$_('members.meter.no_linked_pod')}{/if}</span>{/if}<button class="send secondary" disabled={meterBusy} onclick={() => askDetach(meter)}>{$_('members.meter.detach')}</button></li>
              {/each}
            </ul>
          {/if}
        {/if}

        {#if meterAttach}
          <form class="attach" onsubmit={(event) => { event.preventDefault(); askAttach(); }}>
            <label><span>{$_('members.meter.sensor_id')}</span><input bind:value={sensorInput} maxlength={SENSOR_ID_MAX_LENGTH} autocomplete="off" spellcheck="false" autocapitalize="off" /></label>
            <label><span>{$_('members.meter.meter_type')}</span><select bind:value={meterType}>{#each METER_TYPES as value}<option {value}>{$_(`members.meter.type.${value}`)}</option>{/each}</select></label>
            {#if podList && podList.length > 0}
              <label class="pod"><span>{$_('members.meter.pod')}</span><select bind:value={podChoice}><option value="">{$_('members.meter.pod_option_none')}</option>{#each podList as point}<option value={point.id}>{point.id}</option>{/each}</select></label>
              <p class="hint">{$_('members.meter.pod_hint')}</p>
            {/if}
            <p class="hint">{$_('members.meter.sensor_id_hint')}</p>
            <div class="dialog-actions">
              <button type="button" class="send secondary" disabled={meterBusy} onclick={closeMeter}>{$_('members.meter.close')}</button>
              <button type="submit" class="send" disabled={meterBusy}>{$_('members.meter.attach')}</button>
            </div>
          </form>
        {:else}
          <p class="hint">{$_('members.meter.attach_inactive', { values: { status: statusLabel(meterFor.status) } })}</p>
          <div class="dialog-actions">
            <button type="button" class="send secondary" disabled={meterBusy} onclick={closeMeter}>{$_('members.meter.close')}</button>
          </div>
        {/if}
      {/if}
      {#if meterMessage}<p class={`outcome ${meterMessage.tone}`} role="status">{meterMessage.text}</p>{/if}
    </div>
  </div>
{/if}

{#if editFor}
  <div class="dialog-backdrop">
    <div class="dialog edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-dialog-title">
      <h2 id="edit-dialog-title">{$_('members.profile.dialog_title', { values: { member: displayName(editFor) } })}</h2>
      <p><code>{editFor.key}</code></p>

      {#if editConfirm}
        <h3>{$_('members.profile.confirm_title', { values: { member: displayName(editFor) } })}</h3>
        <ul class="changes">
          {#if editConfirm.role !== undefined}<li>{$_('members.profile.change_role', { values: { from: roleLabel(editFor.role), to: roleLabel(editConfirm.role) } })}</li>{/if}
          {#if editConfirm.area !== undefined}<li>{$_('members.profile.change_area', { values: { from: areaKeyLabel(editAreas, editFor.area, (key, options) => $_(key, options)), to: areaKeyLabel(editAreas, editConfirm.area, (key, options) => $_(key, options)) } })}</li>{/if}
        </ul>
        <div class="warning" role="note">
          {#each warningKeys(editConfirm) as key}<p>{$_(key)}</p>{/each}
        </div>
        <div class="dialog-actions">
          <button class="send secondary" disabled={editBusy} onclick={() => (editConfirm = null)}>{$_('members.profile.back')}</button>
          <button class="send" disabled={editBusy} onclick={confirmEdit}>{editBusy ? $_('members.profile.working') : $_('members.profile.confirm')}</button>
        </div>
      {:else}
        <form class="profile" onsubmit={(event) => { event.preventDefault(); askSave(); }}>
          {#if isRoleEditable(editFor.role)}
            <label><span>{$_('members.role')}</span><select bind:value={draftRole}>{#each EDITABLE_ROLES as value}<option {value}>{roleLabel(value)}</option>{/each}</select></label>
          {:else}
            <div class="read-only"><span>{$_('members.role')}</span><strong>{roleLabel(editFor.role)}</strong><p class="hint">{$_('members.profile.role_read_only_hint')}</p></div>
          {/if}
          <label><span>{$_('members.area')}</span>
            <select bind:value={draftArea} disabled={areasLoading || areasFailed}>
              {#if areasLoading || areasFailed}
                <option value={editFor.area}>{editFor.area}</option>
              {:else}
                {#each areaOptions(editAreas, editFor.area) as area (area.key)}<option value={area.key}>{areaLabel(area, (key, options) => $_(key, options))}</option>{/each}
              {/if}
            </select>
          </label>
          {#if areasLoading}<p class="hint">{$_('members.profile.areas_loading')}</p>{/if}
          {#if $communityStore}<AreaMap communityKey={$communityStore.key} selected={draftArea} />{/if}
          <p class="hint">{$_('members.profile.hint')}</p>
          <div class="dialog-actions">
            <button type="button" class="send secondary" disabled={editBusy} onclick={closeEdit}>{$_('members.profile.close')}</button>
            <button type="submit" class="send" disabled={editBusy || !hasDraftChanges}>{$_('members.profile.save')}</button>
          </div>
        </form>
      {/if}
      {#if editMessage}<p class={`outcome ${editMessage.tone}`} role="status">{editMessage.text}</p>{/if}
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
  .edit-dialog { width:min(92vw,640px); max-height:92vh; overflow-y:auto; } .profile { display:grid; grid-template-columns:1fr 1fr; gap:.55rem; margin-top:.6rem; } .profile .hint, .profile .dialog-actions { grid-column:1 / -1; }
  .read-only { display:grid; gap:.3rem; align-content:start; } .read-only span { color:var(--community-muted); font-size:.61rem; font-weight:700; } .read-only strong { font-size:.75rem; } .read-only .hint { margin:0; }
  .send.danger { background:var(--community-danger); color:var(--community-surface); }
  .release-dialog { width:min(92vw,520px); max-height:92vh; overflow-y:auto; } .effects { margin:.3rem 0; padding-left:1.1rem; font-size:.72rem; color:var(--community-muted); line-height:1.5; } .release { display:grid; gap:.55rem; margin-top:.9rem; }
  .steps { margin:.6rem 0; padding:0; list-style:none; display:grid; gap:.45rem; } .step { padding:.5rem .65rem; border:1px solid var(--community-border); border-radius:9px; } .step div { display:flex; justify-content:space-between; align-items:center; gap:.5rem; font-size:.7rem; } .step p { margin:.25rem 0 0; } .tag.step-success { color:var(--community-success); background:var(--community-primary-soft); } .tag.step-warning { color:var(--community-warning); background:var(--community-warning-soft); } .tag.step-error { color:var(--community-danger); background:var(--community-danger-soft); }
  .changes { margin:.3rem 0; padding-left:1.1rem; font-size:.72rem; } .warning { margin-top:.6rem; padding:.55rem .75rem; border-radius:9px; background:var(--community-warning-soft); } .warning p { color:var(--community-warning); }
  .attach { display:grid; grid-template-columns:2fr 1fr; gap:.55rem; margin-top:.9rem; } .attach .hint, .attach .dialog-actions, .attach .pod { grid-column:1 / -1; }
  .state { min-height:280px; display:grid; place-content:center; justify-items:center; gap:.6rem; color:var(--community-muted); text-align:center; }.state p { margin:0; }.state.error strong { color:var(--community-danger); font-size:1.5rem; }.state.error button { padding:.5rem .8rem; background:var(--community-primary); color:white; }.spinner { width:25px; height:25px; border:3px solid var(--community-border); border-top-color:var(--community-primary); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:650px){.page-wrap{padding:1.1rem .8rem 5rem}.filters{grid-template-columns:1fr}.page-heading{align-items:flex-start;flex-direction:column}.pagination{flex-wrap:wrap}}
</style>
