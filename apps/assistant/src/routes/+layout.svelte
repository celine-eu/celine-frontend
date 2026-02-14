<script lang="ts">
  import '@celine-eu/ui/theme.css';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
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
