<script lang="ts">
  import { page } from "$app/stores";
  import type { Me, CommunityMeta } from "$lib/api";
  import { meStore } from "$lib/stores";
  import { Icon, ThemeToggle } from "@celine-eu/ui";
  import "@celine-eu/ui/theme.css";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { t, locale } from "svelte-i18n";

  interface Props {
    data: {
      me: Me | null;
      needs_terms: boolean;
      community: CommunityMeta | null;
      auth_error: boolean;
      unread_count: number;
    };
    children: Snippet;
  }

  let { data, children }: Props = $props();

  $effect(() => {
    meStore.set(data.me);
  });

  $effect(() => {
    if ($locale) {
      localStorage.setItem('locale', $locale);
    }
  });

  const navItems = [
    { href: "/", labelKey: "nav.overview", icon: "home" as const },
    { href: "/notifications", labelKey: "nav.alerts", icon: "bell" as const },
    { href: "/assistant", labelKey: "nav.assistant", icon: "bot" as const },
    { href: "/settings", labelKey: "nav.settings", icon: "settings" as const },
  ];

  function isActive(href: string, pathname: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const isAssistantPage = $derived($page.url.pathname === "/assistant");

  // User initials for avatar
  const userInitials = $derived.by(() => {
    const name = data.me?.user?.name;
    if (!name) return '?';
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  });

  onMount(() => {
    const root = document.documentElement;
    if (data.me) {
      root.style.setProperty(
        "--celine-font-scale",
        String(data.me.font_scale ?? 1),
      );
    }
  });
</script>

<svelte:head>
  <title>{data.community?.name ?? 'REC'} Webapp</title>
</svelte:head>

<div class="app-shell" class:app-shell--fixed={isAssistantPage}>
  <header class="top-header">
    <div class="top-header__content">
      <div class="top-header__brand">
        <Icon name="leaf" size={24} class="brand-icon" />
        <a href="/" class="brand-link">{data.community?.name ?? 'REC'}</a>
      </div>
      <div class="top-header__actions">
        <!-- Notifications bell -->
        <a
          href="/notifications"
          class="header-icon-btn"
          aria-label={$t('layout.open_notifications')}
          title={$t('layout.open_notifications')}
        >
          <Icon name="bell" size={20} />
          {#if data.unread_count > 0}
            <span class="notif-badge" aria-label="{data.unread_count} unread">
              {data.unread_count > 9 ? '9+' : data.unread_count}
            </span>
          {/if}
        </a>

        <!-- Profile dropdown -->
        <details class="profile-dropdown">
          <summary
            class="profile-avatar"
            aria-label={$t('layout.profile')}
            title={$t('layout.profile')}
          >
            {userInitials}
          </summary>
          <div class="profile-menu">
            {#if data.me?.user?.name}
              <div class="profile-menu__name">{data.me.user.name}</div>
            {/if}
            <a href="/settings" class="profile-menu__item">
              <Icon name="settings" size={16} />
              {$t('nav.settings')}
            </a>
            <div class="profile-menu__item profile-menu__item--toggle">
              <Icon name="sun" size={16} />
              <ThemeToggle />
            </div>
            <div class="profile-menu__divider"></div>
            <a
              href="/oauth2/sign_out?rd={encodeURIComponent($page.url.origin + '/oauth2/sign_in')}"
              class="profile-menu__item profile-menu__item--danger"
            >
              <Icon name="log-out" size={16} />
              {$t('layout.sign_out')}
            </a>
          </div>
        </details>
      </div>
    </div>
  </header>

  <div class="content-wrap" class:content-wrap--fixed={isAssistantPage}>
    {#if data.auth_error}
      <div class="rec-alert rec-alert--warning">
        <Icon name="alert-circle" size={20} />
        <div>
          <strong>{$t('layout.session_expired_title')}</strong>
          {$t('layout.session_expired_body')}
          <a
            href="/oauth2/sign_in?rd={encodeURIComponent($page.url.href)}"
            class="alert-link"
          >{$t('layout.login_again')}</a>
        </div>
      </div>
    {:else if data.me === null}
      <div class="rec-alert rec-alert--warning">
        <Icon name="alert-circle" size={20} />
        <div>
          <strong>{$t('layout.backend_unreachable_title')}</strong>
          {$t('layout.backend_unreachable_body')}
        </div>
      </div>
    {/if}
    {@render children()}
  </div>

  {#if data.community && (data.community.vat || data.community.email || data.community.pec || data.community.phone || data.community.website || data.community.terms_url || data.community.privacy_url)}
    <footer class="app-footer">
      <div class="app-footer__inner">
        {#if data.community.legal_name}
          <span class="footer-name">{data.community.legal_name}</span>
        {/if}
        {#if data.community.legal_form}
          <span class="footer-sep">·</span>
          <span>{data.community.legal_form}</span>
        {/if}
        {#if data.community.vat}
          <span class="footer-sep">·</span>
          <span>{$t('layout.vat')} {data.community.vat}</span>
        {/if}
        {#if data.community.email}
          <span class="footer-sep">·</span>
          <a href="mailto:{data.community.email}" class="footer-link">{data.community.email}</a>
        {/if}
        {#if data.community.pec}
          <span class="footer-sep">·</span>
          <a href="mailto:{data.community.pec}" class="footer-link">{$t('layout.pec')} {data.community.pec}</a>
        {/if}
        {#if data.community.phone}
          <span class="footer-sep">·</span>
          <a href="tel:{data.community.phone}" class="footer-link">{data.community.phone}</a>
        {/if}
        {#if data.community.website}
          <span class="footer-sep">·</span>
          <a href={data.community.website} class="footer-link" target="_blank" rel="noopener">{$t('layout.website')}</a>
        {/if}
        {#if data.community.terms_url}
          <span class="footer-sep">·</span>
          <a href={data.community.terms_url} class="footer-link" target="_blank" rel="noopener">{$t('layout.terms')}</a>
        {/if}
        {#if data.community.privacy_url}
          <span class="footer-sep">·</span>
          <a href={data.community.privacy_url} class="footer-link" target="_blank" rel="noopener">{$t('layout.privacy')}</a>
        {/if}
      </div>
    </footer>
  {/if}

  <nav class="bottom-nav" aria-label="Primary">
    <div class="bottom-nav__container">
      {#each navItems as item}
        {@const active = isActive(item.href, $page.url.pathname)}
        <a href={item.href} class="nav-item" class:nav-item--active={active}>
          <span class="nav-item__icon">
            <Icon name={item.icon} size={22} />
            {#if item.href === '/notifications' && data.unread_count > 0}
              <span class="nav-badge"></span>
            {/if}
          </span>
          <span class="nav-item__label">{$t(item.labelKey)}</span>
        </a>
      {/each}
    </div>
  </nav>
</div>

<style>
  :global(html) {
    font-size: calc(16px * var(--celine-font-scale, 1));
  }

  :global(html, body) {
    margin: 0;
    padding: 0;
  }

  .app-shell {
    min-height: 100vh;
    min-height: 100dvh;
    padding-top: 56px;
    padding-bottom: 72px;
  }

  .app-shell--fixed {
    height: 100vh;
    height: 100dvh;
    min-height: auto;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding-top: 56px;
    padding-bottom: 72px;
    box-sizing: border-box;
  }

  .top-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: var(--celine-bg-elevated);
    border-bottom: 1px solid var(--celine-border);
    z-index: 20;
  }

  .top-header__content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: 900px;
    height: 100%;
    margin: 0 auto;
    padding: 0 var(--celine-space-md);
  }

  .top-header__brand {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
  }

  .top-header__actions {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
  }

  :global(.brand-icon) {
    color: var(--celine-primary);
  }

  .brand-link {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--celine-text);
    text-decoration: none;
  }

  .brand-link:hover {
    color: var(--celine-primary);
  }

  /* Notification bell button */
  .header-icon-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--celine-radius-md);
    color: var(--celine-text-secondary);
    text-decoration: none;
    transition: color var(--celine-transition-fast), background var(--celine-transition-fast);
  }

  .header-icon-btn:hover {
    color: var(--celine-text);
    background: var(--celine-bg-hover);
  }

  .notif-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    min-width: 16px;
    height: 16px;
    padding: 0 3px;
    background: var(--celine-danger, #ef4444);
    color: #fff;
    border-radius: 999px;
    font-size: 0.625rem;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    pointer-events: none;
  }

  /* Profile dropdown */
  .profile-dropdown {
    position: relative;
  }

  .profile-dropdown summary {
    list-style: none;
  }

  .profile-dropdown summary::-webkit-details-marker {
    display: none;
  }

  .profile-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 999px;
    background: var(--celine-primary);
    color: #fff;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: pointer;
    user-select: none;
    border: 2px solid transparent;
    transition: border-color var(--celine-transition-fast);
  }

  .profile-dropdown[open] .profile-avatar {
    border-color: var(--celine-primary);
    background: var(--celine-primary-dark, color-mix(in srgb, var(--celine-primary) 85%, #000));
  }

  .profile-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 180px;
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    z-index: 100;
    padding: var(--celine-space-xs) 0;
    overflow: hidden;
  }

  .profile-menu__name {
    padding: var(--celine-space-sm) var(--celine-space-md);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--celine-text);
    border-bottom: 1px solid var(--celine-border);
    margin-bottom: var(--celine-space-xs);
  }

  .profile-menu__item {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    padding: var(--celine-space-sm) var(--celine-space-md);
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    text-decoration: none;
    transition: background var(--celine-transition-fast), color var(--celine-transition-fast);
    cursor: pointer;
  }

  .profile-menu__item:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .profile-menu__item--toggle {
    justify-content: space-between;
  }

  .profile-menu__item--danger:hover {
    background: var(--celine-danger-bg, rgba(239, 68, 68, 0.08));
    color: var(--celine-danger, #ef4444);
  }

  .profile-menu__divider {
    height: 1px;
    background: var(--celine-border);
    margin: var(--celine-space-xs) 0;
  }

  /* Footer */
  .app-footer {
    max-width: 900px;
    margin: var(--celine-space-lg) auto var(--celine-space-sm);
    padding: 0 var(--celine-space-md);
  }

  .app-footer__inner {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
    font-size: 0.75rem;
    color: var(--celine-text-secondary);
    padding: var(--celine-space-sm) 0;
    border-top: 1px solid var(--celine-border);
  }

  .footer-name { font-weight: 600; }
  .footer-sep { opacity: 0.4; }

  .footer-link {
    color: var(--celine-text-secondary);
    text-decoration: none;
  }

  .footer-link:hover {
    color: var(--celine-primary);
    text-decoration: underline;
  }

  /* Alert banners */
  .content-wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--celine-space-md);
    padding-top: var(--celine-space-lg);
    width: 100%;
    box-sizing: border-box;
  }

  .content-wrap--fixed {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .rec-alert {
    display: flex;
    align-items: flex-start;
    gap: var(--celine-space-sm);
    padding: var(--celine-space-md);
    border-radius: var(--celine-radius-md);
    margin-bottom: var(--celine-space-lg);
  }

  .rec-alert--warning {
    background: var(--celine-warning-bg);
    color: var(--celine-warning-text);
  }

  .alert-link {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;
    margin-left: 0.25rem;
  }

  .alert-link:hover { text-decoration: none; }

  /* Bottom nav */
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--celine-bg-elevated);
    border-top: 1px solid var(--celine-border);
    z-index: 20;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  .bottom-nav__container {
    display: flex;
    justify-content: space-around;
    max-width: 500px;
    margin: 0 auto;
  }

  .nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: var(--celine-space-sm) var(--celine-space-md);
    text-decoration: none;
    color: var(--celine-text-secondary);
    transition: color var(--celine-transition-fast);
    min-width: 64px;
  }

  .nav-item:hover { color: var(--celine-text); }
  .nav-item--active { color: var(--celine-primary); }

  .nav-item__icon {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--celine-radius-md);
  }

  .nav-item--active .nav-item__icon {
    background: var(--celine-primary-light);
  }

  .nav-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--celine-danger, #ef4444);
    border: 2px solid var(--celine-bg-elevated);
  }

  .nav-item__label {
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
  }
</style>
