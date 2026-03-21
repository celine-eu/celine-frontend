<script lang="ts">
  import { page } from "$app/stores";
  import type { Me, CommunityMeta } from "$lib/api";
  import { meStore } from "$lib/stores";
  import { Icon, ThemeToggle } from "@celine-eu/ui";
  import "@celine-eu/ui/theme.css";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    data: { me: Me | null; needs_terms: boolean; community: CommunityMeta | null };
    children: Snippet;
  }

  let { data, children }: Props = $props();

  $effect(() => {
    meStore.set(data.me);
  });

  const navItems = [
    { href: "/", label: "Overview", icon: "home" as const },
    { href: "/notifications", label: "Alerts", icon: "bell" as const },
    { href: "/assistant", label: "Assistant", icon: "bot" as const },
    { href: "/settings", label: "Settings", icon: "settings" as const },
  ];

  function isActive(href: string, pathname: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  const isAssistantPage = $derived($page.url.pathname === "/assistant");

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
        <ThemeToggle />
        <a
          href="/oauth2/sign_out?rd={encodeURIComponent($page.url.origin + '/oauth2/sign_in')}"
          class="logout-btn"
          aria-label="Sign out"
          title="Sign out"
        >
          <Icon name="log-out" size={20} />
        </a>
      </div>
    </div>
  </header>

  <div class="content-wrap" class:content-wrap--fixed={isAssistantPage}>
    {#if data.me === null}
      <div class="rec-alert rec-alert--warning">
        <Icon name="alert-circle" size={20} />
        <div>
          <strong>Backend not reachable.</strong>
          The UI shell is loaded, but data is unavailable.
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
          <span>VAT {data.community.vat}</span>
        {/if}
        {#if data.community.email}
          <span class="footer-sep">·</span>
          <a href="mailto:{data.community.email}" class="footer-link">{data.community.email}</a>
        {/if}
        {#if data.community.pec}
          <span class="footer-sep">·</span>
          <a href="mailto:{data.community.pec}" class="footer-link">PEC: {data.community.pec}</a>
        {/if}
        {#if data.community.phone}
          <span class="footer-sep">·</span>
          <a href="tel:{data.community.phone}" class="footer-link">{data.community.phone}</a>
        {/if}
        {#if data.community.website}
          <span class="footer-sep">·</span>
          <a href={data.community.website} class="footer-link" target="_blank" rel="noopener">Website</a>
        {/if}
        {#if data.community.terms_url}
          <span class="footer-sep">·</span>
          <a href={data.community.terms_url} class="footer-link" target="_blank" rel="noopener">Terms</a>
        {/if}
        {#if data.community.privacy_url}
          <span class="footer-sep">·</span>
          <a href={data.community.privacy_url} class="footer-link" target="_blank" rel="noopener">Privacy</a>
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
          </span>
          <span class="nav-item__label">{item.label}</span>
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

  /* Fixed height mode for assistant - no scroll on shell */
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
    gap: var(--celine-space-sm);
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

  .footer-name {
    font-weight: 600;
  }

  .footer-sep {
    opacity: 0.4;
  }

  .footer-link {
    color: var(--celine-text-secondary);
    text-decoration: none;
  }

  .footer-link:hover {
    color: var(--celine-primary);
    text-decoration: underline;
  }

  .logout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--celine-radius-md);
    color: var(--celine-text-secondary);
    text-decoration: none;
    transition:
      color var(--celine-transition-fast),
      background var(--celine-transition-fast);
  }

  .logout-btn:hover {
    color: var(--celine-danger, #ef4444);
    background: var(--celine-danger-bg, rgba(239, 68, 68, 0.08));
  }

  .content-wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--celine-space-md);
    padding-top: var(--celine-space-lg);
    width: 100%;
    box-sizing: border-box;
  }

  /* Fixed mode for assistant */
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

  .nav-item:hover {
    color: var(--celine-text);
  }

  .nav-item--active {
    color: var(--celine-primary);
  }

  .nav-item__icon {
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

  .nav-item__label {
    font-size: 0.6875rem;
    font-weight: 500;
    text-transform: uppercase;
  }
</style>
