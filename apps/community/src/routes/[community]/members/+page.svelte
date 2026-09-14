<script lang="ts">
  import { onMount } from 'svelte';
  import { _, locale } from 'svelte-i18n';
  import { getMembers, sendMemberEmail, type MemberSummary } from '$lib/api';
  import { outcomeMessage, type OutcomeMessage, type SendIntent } from '$lib/memberSend';
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
          <thead><tr><th>{$_('members.name')}</th><th>{$_('members.key')}</th><th>{$_('members.role')}</th><th>{$_('members.area')}</th><th>{$_('members.status')}</th>{#if canInvite}<th>{$_('members.actions')}</th>{/if}</tr></thead>
          <tbody>
            {#each members as member (member.key)}
              <tr>
                <td>{#if member.name}<strong>{member.name}</strong>{:else}<em class="no-name">{$_('members.no_name')}</em>{/if}</td>
                <td><code>{member.key}</code></td>
                <td>{member.role}</td>
                <td>{member.area}</td>
                <td><span class={`tag status-${member.status}`}>{statusLabel(member.status)}</span></td>
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
  .state { min-height:280px; display:grid; place-content:center; justify-items:center; gap:.6rem; color:var(--community-muted); text-align:center; }.state p { margin:0; }.state.error strong { color:var(--community-danger); font-size:1.5rem; }.state.error button { padding:.5rem .8rem; background:var(--community-primary); color:white; }.spinner { width:25px; height:25px; border:3px solid var(--community-border); border-top-color:var(--community-primary); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:650px){.page-wrap{padding:1.1rem .8rem 5rem}.filters{grid-template-columns:1fr}.page-heading{align-items:flex-start;flex-direction:column}.pagination{flex-wrap:wrap}}
</style>
