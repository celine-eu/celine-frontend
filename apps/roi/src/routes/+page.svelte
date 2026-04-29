<script lang="ts">
  import { onMount } from 'svelte';
  import { t, locale } from 'svelte-i18n';
  import { replaceState } from '$app/navigation';
  import { RoiCore } from '@celine-eu/roi-ui';
  import { SUPPORTED, LOCALE_LABELS, setLocale } from '$lib/i18n';

  let theme = $state('light');

  onMount(() => {
    theme = document.documentElement.getAttribute('data-theme') ?? 'light';
  });

  function toggleTheme() {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('celine-theme', theme);
  }
</script>

<svelte:head>
  <title>{$t('page.title')}</title>
  <meta name="description" content={$t('page.description')} />
</svelte:head>

<main class="page">
  <header class="header">
    <div class="header-content">
      <div>
        <div class="logo">{$t('page.logo')}</div>
        <p class="tagline">{$t('page.tagline')}</p>
      </div>
      <div class="header-actions">
        <div class="lang-switcher">
          {#each SUPPORTED as lang}
            <button
              class="lang-btn"
              class:active={$locale === lang}
              onclick={() => setLocale(lang)}
            >
              {LOCALE_LABELS[lang]}
            </button>
          {/each}
        </div>
        <button class="theme-btn" onclick={toggleTheme} title={$t('page.title')}>
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
      </div>
    </div>
  </header>

  <div class="content">
    <RoiCore apiBaseUrl="/api" onUrlChange={(url) => replaceState(url, {})} />
  </div>
</main>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--celine-bg);
    color: var(--celine-text);
  }

  .header {
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    padding: 1.125rem 1.5rem;
  }

  .header-content {
    max-width: 56rem;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .logo {
    font-size: 1.375rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .tagline {
    margin: 0.2rem 0 0;
    font-size: 0.875rem;
    opacity: 0.85;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .lang-switcher {
    display: flex;
    background: rgba(255, 255, 255, 0.1);
    border-radius: var(--celine-radius-full);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .lang-btn {
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    font-family: inherit;
    transition: background var(--celine-transition-fast), color var(--celine-transition-fast);
  }

  .lang-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.15);
  }

  .lang-btn.active {
    background: rgba(255, 255, 255, 0.25);
    color: white;
  }

  .theme-btn {
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: white;
    border-radius: var(--celine-radius-full);
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--celine-transition-fast);
  }

  .theme-btn:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .content {
    flex: 1;
  }

  @media print {
    .theme-btn,
    .lang-switcher {
      display: none !important;
    }

    .header {
      padding: 0.625rem 1rem;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .tagline {
      margin: 0;
    }

    .page {
      min-height: auto;
    }
  }
</style>
