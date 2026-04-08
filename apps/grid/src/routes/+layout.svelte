<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import type { LayoutData } from './$types';
  import { meStore } from '$lib/stores';
  import { _ } from 'svelte-i18n';

  const { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  $effect(() => {
    meStore.set(data.me);
  });

  let profileOpen = $state(false);

  function initials(me: typeof data.me): string {
    if (!me) return '?';
    const n = me.name ?? me.preferred_username ?? me.email;
    return n
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') profileOpen = false;
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="app-shell">
  <header class="app-header">
    <a class="app-logo" href="/">{$_('app.title')}</a>

    <nav class="app-nav">
      <a href="/" class:active={$page.url.pathname === '/'}>{$_('nav.map')}</a>
      <a href="/management" class:active={$page.url.pathname.startsWith('/management')}>
        {$_('nav.management')}
      </a>
    </nav>

    <div class="header-right">
      {#if data.me}
        <button
          class="avatar-btn"
          onclick={() => (profileOpen = !profileOpen)}
          aria-label="Profile menu"
        >
          {initials(data.me)}
        </button>
        {#if profileOpen}
          <div class="profile-dropdown" role="menu">
            <div class="profile-email">{data.me.email}</div>
            <hr />
            <a href="/oauth2/sign_out" role="menuitem">Sign out</a>
          </div>
        {/if}
      {/if}
    </div>
  </header>

  <main class="app-main">
    {@render children()}
  </main>
</div>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    font-family: var(--celine-font-sans, system-ui, sans-serif);
    background: var(--celine-bg, #f8fafc);
    color: var(--celine-text, #1e293b);
  }

  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
  }

  .app-header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    height: 56px;
    padding: 0 1.25rem;
    background: var(--celine-bg-elevated, #ffffff);
    border-bottom: 1px solid var(--celine-border, #e2e8f0);
    flex-shrink: 0;
    position: relative;
    z-index: 100;
  }

  .app-logo {
    font-weight: 700;
    font-size: 1rem;
    color: var(--celine-primary, #0d9488);
    text-decoration: none;
    white-space: nowrap;
  }

  .app-nav {
    display: flex;
    gap: 0.25rem;
    flex: 1;
  }

  .app-nav a {
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--celine-text-muted, #64748b);
    text-decoration: none;
    transition: background 0.15s, color 0.15s;
  }

  .app-nav a:hover {
    background: var(--celine-bg-hover, #f1f5f9);
    color: var(--celine-text, #1e293b);
  }

  .app-nav a.active {
    background: var(--celine-primary-subtle, #ccfbf1);
    color: var(--celine-primary, #0d9488);
  }

  .header-right {
    margin-left: auto;
    position: relative;
  }

  .avatar-btn {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--celine-primary, #0d9488);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .profile-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 200px;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    padding: 0.5rem 0;
    z-index: 200;
  }

  .profile-email {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
    color: var(--celine-text-muted, #64748b);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-dropdown hr {
    border: none;
    border-top: 1px solid var(--celine-border, #e2e8f0);
    margin: 0.25rem 0;
  }

  .profile-dropdown a {
    display: block;
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    color: var(--celine-text, #1e293b);
    text-decoration: none;
  }

  .profile-dropdown a:hover {
    background: var(--celine-bg-hover, #f1f5f9);
  }

  .app-main {
    flex: 1;
    overflow: hidden;
  }
</style>
