<script lang="ts">
  import { page } from "$app/stores";
  import type { Me } from "$lib/api";
  import { meStore } from "$lib/stores";
  import { Icon, ThemeToggle } from "@celine-eu/ui";
  import "@celine-eu/ui/theme.css";
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";

  interface Props {
    data: { me: Me | null; needs_terms: boolean };
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
  <title>REC Webapp</title>
</svelte:head>

<div class="app-shell" class:app-shell--fixed={isAssistantPage}>
  <header class="top-header">
    <div class="top-header__content">
      <div class="top-header__brand">
        <Icon name="leaf" size={24} class="brand-icon" />
        <span class="brand-text">REC</span>
      </div>
      <ThemeToggle />
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

  :global(.brand-icon) {
    color: var(--celine-primary);
  }

  .brand-text {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--celine-text);
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
