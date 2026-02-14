<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  
  interface Props {
    open: boolean;
    title?: string;
    position?: 'left' | 'right';
    onClose: () => void;
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }
  
  let {
    open,
    title = '',
    position = 'right',
    onClose,
    children,
    header,
    footer
  }: Props = $props();
  
  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }
  
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="celine-panel-backdrop" onclick={handleBackdropClick}>
    <aside 
      class="celine-panel celine-panel--{position}"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header class="celine-panel__header">
        {#if header}
          {@render header()}
        {:else}
          <h2 class="celine-panel__title">{title}</h2>
        {/if}
        <button 
          class="celine-panel__close"
          onclick={onClose}
          aria-label="Close panel"
        >
          <Icon name="x" size={20} />
        </button>
      </header>
      
      <div class="celine-panel__body">
        {@render children()}
      </div>
      
      {#if footer}
        <footer class="celine-panel__footer">
          {@render footer()}
        </footer>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .celine-panel-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--celine-z-modal, 200);
    animation: celine-fade-in 0.2s ease;
  }

  .celine-panel {
    position: fixed;
    top: 0;
    bottom: 0;
    width: 100%;
    max-width: 400px;
    background: var(--celine-bg-elevated);
    display: flex;
    flex-direction: column;
    box-shadow: var(--celine-shadow-xl);
  }

  .celine-panel--right {
    right: 0;
    animation: celine-slide-in-right 0.25s ease;
  }

  .celine-panel--left {
    left: 0;
    animation: celine-slide-in-left 0.25s ease;
  }

  .celine-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--celine-space-md) var(--celine-space-lg);
    border-bottom: 1px solid var(--celine-border);
    flex-shrink: 0;
  }

  .celine-panel__title {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--celine-text);
  }

  .celine-panel__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    color: var(--celine-text-secondary);
    border-radius: var(--celine-radius-md);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .celine-panel__close:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .celine-panel__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--celine-space-lg);
  }

  .celine-panel__footer {
    padding: var(--celine-space-md) var(--celine-space-lg);
    border-top: 1px solid var(--celine-border);
    flex-shrink: 0;
  }

  @keyframes celine-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes celine-slide-in-right {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @keyframes celine-slide-in-left {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }

  /* Mobile: full screen */
  @media (max-width: 480px) {
    .celine-panel {
      max-width: 100%;
    }
  }
</style>
