<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { _ } from 'svelte-i18n';
  import { FeedbackWidget } from '@celine-eu/ui';
  import { submitFeedback } from '$lib/api';
  import { collectFeedbackDiagnostics } from '$lib/feedback';
  import type { LayoutData } from './$types';

  const { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

  const nav = [
    { href: '/', label: 'nav.overview', icon: '⌂' },
    { href: '/devices', label: 'nav.devices', icon: '◫' },
    { href: '/flexibility', label: 'nav.flexibility', icon: '↯' },
    { href: '/gamification', label: 'nav.gamification', icon: '◇' },
    { href: '/data-flow', label: 'nav.data_flow', icon: '≋' },
    { href: '/nudging', label: 'nav.nudging', icon: '◉' },
    { href: '/alerts', label: 'nav.alerts', icon: '!' },
  ];

  let profileOpen = $state(false);
  let dark = $state(false);

  onMount(() => {
    dark = document.documentElement.classList.contains('dark');
  });

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('light', !dark);
    localStorage.setItem('celine-theme', dark ? 'dark' : 'light');
  }

  function initials(): string {
    const value = data.me?.name ?? data.me?.preferredUsername ?? data.me?.email ?? '?';
    return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
  }

  function active(href: string): boolean {
    return href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href);
  }
</script>

