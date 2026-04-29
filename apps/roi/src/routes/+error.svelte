<script lang="ts">
  import '@celine-eu/ui/theme.css';
  import { page } from '$app/stores';

  function reload() {
    window.location.reload();
  }
</script>

<svelte:head>
  <title>CELINE Solar ROI</title>
</svelte:head>

<div class="error-page">
  <div class="error-card">
    <div class="error-icon">!</div>
    <h1 class="error-title">Something went wrong</h1>
    <p class="error-message">
      {#if $page.status === 502 || $page.status === 503}
        The service is temporarily unavailable. Please try again in a moment.
      {:else if $page.status === 504}
        The server took too long to respond.
      {:else if $page.error?.message}
        {$page.error.message}
      {:else}
        An unexpected error occurred (HTTP {$page.status}).
      {/if}
    </p>
    <button class="reload-btn" onclick={reload}>Reload page</button>
  </div>
</div>

<style>
  .error-page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--celine-bg, #f8fafc);
    padding: 1.5rem;
  }

  .error-card {
    text-align: center;
    max-width: 400px;
  }

  .error-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    background: var(--celine-danger-bg, #fef2f2);
    color: var(--celine-danger, #dc2626);
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 1rem;
  }

  .error-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--celine-text, #1a1a1a);
    margin: 0 0 0.5rem;
  }

  .error-message {
    font-size: 0.875rem;
    color: var(--celine-text-secondary, #666);
    margin: 0 0 1.5rem;
    line-height: 1.5;
  }

  .reload-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 1.25rem;
    background: var(--celine-primary, #0d9488);
    color: var(--celine-primary-text, #fff);
    border: none;
    border-radius: var(--celine-radius-sm, 0.375rem);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }

  .reload-btn:hover {
    background: var(--celine-primary-hover, #0f766e);
  }
</style>
