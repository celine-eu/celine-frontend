<script lang="ts">
  import { Icon, Panel, Skeleton } from "@celine-eu/ui";
  import type { AssistantApi } from "../api.js";
  import type { Conversation } from "../types.js";

  interface Props {
    open: boolean;
    api: AssistantApi;
    currentConversationId: string | null;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
    onClose: () => void;
  }

  let {
    open,
    api,
    currentConversationId,
    onSelectConversation,
    onNewConversation,
    onClose,
  }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let items = $state<Conversation[]>([]);

  async function load() {
    loading = true;
    error = null;
    try {
      const res = await api.listConversations();
      items = res?.items ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    try {
      await api.deleteConversation(id);
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  function formatDate(ts: number): string {
    try {
      const date = new Date(ts * 1000);
      const now = new Date();
      const diffDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 0) {
        return date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      } else if (diffDays === 1) {
        return "Yesterday";
      } else if (diffDays < 7) {
        return date.toLocaleDateString([], { weekday: "short" });
      } else {
        return date.toLocaleDateString([], { month: "short", day: "numeric" });
      }
    } catch {
      return "";
    }
  }

  $effect(() => {
    if (open) {
      load();
    }
  });
</script>

<Panel {open} title="History" {onClose}>
  <div class="history-panel">
    <button class="new-chat-btn" onclick={onNewConversation}>
      <Icon name="message-square" size={18} />
      <span>New conversation</span>
    </button>

    {#if error}
      <div class="error-banner">
        <Icon name="alert-circle" size={16} />
        <span>{error}</span>
      </div>
    {/if}

    {#if loading}
      <div class="loading">
        {#each [1, 2, 3] as _}
          <div class="conversation-skeleton">
            <Skeleton variant="text" width="60%" />
            <Skeleton variant="text" width="40%" />
          </div>
        {/each}
      </div>
    {:else if items.length === 0}
      <div class="empty">
        <Icon name="message-circle" size={32} />
        <p>No conversations yet</p>
      </div>
    {:else}
      <ul class="conversation-list">
        {#each items as c (c.conversation_id)}
          <li>
            <div class="conversation-item-wrapper">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="conversation-item"
                class:active={c.conversation_id === currentConversationId}
                onclick={() => {
                  onSelectConversation(c.conversation_id);
                  onClose();
                }}
              >
                <div class="conversation-header">
                  <span class="conversation-date"
                    >{formatDate(c.last_message_at)}</span
                  >
                  <span class="conversation-count">{c.message_count} msgs</span>
                </div>
                {#if c.last_snippet}
                  <div class="conversation-snippet">
                    {c.last_snippet.slice(0, 100)}
                  </div>
                {/if}
              </div>
              <button
                class="delete-btn"
                onclick={(e) => handleDelete(c.conversation_id, e)}
                title="Delete conversation"
                aria-label="Delete conversation"
              >
                <Icon name="trash-2" size={16} />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Panel>

<style>
  .history-panel {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-md);
  }

  .new-chat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--celine-space-sm);
    width: 100%;
    padding: var(--celine-space-sm) var(--celine-space-md);
    border: 1px dashed var(--celine-border);
    border-radius: var(--celine-radius-md);
    background: transparent;
    color: var(--celine-text-secondary);
    font: inherit;
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .new-chat-btn:hover {
    border-color: var(--celine-primary);
    color: var(--celine-primary);
    background: var(--celine-primary-light);
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
  }

  .loading {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-sm);
  }

  .conversation-skeleton {
    padding: var(--celine-space-md);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
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
    margin: var(--celine-space-sm) 0 0;
  }

  .conversation-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-xs);
  }

  .conversation-item-wrapper {
    position: relative;
    display: flex;
    align-items: stretch;
  }

  .conversation-item {
    position: relative;
    display: block;
    width: 100%;
    padding: var(--celine-space-sm) var(--celine-space-md);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    background: var(--celine-bg-elevated);
    text-align: left;
    font: inherit;
    cursor: pointer;
    transition: all var(--celine-transition-fast);
    flex: 1;
    padding-right: 48px; /* Space for delete button */
  }

  .conversation-item:hover {
    border-color: var(--celine-border-strong);
    background: var(--celine-bg-hover);
  }

  .conversation-item.active {
    border-color: var(--celine-primary);
    background: var(--celine-primary-light);
  }

  .conversation-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .conversation-date {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--celine-text-secondary);
  }

  .conversation-count {
    font-size: 0.6875rem;
    color: var(--celine-text-tertiary);
  }

  .conversation-snippet {
    font-size: 0.8125rem;
    color: var(--celine-text);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.4;
  }

  .delete-btn {
    position: absolute;
    top: 50%;
    right: var(--celine-space-sm);
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--celine-radius-sm);
    background: transparent;
    color: var(--celine-text-tertiary);
    cursor: pointer;
    opacity: 0;
    transition: all var(--celine-transition-fast);
  }

  .conversation-item-wrapper:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }
</style>
