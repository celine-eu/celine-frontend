<script lang="ts">
  /**
   * EnvBanner - says the UI is not production and links to the same page there.
   * Renders nothing when `env` is `prod`. Not dismissible.
   */
  import Icon from './Icon.svelte';
  import { isProduction, productionHref } from './environment';

  type EnvBannerLabels = {
    /** "You are on a development version" */
    message: string;
    /** Text of the link to production. */
    link: string;
  };

  interface Props {
    /** `PUBLIC_CELINE_ENV`. */
    env?: string | null;
    /** `PUBLIC_CELINE_PROD_URL`. */
    prodUrl?: string | null;
    /** The current page's pathname, kept on the production link. */
    pathname: string;
    labels: EnvBannerLabels;
  }

  let { env, prodUrl, pathname, labels }: Props = $props();

  const shown = $derived(!isProduction(env));
  const href = $derived(productionHref(prodUrl, pathname));
</script>

{#if shown}
  <div class="env-banner" role="status" data-testid="env-banner">
    <Icon name="alert-triangle" size={16} />
    <span>{labels.message}</span>
    {#if href}
      <a {href}>{labels.link}</a>
    {/if}
  </div>
{/if}

<style>
  .env-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.25rem 0.5rem;
    padding: 0.375rem 1rem;
    background: var(--celine-warning-bg, #fef3c7);
    color: var(--celine-warning-text, #92400e);
    border-bottom: 1px solid var(--celine-warning, #f59e0b);
    font-size: 0.875rem;
    line-height: 1.4;
    text-align: center;
  }

  .env-banner a {
    color: inherit;
    font-weight: 600;
    text-decoration: underline;
  }
</style>