{#if $page.url.pathname === '/denied'}
  {@render children()}
{:else}
  <a class="skip-link" href="#main-content">{$_('common.skip_to_content')}</a>
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label={$_('app.title')}>
        <span class="brand-mark">C</span>
        <span><strong>CELINE</strong><small>{$_('app.title')}</small></span>
      </a>

      <nav aria-label="Main navigation">
        {#each nav as item}
          <a href={item.href} class:active={active(item.href)}>
            <span class="nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{$_(item.label)}</span>
          </a>
        {/each}
      </nav>

      <div class="sidebar-footer">
        <div class="community-dot"></div>
        <div><small>REC</small><strong>{data.me?.communityName}</strong></div>
      </div>
    </aside>

    <div class="workspace">
      <header class="topbar">
        <div class="mobile-brand"><span class="brand-mark">C</span><strong>CELINE</strong></div>
        <div class="topbar-actions">
          <button class="icon-button" onclick={toggleTheme} aria-label="Toggle color theme">
            {dark ? '☀' : '☾'}
          </button>
          <button class="profile" onclick={() => (profileOpen = !profileOpen)} aria-expanded={profileOpen}>
            <span class="avatar">{initials()}</span>
            <span class="profile-copy"><strong>{data.me?.name}</strong><small>REC Manager</small></span>
            <span aria-hidden="true">⌄</span>
          </button>
          {#if profileOpen}
            <div class="profile-menu">
              <span>{data.me?.email}</span>
              <a href="/oauth2/sign_out">{$_('common.sign_out')}</a>
            </div>
          {/if}
        </div>
      </header>

      <main id="main-content" tabindex="-1">{@render children()}</main>

      <nav class="mobile-nav" aria-label="Mobile navigation">
        {#each nav.slice(0, 5) as item}
          <a href={item.href} class:active={active(item.href)}>
            <span aria-hidden="true">{item.icon}</span>
            <small>{$_(item.label)}</small>
          </a>
        {/each}
      </nav>
    </div>
  </div>

  <FeedbackWidget
    class="manager-feedback"
    buttonLabel={$_('feedback.button')}
    title={$_('feedback.title')}
    description={$_('feedback.description')}
    labels={{
      rating: $_('feedback.rating'),
      comment: $_('feedback.comment'),
      commentPlaceholder: $_('feedback.comment_placeholder'),
      currentSelection: $_('feedback.current_selection'),
      close: $_('feedback.close'),
      submit: $_('feedback.submit'),
      success: $_('feedback.success'),
    }}
    collectContext={() => collectFeedbackDiagnostics({
      community_key: data.me?.communityKey ?? null,
      dashboard: 'community-manager',
    })}
    {submitFeedback}
  />
{/if}

<style>
  .shell { min-height: 100dvh; display: grid; grid-template-columns: 232px minmax(0, 1fr); }
  .sidebar { position: sticky; top: 0; height: 100dvh; padding: 1.2rem 0.9rem; background: var(--community-surface); border-right: 1px solid var(--community-border); display: flex; flex-direction: column; z-index: 20; }
  .brand { display: flex; align-items: center; gap: 0.7rem; padding: 0.35rem 0.5rem 1.7rem; color: var(--community-text); text-decoration: none; }
  .brand-mark { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 11px; background: var(--community-primary); color: #fff; font-weight: 800; }
  .brand strong, .brand small { display: block; }
  .brand strong { font-size: 0.82rem; letter-spacing: 0.12em; }
  .brand small { color: var(--community-muted); font-size: 0.68rem; margin-top: 0.08rem; }
  nav { display: flex; flex-direction: column; gap: 0.25rem; }
  nav a { display: flex; align-items: center; gap: 0.75rem; padding: 0.72rem 0.8rem; border-radius: 11px; color: var(--community-muted); text-decoration: none; font-size: 0.82rem; font-weight: 620; transition: 0.16s ease; }
  nav a:hover { color: var(--community-text); background: var(--community-surface-soft); }
  nav a.active { color: var(--community-primary-strong); background: var(--community-primary-soft); }
  .nav-icon { width: 22px; text-align: center; font-size: 1rem; font-weight: 800; }
  .sidebar-footer { margin-top: auto; display: flex; gap: 0.65rem; align-items: center; padding: 0.8rem; border-radius: 12px; background: var(--community-surface-soft); min-width: 0; }
  .sidebar-footer small, .sidebar-footer strong { display: block; }
  .sidebar-footer small { color: var(--community-muted); font-size: 0.62rem; font-weight: 700; }
  .sidebar-footer strong { font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .community-dot { width: 9px; height: 9px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 4px color-mix(in srgb, #22c55e 18%, transparent); }
  .workspace { min-width: 0; min-height: 100dvh; }
  .topbar { position: sticky; top: 0; z-index: 15; height: 68px; padding: 0 2rem; display: flex; align-items: center; background: color-mix(in srgb, var(--community-bg) 86%, transparent); backdrop-filter: blur(16px); border-bottom: 1px solid color-mix(in srgb, var(--community-border) 70%, transparent); }
  .topbar-actions { margin-left: auto; display: flex; align-items: center; gap: 0.65rem; position: relative; }
  .icon-button { width: 36px; height: 36px; border: 1px solid var(--community-border); border-radius: 10px; background: var(--community-surface); color: var(--community-text); cursor: pointer; }
  .profile { display: flex; align-items: center; gap: 0.55rem; padding: 0.25rem 0.45rem 0.25rem 0.25rem; border: 0; background: transparent; color: var(--community-text); cursor: pointer; }
  .avatar { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; background: var(--community-primary); color: white; font-size: 0.7rem; font-weight: 800; }
  .profile-copy { text-align: left; }
  .profile-copy strong, .profile-copy small { display: block; }
  .profile-copy strong { font-size: 0.76rem; }
  .profile-copy small { color: var(--community-muted); font-size: 0.65rem; }
  .profile-menu { position: absolute; right: 0; top: calc(100% + 0.65rem); min-width: 220px; padding: 0.75rem; display: grid; gap: 0.7rem; border: 1px solid var(--community-border); border-radius: 12px; background: var(--community-surface); box-shadow: var(--community-shadow); font-size: 0.75rem; }
  .profile-menu span { color: var(--community-muted); }
  .profile-menu a { color: var(--community-primary); text-decoration: none; font-weight: 700; }
  main { min-height: calc(100dvh - 68px); }
  .mobile-brand, .mobile-nav { display: none; }
  :global(.manager-feedback .feedback-widget__trigger) { bottom: 1rem; }
  @media (max-width: 880px) {
    .shell { display: block; }
    .sidebar { display: none; }
    .topbar { height: 60px; padding: 0 1rem; }
    .mobile-brand { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; letter-spacing: 0.1em; }
    .mobile-brand .brand-mark { width: 30px; height: 30px; flex-basis: 30px; }
    .profile-copy { display: none; }
    main { min-height: calc(100dvh - 118px); padding-bottom: 58px; }
    .mobile-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 30; display: grid; grid-template-columns: repeat(5, 1fr); background: var(--community-surface); border-top: 1px solid var(--community-border); padding-bottom: env(safe-area-inset-bottom); }
    .mobile-nav a { display: grid; justify-items: center; gap: 0.15rem; padding: 0.55rem 0.2rem; border-radius: 0; font-size: 1rem; }
    .mobile-nav small { font-size: 0.55rem; }
    :global(.manager-feedback .feedback-widget__trigger) { bottom: calc(4.35rem + env(safe-area-inset-bottom)); }
  }
</style>
