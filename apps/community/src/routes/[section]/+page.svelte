<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const labels: Record<string, string> = {
    devices: 'nav.devices',
    flexibility: 'nav.flexibility',
    gamification: 'nav.gamification',
    'data-flow': 'nav.data_flow',
    nudging: 'nav.nudging',
    alerts: 'nav.alerts',
  };
</script>

<svelte:head><title>{$_(labels[data.section])} · {$_('app.title')}</title></svelte:head>

<div class="placeholder">
  <div class="route-mark">{data.section.slice(0, 2).toUpperCase()}</div>
  <div>
    <span>{$_(labels[data.section])}</span>
    <h1>{$_('placeholder.title')}</h1>
    <p>{$_('placeholder.body')}</p>
  </div>
</div>

<style>
  .placeholder { min-height: calc(100dvh - 68px); display: flex; align-items: center; justify-content: center; gap: 1.2rem; padding: 2rem; }
  .route-mark { width: 58px; height: 58px; display: grid; place-items: center; flex: 0 0 58px; border-radius: 18px; background: var(--community-primary-soft); color: var(--community-primary-strong); font-weight: 850; }
  .placeholder span { color: var(--community-primary); text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.65rem; font-weight: 800; }
  h1 { margin: 0.35rem 0; font-size: 1.35rem; }
  p { max-width: 460px; margin: 0; color: var(--community-muted); font-size: 0.82rem; line-height: 1.55; }
  @media (max-width: 600px) { .placeholder { align-items: flex-start; justify-content: flex-start; padding-top: 4rem; } }
</style>
