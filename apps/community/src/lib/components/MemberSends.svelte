<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { getMemberSends, type MemberSend } from '$lib/api';
  import { SEND_CODES, outcomeLabel, type SendIntent } from '$lib/memberSend';

  // Every invitation and reset sent from this dashboard, from the BFF's audit
  // rows. Names are read back from the registry by the BFF for this view and live
  // in this component's state only.
  const { communityKey }: { communityKey: string } = $props();

  let rows = $state<MemberSend[]>([]);
  let nextCursor = $state<string | null>(null);
  let namesAvailable = $state(true);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state(false);
  let memberKey = $state('');
  let actor = $state('');
  let intent = $state<SendIntent | ''>('');
  let code = $state('');
  let from = $state('');
  let to = $state('');

  const t = (key: string, options?: { values?: Record<string, string> }) => $_(key, options);

  function dayStart(value: string): string | undefined {
    return value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
  }

  async function load(more = false) {
    if (more) loadingMore = true;
    else loading = true;
    error = false;
    try {
      const page = await getMemberSends(communityKey, {
        member_key: memberKey.trim(),
        actor: actor.trim(),
        intent,
        code,
        from: dayStart(from),
        to: dayStart(to),
        cursor: more ? nextCursor : null,
      });
      rows = more ? [...rows, ...page.items] : page.items;
      nextCursor = page.nextCursor ?? null;
      namesAvailable = page.namesAvailable;
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

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  onMount(() => load());
</script>

<section class="table-panel">
  <form class="filters" onsubmit={applyFilters}>
    <label><span>{$_('members.key')}</span><input bind:value={memberKey} maxlength="100" autocomplete="off" /></label>
    <label><span>{$_('members.sends.actor')}</span><input bind:value={actor} maxlength="255" autocomplete="off" /></label>
    <label><span>{$_('members.sends.intent')}</span><select bind:value={intent}><option value="">{$_('members.sends.any')}</option><option value="invitation">{$_('members.intent.invitation')}</option><option value="password_reset">{$_('members.intent.password_reset')}</option></select></label>
    <label><span>{$_('members.sends.outcome')}</span><select bind:value={code}><option value="">{$_('members.sends.any')}</option>{#each SEND_CODES as value}<option {value}>{outcomeLabel(value, t)}</option>{/each}</select></label>
    <label><span>{$_('members.sends.from')}</span><input type="date" bind:value={from} /></label>
    <label><span>{$_('members.sends.to')}</span><input type="date" bind:value={to} /></label>
    <button type="submit">{$_('common.apply')}</button>
  </form>

  {#if !namesAvailable}<p class="notice">{$_('members.sends.names_unavailable')}</p>{/if}

  {#if loading}
    <div class="state"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
  {:else if error && rows.length === 0}
    <div class="state error"><strong>!</strong><p>{$_('members.sends.error')}</p><button onclick={() => load()}>{$_('error.retry')}</button></div>
  {:else if rows.length === 0 && !nextCursor}
    <div class="state"><strong>∅</strong><p>{$_('members.sends.empty')}</p></div>
  {:else}
    <div class="table-scroll">
      <table>
        <thead><tr><th>{$_('members.sends.date')}</th><th>{$_('members.sends.member')}</th><th>{$_('members.sends.intent')}</th><th>{$_('members.sends.outcome')}</th><th>{$_('members.sends.actor')}</th></tr></thead>
        <tbody>
          {#each rows as row (row.id)}
            <tr>
              <td>{formatDate(row.createdAt)}</td>
              <td>{#if row.memberName}<strong>{row.memberName}</strong> {/if}<code>{row.memberKey}</code></td>
              <td>{$_(`members.intent.${row.intent}`)}</td>
              <td><span class={`tag ${row.code === 'sent' ? 'ok' : 'neutral'}`}>{outcomeLabel(row.code, t)}</span></td>
              <td><code class="actor">{row.actorId}</code></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <footer class="pagination">
      <span>{#if code}{$_('members.sends.code_scope')}{/if}</span>
      {#if error}<span class="inline-error">{$_('members.sends.error')}</span>{/if}
      {#if nextCursor}<button class="more" disabled={loadingMore} onclick={() => load(true)}>{loadingMore ? $_('common.loading') : $_('members.load_more')}</button>{/if}
    </footer>
  {/if}
</section>

<style>
  .table-panel { overflow:hidden; border:1px solid var(--community-border); border-radius:16px; background:var(--community-surface); box-shadow:var(--community-shadow); }
  .filters { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)) auto; gap:.65rem; align-items:end; padding:1rem; border-bottom:1px solid var(--community-border); background:var(--community-surface-soft); }
  label { display:grid; gap:.3rem; } label span { color:var(--community-muted); font-size:.61rem; font-weight:700; }
  input,select { min-width:0; height:38px; padding:0 .65rem; border:1px solid var(--community-border); border-radius:9px; background:var(--community-surface); color:var(--community-text); font-size:.72rem; }
  button { border:0; border-radius:9px; cursor:pointer; } .filters button { height:38px; padding:0 1rem; background:var(--community-primary); color:white; font-weight:700; }
  .notice { margin:0; padding:.6rem 1rem; background:var(--community-warning-soft); color:var(--community-warning); font-size:.65rem; }
  .table-scroll { overflow-x:auto; } table { width:100%; border-collapse:collapse; font-size:.7rem; } th { padding:.75rem; color:var(--community-muted); text-align:left; font-size:.58rem; text-transform:uppercase; letter-spacing:.05em; } td { padding:.8rem .75rem; border-top:1px solid var(--community-border); white-space:nowrap; } code { color:var(--community-primary-strong); font-size:.68rem; font-weight:700; } code.actor { color:var(--community-muted); font-weight:500; }
  .tag { display:inline-block; padding:.28rem .48rem; border-radius:999px; font-size:.58rem; font-weight:750; } .tag.ok { color:var(--community-success); background:var(--community-primary-soft); } .tag.neutral { color:var(--community-muted); background:var(--community-surface-soft); }
  .pagination { display:flex; justify-content:space-between; align-items:center; gap:1rem; padding:.75rem 1rem; border-top:1px solid var(--community-border); color:var(--community-muted); font-size:.65rem; }
  .more { padding:.5rem .8rem; background:var(--community-primary-soft); color:var(--community-primary-strong); font-weight:700; }.more:disabled { opacity:.5; cursor:default; }
  .inline-error { color:var(--community-danger); }
  .state { min-height:280px; display:grid; place-content:center; justify-items:center; gap:.6rem; color:var(--community-muted); text-align:center; }.state p { margin:0; }.state.error strong { color:var(--community-danger); font-size:1.5rem; }.state.error button { padding:.5rem .8rem; background:var(--community-primary); color:white; }.spinner { width:25px; height:25px; border:3px solid var(--community-border); border-top-color:var(--community-primary); border-radius:50%; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  @media(max-width:1100px){.filters{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:650px){.filters{grid-template-columns:1fr}.pagination{flex-wrap:wrap}}
</style>
