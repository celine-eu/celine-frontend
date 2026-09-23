<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    feedbackScreenshotUrl,
    getFeedback,
    updateFeedbackStatus,
    type FeedbackItem,
    type FeedbackList,
    type FeedbackSource,
    type FeedbackState,
  } from '$lib/api';
  import { communityStore } from '$lib/stores';

  const pageSize = 20;
  let inbox = $state<FeedbackList | null>(null);
  let filter = $state<FeedbackState | ''>('');
  let source = $state<FeedbackSource>('user');
  let currentPage = $state(1);
  let loading = $state(true);
  let error = $state(false);
  let actionId = $state<string | null>(null);
  let screenshotPreview = $state<FeedbackItem | null>(null);

  async function load() {
    const community = $communityStore;
    if (!community) return;
    loading = true;
    error = false;
    try {
      inbox = await getFeedback(
        community.key,
        { status: filter, page: currentPage, pageSize },
        source,
      );
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  async function selectFilter(value: FeedbackState | '') {
    filter = value;
    currentPage = 1;
    await load();
  }

  async function selectSource(value: FeedbackSource) {
    source = value;
    filter = '';
    currentPage = 1;
    screenshotPreview = null;
    await load();
  }

  async function changePage(value: number) {
    currentPage = value;
    await load();
  }

  async function advance(item: FeedbackItem, status: 'seen' | 'resolved') {
    const community = $communityStore;
    if (!community) return;
    actionId = item.id;
    try {
      await updateFeedbackStatus(community.key, item.id, status, source);
      await load();
    } catch {
      error = true;
    } finally {
      actionId = null;
    }
  }

  function formatDate(value?: string): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }

  function totalPages(): number {
    return Math.max(1, Math.ceil((inbox?.total ?? 0) / pageSize));
  }

  function dimensions(width?: number, height?: number): string {
    return width != null && height != null ? `${width} × ${height}` : '—';
  }

  function closeScreenshot(): void {
    screenshotPreview = null;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeScreenshot();
  }

  onMount(() => void load());
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head><title>{$_('feedback_inbox.title')} · {$_('app.title')}</title></svelte:head>

<div class="page-wrap">
  <header class="page-heading">
    <div>
      <span>{$_('feedback_inbox.eyebrow')}</span>
      <h1>{$_('feedback_inbox.title')}</h1>
      <p>{$_('feedback_inbox.subtitle')}</p>
    </div>
    {#if inbox}
      <div class="total"><strong>{inbox.counts.new}</strong><small>{$_('feedback_inbox.to_review')}</small></div>
    {/if}
  </header>

  <section class="source-switch" aria-label={$_('feedback_inbox.source_filter')}>
    <button class:active={source === 'user'} aria-pressed={source === 'user'} onclick={() => void selectSource('user')}>
      <strong>{$_('feedback_source.user')}</strong>
      <small>{$_('feedback_source.user_help')}</small>
    </button>
    <button class:active={source === 'manager'} aria-pressed={source === 'manager'} onclick={() => void selectSource('manager')}>
      <strong>{$_('feedback_source.manager')}</strong>
      <small>{$_('feedback_source.manager_help')}</small>
    </button>
    <button class:active={source === 'roi'} aria-pressed={source === 'roi'} onclick={() => void selectSource('roi')}>
      <strong>{$_('feedback_source.roi')}</strong>
      <small>{$_('feedback_source.roi_help')}</small>
    </button>
  </section>

  <section class="summary" aria-label={$_('feedback_inbox.filter')}>
    <button class:active={filter === ''} aria-pressed={filter === ''} onclick={() => void selectFilter('')}>
      <span>{$_('feedback_inbox.all')}</span><strong>{inbox ? inbox.counts.new + inbox.counts.seen + inbox.counts.resolved : '—'}</strong>
    </button>
    <button class:active={filter === 'new'} aria-pressed={filter === 'new'} onclick={() => void selectFilter('new')}>
      <span>{$_('feedback_state.new')}</span><strong>{inbox?.counts.new ?? '—'}</strong>
    </button>
    <button class:active={filter === 'seen'} aria-pressed={filter === 'seen'} onclick={() => void selectFilter('seen')}>
      <span>{$_('feedback_state.seen')}</span><strong>{inbox?.counts.seen ?? '—'}</strong>
    </button>
    <button class:active={filter === 'resolved'} aria-pressed={filter === 'resolved'} onclick={() => void selectFilter('resolved')}>
      <span>{$_('feedback_state.resolved')}</span><strong>{inbox?.counts.resolved ?? '—'}</strong>
    </button>
  </section>

  <section class="panel">
    {#if loading}
      <div class="state-view"><div class="spinner"></div><p>{$_('common.loading')}</p></div>
    {:else if error}
      <div class="state-view error"><strong>!</strong><p>{$_('feedback_inbox.error')}</p><button onclick={() => void load()}>{$_('error.retry')}</button></div>
    {:else if !inbox || inbox.items.length === 0}
      <div class="state-view"><strong>✓</strong><p>{$_('feedback_inbox.empty')}</p></div>
    {:else}
      <div class="feedback-list">
        {#each inbox.items as item (item.id)}
          <article class:unread={item.status === 'new'}>
            <div class="card-topline">
              <span class={`status ${item.status}`}>{$_(`feedback_state.${item.status}`)}</span>
              <span class="date">{formatDate(item.createdAt)}</span>
            </div>
            <div class="rating" aria-label={`${$_('feedback_inbox.rating')}: ${item.rating} / 5`}>
              {#if item.rating > 0}
                {#each Array(5) as _, index}<span class:filled={index < item.rating}>★</span>{/each}
              {:else}
                <span class="no-rating">{$_('feedback_inbox.no_rating')}</span>
              {/if}
            </div>
            <p class:empty={!item.comment}>{item.comment || $_('feedback_inbox.no_comment')}</p>

            <div class="origin">
              <span>{$_('feedback_inbox.page')}</span>
              {#if item.pagePath}<a href={item.pagePath}>{item.pageTitle || item.pagePath}</a>{:else}<strong>{item.pageTitle || item.pageUrl}</strong>{/if}
            </div>

            {#if item.hasScreenshot && $communityStore}
              <button class="screenshot-preview" type="button" onclick={() => (screenshotPreview = item)}>
                <img
                  src={feedbackScreenshotUrl($communityStore.key, item.id, source)}
                  alt={`${$_('feedback_inbox.screenshot_alt')}: ${item.pageTitle || item.pagePath || ''}`}
                  loading="lazy"
                />
                <span>{$_('feedback_inbox.enlarge_screenshot')}</span>
              </button>
            {:else}
              <div class="screenshot-missing">
                <span aria-hidden="true">▧</span>
                <div>
                  <strong>{$_('feedback_inbox.no_screenshot')}</strong>
                  <small>{$_('feedback_inbox.no_screenshot_help')}</small>
                </div>
              </div>
            {/if}

            <details>
              <summary>{$_('feedback_inbox.technical_context')}</summary>
              <dl>
                <div><dt>{$_('feedback_inbox.viewport')}</dt><dd>{dimensions(item.viewportWidth, item.viewportHeight)}</dd></div>
                <div><dt>{$_('feedback_inbox.screen')}</dt><dd>{dimensions(item.screenWidth, item.screenHeight)}</dd></div>
                <div><dt>{$_('feedback_inbox.locale')}</dt><dd>{item.locale || '—'}</dd></div>
                <div><dt>{$_('feedback_inbox.timezone')}</dt><dd>{item.timezone || '—'}</dd></div>
                <div><dt>{$_('feedback_inbox.theme')}</dt><dd>{item.colorScheme || '—'}</dd></div>
                <div><dt>{$_('feedback_inbox.client_time')}</dt><dd>{formatDate(item.clientTimestamp)}</dd></div>
              </dl>
            </details>

            <div class="card-footer">
              <div class="history">
                {#if item.resolvedAt}<small>{$_('feedback_inbox.resolved_on')} {formatDate(item.resolvedAt)}</small>
                {:else if item.seenAt}<small>{$_('feedback_inbox.seen_on')} {formatDate(item.seenAt)}</small>{/if}
              </div>
              <div class="actions">
                {#if item.status === 'new'}
                  <button class="secondary" disabled={actionId === item.id} onclick={() => void advance(item, 'seen')}>{$_('feedback_inbox.mark_seen')}</button>
                {/if}
                {#if item.status !== 'resolved'}
                  <button disabled={actionId === item.id} onclick={() => void advance(item, 'resolved')}>{$_('feedback_inbox.mark_resolved')}</button>
                {/if}
              </div>
            </div>
          </article>
        {/each}
      </div>

      {#if totalPages() > 1}
        <nav class="pagination" aria-label={$_('feedback_inbox.pagination')}>
          <button disabled={inbox.page <= 1} onclick={() => void changePage(currentPage - 1)}>{$_('feedback_inbox.previous')}</button>
          <span>{$_('feedback_inbox.page_number')} {inbox.page} / {totalPages()}</span>
          <button disabled={inbox.page >= totalPages()} onclick={() => void changePage(currentPage + 1)}>{$_('feedback_inbox.next')}</button>
        </nav>
      {/if}
    {/if}
  </section>

  {#if screenshotPreview && $communityStore}
    <div class="preview-layer">
      <button class="preview-backdrop" type="button" aria-label={$_('feedback_inbox.close_screenshot')} onclick={closeScreenshot}></button>
      <div class="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="screenshot-preview-title">
        <header>
          <div>
            <span>{$_('feedback_inbox.screenshot')}</span>
            <h2 id="screenshot-preview-title">{screenshotPreview.pageTitle || screenshotPreview.pagePath || $_('feedback_inbox.screenshot')}</h2>
          </div>
          <button type="button" aria-label={$_('feedback_inbox.close_screenshot')} onclick={closeScreenshot}>×</button>
        </header>
        <div class="preview-image-wrap">
          <img
            src={feedbackScreenshotUrl($communityStore.key, screenshotPreview.id, source)}
            alt={`${$_('feedback_inbox.screenshot_alt')}: ${screenshotPreview.pageTitle || screenshotPreview.pagePath || ''}`}
          />
        </div>
        <footer>
          <a href={feedbackScreenshotUrl($communityStore.key, screenshotPreview.id, source)} target="_blank" rel="noreferrer">{$_('feedback_inbox.open_original')}</a>
        </footer>
      </div>
    </div>
  {/if}

  <p class="audit-notice">{$_('feedback_inbox.audit_notice')}</p>
</div>

<style>
  .page-wrap{max-width:1280px;margin:0 auto;padding:1.6rem 2rem 3rem}.page-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:1rem;margin-bottom:1rem}.page-heading>div>span{color:var(--community-primary);font-size:.72rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}h1{margin:.3rem 0;font-size:clamp(1.7rem,3vw,2.35rem)}.page-heading p{max-width:720px;margin:0;color:var(--community-muted);font-size:.88rem;line-height:1.5}.total{text-align:right}.total strong,.total small{display:block}.total strong{font-size:1.65rem}.total small{color:var(--community-muted);font-size:.68rem}
  .source-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem;margin-bottom:.75rem}.source-switch button{display:flex;flex-direction:column;align-items:flex-start;gap:.25rem;min-height:68px;padding:.85rem 1rem;border:1px solid var(--community-border);border-radius:13px;background:var(--community-surface);color:var(--community-muted);cursor:pointer;text-align:left;box-shadow:var(--community-shadow)}.source-switch button:hover,.source-switch button.active{border-color:var(--community-primary);background:var(--community-primary-soft);color:var(--community-primary-strong)}.source-switch strong{font-size:.85rem}.source-switch small{font-size:.68rem;line-height:1.4}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1rem}.summary button{display:flex;align-items:center;justify-content:space-between;min-height:64px;padding:.8rem 1rem;border:1px solid var(--community-border);border-radius:13px;background:var(--community-surface);color:var(--community-muted);cursor:pointer;box-shadow:var(--community-shadow)}.summary button:hover,.summary button.active{border-color:var(--community-primary);background:var(--community-primary-soft);color:var(--community-primary-strong)}.summary span{font-size:.78rem;font-weight:700}.summary strong{font-size:1.25rem}
  .panel{overflow:hidden;border:1px solid var(--community-border);border-radius:15px;background:var(--community-surface);box-shadow:var(--community-shadow)}.feedback-list{display:grid;gap:.8rem;padding:1rem}.feedback-list article{position:relative;padding:1rem 1.1rem;border:1px solid var(--community-border);border-radius:13px;background:var(--community-surface)}.feedback-list article.unread{border-left:4px solid var(--community-primary);background:var(--community-primary-soft)}.card-topline{display:flex;align-items:center;justify-content:space-between;gap:.7rem}.status{padding:.28rem .55rem;border-radius:999px;font-size:.65rem;font-weight:800}.status.new{background:var(--community-primary-soft);color:var(--community-primary-strong)}.status.seen{background:var(--community-warning-soft);color:var(--community-warning)}.status.resolved{background:var(--community-surface-soft);color:var(--community-muted)}.date{color:var(--community-muted);font-size:.72rem}.rating{display:flex;gap:.08rem;margin:.75rem 0 .45rem;color:var(--community-border);font-size:1rem}.rating span.filled{color:#f59e0b}.rating .no-rating{color:var(--community-muted);font-size:.72rem}.feedback-list article>p{margin:.25rem 0 .8rem;font-size:.88rem;line-height:1.55;white-space:pre-wrap}.feedback-list article>p.empty{color:var(--community-muted);font-style:italic}.origin{display:flex;align-items:baseline;gap:.45rem;color:var(--community-muted);font-size:.72rem}.origin span{font-weight:700}.origin a,.origin strong{color:var(--community-primary-strong);font-weight:700;text-decoration:none}.origin a:hover{text-decoration:underline}
  .screenshot-preview{position:relative;display:block;width:min(100%,560px);height:230px;margin-top:.9rem;padding:0;overflow:hidden;border:1px solid var(--community-border);border-radius:11px;background:var(--community-surface-soft);cursor:zoom-in}.screenshot-preview img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}.screenshot-preview span{position:absolute;right:.65rem;bottom:.65rem;padding:.4rem .6rem;border-radius:7px;background:rgba(15,23,42,.82);color:#fff;font-size:.68rem;font-weight:750}.screenshot-missing{display:flex;align-items:center;gap:.65rem;width:min(100%,560px);margin-top:.9rem;padding:.7rem .8rem;border:1px dashed var(--community-border);border-radius:10px;background:var(--community-surface-soft);color:var(--community-muted)}.screenshot-missing>span{font-size:1.25rem}.screenshot-missing strong,.screenshot-missing small{display:block}.screenshot-missing strong{font-size:.72rem}.screenshot-missing small{margin-top:.18rem;font-size:.63rem;line-height:1.4}
  details{margin-top:.8rem;border-top:1px solid var(--community-border);padding-top:.7rem}summary{width:max-content;color:var(--community-muted);font-size:.72rem;font-weight:700;cursor:pointer}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:.65rem;margin:.75rem 0 0}dl div{padding:.55rem .65rem;border-radius:9px;background:var(--community-surface-soft)}dt{color:var(--community-muted);font-size:.63rem;font-weight:700}dd{margin:.2rem 0 0;font-size:.74rem;font-weight:700}
  .card-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:.8rem;margin-top:.9rem}.history small{color:var(--community-muted);font-size:.65rem}.actions{display:flex;justify-content:flex-end;gap:.45rem;flex-wrap:wrap}.actions button{display:inline-flex;align-items:center;min-height:36px;padding:.45rem .7rem;border:0;border-radius:8px;background:var(--community-primary);color:#fff;font-size:.68rem;font-weight:750;cursor:pointer}.actions .secondary{background:var(--community-primary-soft);color:var(--community-primary-strong)}.actions button:disabled{opacity:.45;cursor:default}
  .preview-layer{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:1.2rem}.preview-backdrop{position:absolute;inset:0;width:100%;height:100%;border:0;background:rgba(9,18,16,.78);backdrop-filter:blur(4px);cursor:zoom-out}.preview-dialog{position:relative;z-index:1;display:flex;width:min(96vw,1200px);max-height:94dvh;overflow:hidden;border:1px solid var(--community-border);border-radius:15px;background:var(--community-surface);box-shadow:0 24px 70px rgba(0,0,0,.32);flex-direction:column}.preview-dialog header{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.8rem 1rem;border-bottom:1px solid var(--community-border)}.preview-dialog header span{color:var(--community-muted);font-size:.62rem;font-weight:750;text-transform:uppercase}.preview-dialog h2{margin:.16rem 0 0;font-size:.9rem}.preview-dialog header button{width:36px;height:36px;border:0;border-radius:9px;background:var(--community-surface-soft);color:var(--community-text);font-size:1.25rem;cursor:pointer}.preview-image-wrap{min-height:0;overflow:auto;padding:1rem;background:var(--community-bg)}.preview-image-wrap img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:8px;box-shadow:var(--community-shadow)}.preview-dialog footer{display:flex;justify-content:flex-end;padding:.7rem 1rem;border-top:1px solid var(--community-border)}.preview-dialog footer a{padding:.45rem .7rem;border-radius:8px;background:var(--community-primary-soft);color:var(--community-primary-strong);font-size:.68rem;font-weight:750;text-decoration:none}
  .pagination{display:flex;align-items:center;justify-content:center;gap:.8rem;padding:0 1rem 1rem}.pagination button{min-height:34px;padding:.35rem .7rem;border:1px solid var(--community-border);border-radius:8px;background:var(--community-surface);color:var(--community-text);cursor:pointer}.pagination button:disabled{opacity:.4;cursor:default}.pagination span{color:var(--community-muted);font-size:.72rem}.state-view{min-height:340px;display:grid;place-content:center;justify-items:center;gap:.6rem;color:var(--community-muted)}.state-view p{margin:0}.state-view button{height:38px;padding:0 .9rem;border:0;border-radius:9px;background:var(--community-primary);color:#fff;font-weight:700;cursor:pointer}.state-view.error strong{color:var(--community-danger);font-size:1.5rem}.spinner{width:25px;height:25px;border:3px solid var(--community-border);border-top-color:var(--community-primary);border-radius:50%;animation:spin .8s linear infinite}.audit-notice{margin:.7rem .2rem;color:var(--community-muted);font-size:.68rem;text-align:right}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:800px){.page-wrap{padding:1.1rem .8rem 5rem}.page-heading{align-items:flex-start;flex-direction:column}.total{text-align:left}.summary{grid-template-columns:1fr 1fr}.card-footer{align-items:stretch;flex-direction:column}.actions{justify-content:flex-start}dl{grid-template-columns:1fr 1fr}.screenshot-preview{height:190px}}@media(max-width:480px){.source-switch,.summary{grid-template-columns:1fr}.feedback-list{padding:.65rem}.feedback-list article{padding:.9rem}.card-topline{align-items:flex-start;flex-direction:column}.actions button{flex:1;justify-content:center}dl{grid-template-columns:1fr}.screenshot-preview{height:150px}.preview-layer{padding:.45rem}.preview-dialog{max-height:97dvh}.preview-image-wrap{padding:.45rem}}
</style>
