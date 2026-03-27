<script lang="ts">
  import { onMount } from 'svelte';
  import { RoiCore } from '@celine-eu/roi-ui';

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
  <title>CELINE Solar ROI Calculator</title>
  <meta
    name="description"
    content="Estimate the return on investment for your photovoltaic system in Italy."
  />
</svelte:head>

<main class="page">
  <header class="header">
    <div class="header-content">
      <div>
        <div class="logo">☀ CELINE Solar ROI</div>
        <p class="tagline">Estimate the return on investment for your photovoltaic system</p>
      </div>
      <button class="theme-btn" onclick={toggleTheme} title="Toggle dark / light mode">
        {theme === 'dark' ? '☀' : '🌙'}
      </button>
    </div>
  </header>

  <div class="content">
    <RoiCore apiBaseUrl="/api" />
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
</style>
