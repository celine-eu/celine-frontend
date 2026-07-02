<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';
  import AssistantWidget from './AssistantWidget.svelte';

  interface Props {
    apiBaseUrl?: string;
    position?: 'bottom-right' | 'bottom-left';
    showWidget?: boolean;
    children: Snippet;
  }

  let {
    apiBaseUrl = '/api',
    position = 'bottom-right',
    showWidget = true,
    children
  }: Props = $props();

  let widget: AssistantWidget | null = $state(null);

  const controller = {
    open: (opts: { prompt?: string }) => {
      widget?.openWith(opts);
    }
  };

  setContext('assistant-widget', controller);

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
  />
{/if}
