<script lang="ts">
  import '../app.css';
  import { page } from '$app/stores';
  import { env } from '$env/dynamic/public';
  import { EnvBanner } from '@celine-eu/ui';
  import { _ } from 'svelte-i18n';

  const { children }: { children: import('svelte').Snippet } = $props();
</script>

<!--
  Deliberately bare. The dashboard chrome — sidebar, topbar, feedback widget —
  lives in `[community]/+layout.svelte`, because every item in it is a link into
  one REC and there is no REC here. The picker and the denied page are
  full-bleed pages of their own. The environment banner is the exception: it is
  about the deployment, not a REC.
-->
<EnvBanner
  env={env.PUBLIC_CELINE_ENV}
  prodUrl={env.PUBLIC_CELINE_PROD_URL}
  pathname={$page.url.pathname}
  labels={{ message: $_('env_banner.message'), link: $_('env_banner.link') }}
/>

{@render children()}
