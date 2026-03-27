<script lang="ts">
  import RoiCore from './RoiCore.svelte';

  interface Props {
    apiBaseUrl?: string;
    buttonLabel?: string;
    position?: 'bottom-right' | 'bottom-left';
  }

  let {
    apiBaseUrl = '/api',
    buttonLabel = 'Solar ROI',
    position = 'bottom-right',
  }: Props = $props();

  let open = $state(false);
</script>

<div class="widget" class:bottom-right={position === 'bottom-right'} class:bottom-left={position === 'bottom-left'}>
  {#if open}
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">☀ Solar ROI Calculator</span>
        <button class="close-btn" onclick={() => (open = false)} aria-label="Close">✕</button>
      </div>
      <div class="panel-body">
        <RoiCore {apiBaseUrl} embedded={true} />
      </div>
    </div>
  {/if}

  <button class="fab" onclick={() => (open = !open)} aria-label={buttonLabel}>
    {#if open}
      ✕
    {:else}
      ☀ <span class="fab-label">{buttonLabel}</span>
    {/if}
  </button>
</div>

<style>
  .widget {
    position: fixed;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .bottom-right {
    bottom: 1.5rem;
    right: 1.5rem;
  }

  .bottom-left {
    bottom: 1.5rem;
    left: 1.5rem;
    align-items: flex-start;
  }

  .panel {
    width: 640px;
    max-width: calc(100vw - 3rem);
    max-height: calc(100vh - 8rem);
    background: white;
    border-radius: 0.75rem;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--color-primary, #0d9488);
    color: white;
    flex-shrink: 0;
  }

  .panel-title {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: white;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
    opacity: 0.85;
  }

  .close-btn:hover {
    opacity: 1;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
  }

  .fab {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.75rem 1.25rem;
    background: var(--color-primary, #0d9488);
    color: white;
    border: none;
    border-radius: 2rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    transition: transform 0.15s, box-shadow 0.15s;
    font-family: inherit;
  }

  .fab:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  }

  .fab-label {
    font-size: 0.875rem;
  }
</style>
