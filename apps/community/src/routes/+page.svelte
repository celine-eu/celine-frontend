<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let query = $state('');

  // A realm admin can hold every REC on the deployment; an organization-scoped
  // manager never reaches this page with more than one. The filter earns its
  // place for the first and is invisible to the second.
  const showFilter = $derived(data.communities.length > 8);
  const matches = $derived(
    data.communities.filter((community) =>
      `${community.name} ${community.key}`.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );
</script>

<svelte:head><title>{$_('picker.title')} · {$_('app.title')}</title></svelte:head>

<div class="picker">
  <div class="card">
    <header>
      <span class="brand-mark">C</span>
      <div>
        <h1>{$_('picker.title')}</h1>
        <p>{$_('picker.subtitle')}</p>
      </div>
    </header>

    {#if showFilter}
      <label class="filter">
        <span class="sr-only">{$_('picker.filter')}</span>
        <input type="search" bind:value={query} placeholder={$_('picker.filter')} />
      </label>
    {/if}

    <ul>
      {#each matches as community (community.key)}
        <li>
          <a href={`/${encodeURIComponent(community.key)}`}>
            <span class="dot"></span>
            <span class="labels">
              <strong>{community.name}</strong>
              <small>{community.key}</small>
            </span>
            <span aria-hidden="true">→</span>
          </a>
        </li>
      {/each}
    </ul>

    {#if matches.length === 0}
      <p class="empty">{$_('picker.no_matches')}</p>
    {/if}

    <a class="sign-out" href="/oauth2/sign_out">{$_('common.sign_out')}</a>
  </div>
</div>

<style>
  .picker { min-height: 100dvh; display: grid; place-items: center; padding: 2rem; background: var(--community-bg); }
  .card { width: min(100%, 520px); padding: 2rem; border: 1px solid var(--community-border); border-radius: 20px; background: var(--community-surface); box-shadow: var(--community-shadow); }
  header { display: flex; align-items: center; gap: 0.85rem; margin-bottom: 1.4rem; }
  .brand-mark { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 40px; border-radius: 13px; background: var(--community-primary); color: #fff; font-weight: 800; }
  h1 { margin: 0; font-size: 1.2rem; letter-spacing: -0.02em; }
  header p { margin: 0.25rem 0 0; color: var(--community-muted); font-size: 0.75rem; line-height: 1.5; }
  .filter { display: block; margin-bottom: 0.8rem; }
  .filter input { width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--community-border); border-radius: 11px; background: var(--community-bg); color: var(--community-text); font-size: 0.8rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
  li a { display: flex; align-items: center; gap: 0.7rem; padding: 0.8rem 0.9rem; border: 1px solid var(--community-border); border-radius: 13px; color: var(--community-text); text-decoration: none; transition: 0.16s ease; }
  li a:hover { border-color: var(--community-primary); background: var(--community-primary-soft); }
  .dot { width: 9px; height: 9px; flex: 0 0 9px; border-radius: 50%; background: #22c55e; }
  .labels { min-width: 0; flex: 1; }
  .labels strong, .labels small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .labels strong { font-size: 0.85rem; }
  .labels small { margin-top: 0.15rem; color: var(--community-muted); font-size: 0.65rem; }
  .empty { margin: 1rem 0 0; color: var(--community-muted); font-size: 0.78rem; text-align: center; }
  .sign-out { display: inline-block; margin-top: 1.4rem; color: var(--community-muted); text-decoration: none; font-size: 0.72rem; font-weight: 700; }
  .sign-out:hover { color: var(--community-primary); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
