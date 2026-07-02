<script lang="ts">
  import { Icon } from '@celine-eu/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    toolName: string;
    status: 'running' | 'done' | 'error';
    progressMessages: string[];
    error: string | null;
  }

  let { toolName, status, progressMessages, error }: Props = $props();

  function humanize(name: string): string {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  let displayName = $derived(humanize(toolName));
  let latestMessage = $derived(
    progressMessages.length > 0 ? progressMessages[progressMessages.length - 1] : null
  );
</script>

<div class="tool-progress tool-progress--{status}" role="status">
  <div class="tool-indicator">
    {#if status === 'running'}
      <span class="spinner" aria-hidden="true"></span>
    {:else if status === 'done'}
      <Icon name="check-circle" size={16} />
    {:else}
      <Icon name="alert-circle" size={16} />
    {/if}
  </div>

  <div class="tool-info">
    <span class="tool-name">{displayName}</span>
    {#if status === 'running' && latestMessage}
      <span class="tool-message">{latestMessage}</span>
    {:else if status === 'error' && error}
      <span class="tool-error">{error}</span>
    {/if}
  </div>
</div>

<style>
  .tool-progress {
    display: inline-flex;
    align-items: center;
    gap: var(--celine-space-xs);
    padding: 4px var(--celine-space-sm);
    border-radius: var(--celine-radius-sm);
    font-size: 0.8125rem;
    line-height: 1.4;
    margin: var(--celine-space-xs) 0;
    max-width: 100%;
  }

  .tool-progress--running {
    background: var(--celine-info-bg);
    color: var(--celine-info-text);
  }

  .tool-progress--done {
    background: var(--celine-success-bg);
    color: var(--celine-success-text);
  }

  .tool-progress--error {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  .tool-indicator {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tool-info {
    display: flex;
    align-items: baseline;
    gap: var(--celine-space-xs);
    min-width: 0;
    overflow: hidden;
  }

  .tool-name {
    font-weight: 600;
    white-space: nowrap;
  }

  .tool-message {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    opacity: 0.85;
  }

  .tool-error {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Spinner animation */
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
