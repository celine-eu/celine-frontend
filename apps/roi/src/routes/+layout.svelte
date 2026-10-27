<script lang="ts">
  import { page } from '$app/stores';
  import { env } from '$env/dynamic/public';
  import { EnvBanner } from '@celine-eu/ui';
  import '@celine-eu/ui/theme.css';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<EnvBanner
  env={env.PUBLIC_CELINE_ENV}
  prodUrl={env.PUBLIC_CELINE_PROD_URL}
  pathname={$page.url.pathname}
  labels={{ message: $t('env_banner.message'), link: $t('env_banner.link') }}
/>

<div class="app">
  {@render children()}
</div>

<style>
  .app {
    min-height: 100vh;
    min-height: 100dvh;
  }
</style>
