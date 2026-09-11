<script lang="ts">
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';

  // Three different situations used to share one sentence. "You manage no REC",
  // "that REC is not yours" and "the registry is down" need different actions
  // from the reader, and only the last of the three will fix itself.
  const reasons: Record<string, string> = {
    'no-recs': 'denied.no_recs',
    'not-your-rec': 'denied.not_your_rec',
    registry: 'denied.registry',
  };

  const reason = $derived($page.url.searchParams.get('reason') ?? '');
  const rec = $derived($page.url.searchParams.get('rec') ?? '');
  const body = $derived(reasons[reason] ?? 'denied.body');
  const transient = $derived(reason === 'registry');
</script>

<svelte:head>
  <title>{$_(transient ? 'denied.unavailable_title' : 'denied.title')} · {$_('app.title')}</title>
</svelte:head>

<div class="denied">
  <div class="card">
    <div class="icon" class:transient>{transient ? '⟳' : '×'}</div>
    <h1>{$_(transient ? 'denied.unavailable_title' : 'denied.title')}</h1>
    <p>{$_(body)}</p>
    {#if rec}<code>{rec}</code>{/if}
    <div class="actions">
      {#if transient}
        <a class="primary" href="/">{$_('error.retry')}</a>
      {/if}
      <a class:primary={!transient} href="/oauth2/sign_out">{$_('common.sign_out')}</a>
    </div>
  </div>
</div>

<style>
  .denied { min-height: 100dvh; display: grid; place-items: center; padding: 2rem; background: var(--community-bg); }
  .card { width: min(100%, 420px); padding: 2.5rem; text-align: center; border: 1px solid var(--community-border); border-radius: 20px; background: var(--community-surface); box-shadow: var(--community-shadow); }
  .icon { width: 52px; height: 52px; display: grid; place-items: center; margin: 0 auto 1rem; border-radius: 50%; background: var(--community-danger-soft); color: var(--community-danger); font-size: 1.5rem; }
  .icon.transient { background: var(--community-warning-soft); color: var(--community-warning); }
  h1 { margin: 0; font-size: 1.35rem; }
  p { color: var(--community-muted); font-size: 0.85rem; line-height: 1.6; }
  code { display: inline-block; margin-bottom: 0.4rem; padding: 0.25rem 0.5rem; border-radius: 7px; background: var(--community-surface-soft); color: var(--community-muted); font-size: 0.7rem; }
  .actions { display: flex; justify-content: center; gap: 0.5rem; margin-top: 0.7rem; }
  .actions a { display: inline-block; padding: 0.65rem 1rem; border: 1px solid var(--community-border); border-radius: 10px; color: var(--community-text); text-decoration: none; font-size: 0.78rem; font-weight: 700; }
  .actions a.primary { border-color: transparent; background: var(--community-primary); color: white; }
</style>
