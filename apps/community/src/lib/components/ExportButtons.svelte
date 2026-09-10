<script lang="ts">
  import { _ } from 'svelte-i18n';
  import type { Period } from '$lib/api';

  let { communityKey, dataset, period }: { communityKey: string; dataset: string; period?: Period } = $props();

  function href(format: 'csv' | 'xlsx'): string {
    const params = new URLSearchParams({ format });
    if (period) params.set('period', period);
    return `/api/communities/${encodeURIComponent(communityKey)}/exports/${dataset}?${params}`;
  }
</script>

<div class="exports" role="group" aria-label={$_('common.export')}>
  <a href={href('csv')} download>{$_('common.export_csv')}</a>
  <a href={href('xlsx')} download>{$_('common.export_xlsx')}</a>
</div>

<style>
  .exports { display:flex; gap:.35rem; }
  a { padding:.45rem .6rem; border:1px solid var(--community-border); border-radius:8px; background:var(--community-surface); color:var(--community-primary-strong); text-decoration:none; font-size:.57rem; font-weight:750; white-space:nowrap; }
  a:hover { background:var(--community-primary-soft); }
</style>
