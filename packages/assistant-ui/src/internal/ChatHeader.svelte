<script lang="ts">
  import { Icon } from "@celine-eu/ui";

  interface Props {
    title?: string;
    showCitations?: boolean;
    enableHistory?: boolean;
    enableAttachments?: boolean;
    isAdmin?: boolean;
    onToggleHistory?: () => void;
    onToggleAttachments?: () => void;
    onToggleCitations?: (value: boolean) => void;
    onReindex?: () => void;
    onReload?: () => void;
    onClose?: () => void;
  }

  let {
    title = "Assistant",
    showCitations = $bindable(true),
    enableHistory = true,
    enableAttachments = true,
    isAdmin = false,
    onToggleHistory,
    onToggleAttachments,
    onToggleCitations,
    onReindex,
    onReload,
    onClose,
  }: Props = $props();

  function handleCitationsChange(e: Event) {
    const checked = (e.target as HTMLInputElement).checked;
    showCitations = checked;
    onToggleCitations?.(checked);
  }
</script>

<header class="chat-header">
  <div class="header-left">
    <div class="brand">
      <Icon name="bot" size={22} />
      <span class="brand-text">{title}</span>
    </div>
  </div>

  <div class="header-actions">
    {#if enableHistory}
      <button
        class="header-btn"
        onclick={onToggleHistory}
        title="History"
        aria-label="Show history"
      >
        <Icon name="history" size={18} />
      </button>
    {/if}

    {#if enableAttachments}
      <button
        class="header-btn"
        onclick={onToggleAttachments}
        title="Attachments"
        aria-label="Show attachments"
      >
        <Icon name="folder" size={18} />
      </button>
    {/if}

    <label class="citations-toggle" title="Show sources">
      <input
        type="checkbox"
        checked={showCitations}
        onchange={handleCitationsChange}
      />
      <span class="toggle-label">Sources</span>
    </label>

    {#if isAdmin}
      <div class="admin-actions">
        <button
          class="header-btn header-btn--admin"
          onclick={onReindex}
          title="Reindex documents"
        >
          <Icon name="refresh-cw" size={16} />
        </button>
        <button
          class="header-btn header-btn--admin"
          onclick={onReload}
          title="Reload"
        >
          <Icon name="download" size={16} />
        </button>
      </div>
    {/if}

    {#if onClose}
      <button
        class="header-btn header-btn--close"
        onclick={onClose}
        title="Close"
        aria-label="Close assistant"
      >
        <Icon name="x" size={20} />
      </button>
    {/if}
  </div>
</header>

<style>
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--celine-space-sm) var(--celine-space-md);
    background: var(--celine-bg-elevated);
    border-bottom: 1px solid var(--celine-border);
    gap: var(--celine-space-sm);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--celine-space-md);
    min-width: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    color: var(--celine-primary);
  }

  .brand-text {
    font-weight: 600;
    font-size: 1rem;
    color: var(--celine-text);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: var(--celine-radius-md);
    background: transparent;
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .header-btn:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .header-btn--close:hover {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  .admin-actions {
    display: flex;
    gap: 2px;
    padding-left: var(--celine-space-xs);
    border-left: 1px solid var(--celine-border);
    margin-left: var(--celine-space-xs);
  }

  .header-btn--admin {
    width: 32px;
    height: 32px;
  }

  .citations-toggle {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
    padding: 6px 10px;
    border-radius: var(--celine-radius-md);
    cursor: pointer;
    user-select: none;
    font-size: 0.8125rem;
    color: var(--celine-text-secondary);
    transition: all var(--celine-transition-fast);
  }

  .citations-toggle:hover {
    background: var(--celine-bg-hover);
  }

  .citations-toggle input {
    accent-color: var(--celine-primary);
  }

  .toggle-label {
    display: none;
  }

  @media (min-width: 480px) {
    .toggle-label {
      display: inline;
    }
  }
</style>
