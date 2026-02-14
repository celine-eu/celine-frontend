<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  
  interface Props {
    open: boolean;
    title?: string;
    size?: 'sm' | 'md' | 'lg' | 'full';
    onClose: () => void;
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
  }
  
  let {
    open,
    title = '',
    size = 'md',
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
  <div class="celine-modal-backdrop" onclick={handleBackdropClick}>
    <div 
      class="celine-modal celine-modal--{size}"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header class="celine-modal__header">
        {#if header}
          {@render header()}
        {:else}
          <h2 class="celine-modal__title">{title}</h2>
        {/if}
        <button 
          class="celine-modal__close"
          onclick={onClose}
          aria-label="Close modal"
        >
          <Icon name="x" size={20} />
        </button>
      </header>
      
      <div class="celine-modal__body">
        {@render children()}
      </div>
      
      {#if footer}
        <footer class="celine-modal__footer">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .celine-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: var(--celine-z-modal, 200);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--celine-space-md);
    animation: celine-fade-in 0.2s ease;
  }

  .celine-modal {
    background: var(--celine-bg-elevated);
    border-radius: var(--celine-radius-xl);
    box-shadow: var(--celine-shadow-xl);
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 2rem);
    animation: celine-scale-in 0.2s ease;
  }

  .celine-modal--sm { width: 100%; max-width: 400px; }
  .celine-modal--md { width: 100%; max-width: 560px; }
  .celine-modal--lg { width: 100%; max-width: 800px; }
  .celine-modal--full { width: 100%; max-width: calc(100vw - 2rem); height: calc(100vh - 2rem); }

  .celine-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--celine-space-md) var(--celine-space-lg);
    border-bottom: 1px solid var(--celine-border);
    flex-shrink: 0;
  }

  .celine-modal__title {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    color: var(--celine-text);
  }

  .celine-modal__close {
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

  .celine-modal__close:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .celine-modal__body {
    flex: 1;
    overflow-y: auto;
    padding: var(--celine-space-lg);
  }

  .celine-modal__footer {
    padding: var(--celine-space-md) var(--celine-space-lg);
    border-top: 1px solid var(--celine-border);
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: var(--celine-space-sm);
  }

  @keyframes celine-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes celine-scale-in {
    from { transform: scale(0.95); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }

  /* Mobile: full screen */
  @media (max-width: 480px) {
    .celine-modal-backdrop {
      padding: 0;
    }
    
    .celine-modal {
      max-width: 100%;
      max-height: 100%;
      height: 100%;
      border-radius: 0;
    }
  }
</style>
