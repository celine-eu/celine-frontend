<script lang="ts">
  import type { Snippet } from 'svelte';
  
  type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
  type ButtonSize = 'sm' | 'md' | 'lg';
  
  interface Props {
    variant?: ButtonVariant;
    size?: ButtonSize;
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
    class?: string;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }
  
  let { 
    variant = 'secondary', 
    size = 'md', 
    disabled = false,
    loading = false,
    type = 'button',
    class: className = '',
    onclick,
    children
  }: Props = $props();
</script>

<button
  {type}
  class="celine-btn celine-btn--{variant} celine-btn--{size} {className}"
  disabled={disabled || loading}
  onclick={onclick}
>
  {#if loading}
    <span class="celine-btn__spinner"></span>
  {/if}
  {@render children()}
</button>

<style>
  .celine-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
    font-family: var(--celine-font-body);
    font-weight: 500;
    border-radius: var(--celine-radius-md);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
    border: 1px solid transparent;
    text-decoration: none;
    white-space: nowrap;
  }

  /* Sizes */
  .celine-btn--sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
  }

  .celine-btn--md {
    padding: 0.625rem 1rem;
    font-size: 0.9375rem;
  }

  .celine-btn--lg {
    padding: 0.875rem 1.5rem;
    font-size: 1rem;
  }

  /* Variants */
  .celine-btn--primary {
    background: var(--celine-primary);
    border-color: var(--celine-primary);
    color: var(--celine-primary-text);
  }

  .celine-btn--primary:hover:not(:disabled) {
    background: var(--celine-primary-hover);
    border-color: var(--celine-primary-hover);
  }

  .celine-btn--secondary {
    background: var(--celine-bg-elevated);
    border-color: var(--celine-border);
    color: var(--celine-text);
  }

  .celine-btn--secondary:hover:not(:disabled) {
    background: var(--celine-bg-sunken);
    border-color: var(--celine-border-strong);
  }

  .celine-btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--celine-text-secondary);
  }

  .celine-btn--ghost:hover:not(:disabled) {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .celine-btn--danger {
    background: var(--celine-danger-bg);
    border-color: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  .celine-btn--danger:hover:not(:disabled) {
    background: var(--celine-danger);
    border-color: var(--celine-danger);
    color: white;
  }

  /* States */
  .celine-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .celine-btn:focus-visible {
    outline: 2px solid var(--celine-primary);
    outline-offset: 2px;
  }

  /* Spinner */
  .celine-btn__spinner {
    width: 1em;
    height: 1em;
    border: 2px solid transparent;
    border-top-color: currentColor;
    border-radius: 50%;
    animation: celine-spin 0.8s linear infinite;
  }

  @keyframes celine-spin {
    to { transform: rotate(360deg); }
  }
</style>
