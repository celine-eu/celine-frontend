<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { AssistantContext } from './types.js';
  import AssistantWidget from './AssistantWidget.svelte';

  interface Props {
    apiBaseUrl?: string;
    position?: 'bottom-right' | 'bottom-left';
    context?: AssistantContext | null;
    showWidget?: boolean;
    children: Snippet;
  }

  let {
    apiBaseUrl = '/api',
    position = 'bottom-right',
    context = null,
    showWidget = true,
    children
  }: Props = $props();

  let widget: AssistantWidget | null = $state(null);

  // Provide controller to child components
  const controller = {
    open: (opts: { context?: AssistantContext; prompt?: string }) => {
      widget?.openWith(opts);
    }
  };

  setContext('assistant-widget', controller);

  // Also listen for custom events (for components outside the provider)
  if (typeof window !== 'undefined') {
    window.addEventListener('assistant:open', ((e: CustomEvent) => {
      widget?.openWith(e.detail);
    }) as EventListener);
  }
</script>

{@render children()}

{#if showWidget}
  <AssistantWidget
    bind:this={widget}
    {apiBaseUrl}
    {position}
    {context}
  />
{/if}
