<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<svelte:head><title>{$_('denied.title')} · {$_('app.title')}</title></svelte:head>

<div class="denied">
  <div class="card">
    <div class="icon">×</div>
    <h1>{$_('denied.title')}</h1>
    <p>{$_('denied.body')}</p>
    <a href="/oauth2/sign_out">{$_('common.sign_out')}</a>
  </div>
</div>

<style>
  .denied { min-height: 100dvh; display: grid; place-items: center; padding: 2rem; background: var(--community-bg); }
  .card { width: min(100%, 420px); padding: 2.5rem; text-align: center; border: 1px solid var(--community-border); border-radius: 20px; background: var(--community-surface); box-shadow: var(--community-shadow); }
  .icon { width: 52px; height: 52px; display: grid; place-items: center; margin: 0 auto 1rem; border-radius: 50%; background: var(--community-danger-soft); color: var(--community-danger); font-size: 1.5rem; }
  h1 { margin: 0; font-size: 1.35rem; }
  p { color: var(--community-muted); font-size: 0.85rem; line-height: 1.6; }
  a { display: inline-block; margin-top: 0.7rem; padding: 0.65rem 1rem; border-radius: 10px; background: var(--community-primary); color: white; text-decoration: none; font-size: 0.78rem; font-weight: 700; }
</style>
