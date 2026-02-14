<script lang="ts">
  import { getContext } from 'svelte';
  import { Icon } from '@celine-eu/ui';
  import type { AssistantContext } from './types.js';

  interface Props {
    context?: AssistantContext;
    prompt?: string | null;
    label?: string;
    iconOnly?: boolean;
    size?: 'sm' | 'md';
  }

  let {
    context = {},
    prompt = null,
    label = 'Ask Assistant',
    iconOnly = false,
    size = 'sm'
  }: Props = $props();

  // Get the widget controller from context (provided by AssistantProvider)
  const widgetController = getContext<{ open: (opts: { context?: AssistantContext; prompt?: string }) => void } | null>('assistant-widget');

  function handleClick() {
    if (widgetController) {
      widgetController.open({ 
        context, 
        prompt: prompt ?? undefined 
      });
    } else {
      // Fallback: dispatch custom event that can be caught by the widget
      window.dispatchEvent(new CustomEvent('assistant:open', { 
        detail: { context, prompt } 
      }));
    }
  }
</script>

<button 
  class="ask-btn ask-btn--{size}" 
  class:icon-only={iconOnly}
  onclick={handleClick}
  title={label}
  aria-label={label}
>
  <Icon name="bot" size={size === 'sm' ? 14 : 16} />
  {#if !iconOnly}
    <span class="ask-label">{label}</span>
  {/if}
</button>

<style>
  .ask-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    border-radius: var(--celine-radius-full);
    background: var(--celine-primary-light);
    color: var(--celine-primary);
    cursor: pointer;
    font-family: inherit;
    font-weight: 500;
    transition: all var(--celine-transition-fast);
  }

  .ask-btn--sm {
    padding: 4px 10px;
    font-size: 0.75rem;
  }

  .ask-btn--md {
    padding: 6px 12px;
    font-size: 0.8125rem;
  }

  .ask-btn:hover {
    background: var(--celine-primary);
    color: var(--celine-primary-text);
  }

  .ask-btn.icon-only {
    padding: 6px;
    border-radius: 50%;
  }

  .ask-btn--md.icon-only {
    padding: 8px;
  }

  .ask-label {
    white-space: nowrap;
  }
</style>
