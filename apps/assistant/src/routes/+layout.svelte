<script lang="ts">
  import '@celine-eu/ui/theme.css';
  import { startSessionGuard } from '@celine-eu/ui/session';
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  onMount(() => startSessionGuard({ pingUrl: '/api/ping' }));
</script>

<div class="app">
  {@render children()}
</div>

<style>
  .app {
    min-height: 100vh;
    min-height: 100dvh;
  }
</style>
