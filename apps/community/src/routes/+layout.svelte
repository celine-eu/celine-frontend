<script lang="ts">
  import '../app.css';

  const { children }: { children: import('svelte').Snippet } = $props();
</script>

<!--
  Deliberately bare. The dashboard chrome — sidebar, topbar, feedback widget —
  lives in `[community]/+layout.svelte`, because every item in it is a link into
  one REC and there is no REC here. The picker and the denied page are
  full-bleed pages of their own.
-->
{@render children()}
