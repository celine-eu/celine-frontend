<script lang="ts">
  import { Icon, Panel, Skeleton } from '@celine-eu/ui';
  import type { AssistantApi } from '../api.js';
  import type { AttachmentItem } from '../types.js';

  interface Props {
    open: boolean;
    api: AssistantApi;
    onClose: () => void;
  }

  let { open, api, onClose }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let items = $state<AttachmentItem[]>([]);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await api.listAttachments();
      items = res?.items ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.deleteAttachment(id);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function isImage(att: AttachmentItem): boolean {
    const ct = att.content_type ?? '';
    if (ct.startsWith('image/')) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(att.filename);
  }

  function formatDate(ts: number): string {
    try {
      return new Date(ts * 1000).toLocaleDateString([], { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  $effect(() => {
    if (open) {
      load();
    }
  });
</script>

<Panel {open} title="Attachments" onClose={onClose}>
  <div class="attachments-panel">
    {#if error}
      <div class="error-banner">
        <Icon name="alert-circle" size={16} />
        <span>{error}</span>
      </div>
    {/if}

    {#if loading}
      <div class="loading-grid">
        {#each [1, 2, 3, 4] as _}
          <Skeleton variant="rect" height="120px" />
        {/each}
      </div>
    {:else if items.length === 0}
      <div class="empty">
        <Icon name="folder" size={32} />
        <p>No attachments yet</p>
        <p class="hint">Files you upload will appear here</p>
      </div>
    {:else}
      <div class="attachment-grid">
        {#each items as a (a.id)}
          <div class="attachment-card">
            <div class="attachment-preview">
              {#if isImage(a)}
                <img src={api.attachmentRawUrl(a.id)} alt={a.filename} />
              {:else}
                <div class="file-icon">
                  <Icon name="file" size={32} />
                </div>
              {/if}
            </div>
            <div class="attachment-info">
              <div class="attachment-name" title={a.filename}>{a.filename}</div>
              <div class="attachment-meta">
                <span>{formatSize(a.size_bytes)}</span>
                <span>•</span>
                <span>{formatDate(a.created_at)}</span>
              </div>
            </div>
            <div class="attachment-actions">
              <a
                class="action-btn"
                href={api.attachmentRawUrl(a.id)}
                target="_blank"
                rel="noreferrer"
                title="Open"
              >
                <Icon name="external-link" size={16} />
              </a>
              <button
                class="action-btn action-btn--danger"
                onclick={() => handleDelete(a.id)}
                title="Delete"
              >
                <Icon name="trash-2" size={16} />
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</Panel>

<style>
  .attachments-panel {
    min-height: 200px;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    padding: var(--celine-space-sm);
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
    border-radius: var(--celine-radius-md);
    font-size: 0.875rem;
    margin-bottom: var(--celine-space-md);
  }

  .loading-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--celine-space-sm);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--celine-space-xl);
    color: var(--celine-text-tertiary);
    text-align: center;
  }

  .empty p {
    margin: var(--celine-space-xs) 0 0;
  }

  .empty .hint {
    font-size: 0.8125rem;
  }

  .attachment-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--celine-space-sm);
  }

  .attachment-card {
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    overflow: hidden;
    background: var(--celine-bg-elevated);
  }

  .attachment-preview {
    height: 100px;
    background: var(--celine-bg-sunken);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .attachment-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-icon {
    color: var(--celine-text-tertiary);
  }

  .attachment-info {
    padding: var(--celine-space-sm);
  }

  .attachment-name {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--celine-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .attachment-meta {
    display: flex;
    gap: var(--celine-space-xs);
    font-size: 0.6875rem;
    color: var(--celine-text-tertiary);
    margin-top: 2px;
  }

  .attachment-actions {
    display: flex;
    border-top: 1px solid var(--celine-border);
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--celine-space-xs);
    border: none;
    background: transparent;
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
    text-decoration: none;
  }

  .action-btn:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .action-btn--danger:hover {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  .action-btn + .action-btn {
    border-left: 1px solid var(--celine-border);
  }

  @media (max-width: 480px) {
    .attachment-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
