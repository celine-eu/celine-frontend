<script lang="ts">
  import { Icon } from '@celine-eu/ui';
  import type { Attachment } from '../types.js';

  interface Props {
    value: string;
    busy?: boolean;
    attachments?: Attachment[];
    enableUpload?: boolean;
    onAddFiles?: (files: FileList | null) => void;
    onRemoveAttachment?: (id: string) => void;
    onSend: () => Promise<void>;
  }

  let { 
    value = $bindable(''),
    busy = false,
    attachments = [],
    enableUpload = true,
    onAddFiles = () => {},
    onRemoveAttachment = () => {},
    onSend
  }: Props = $props();

  let fileEl: HTMLInputElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);

  export function focusInput() {
    inputEl?.focus();
  }

  function pickFiles() {
    fileEl?.click();
  }

  function handleFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    onAddFiles(input.files);
    input.value = '';
    focusInput();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    onSend();
  }

  // Auto-resize textarea
  function autoResize() {
    if (inputEl) {
      inputEl.style.height = 'auto';
      inputEl.style.height = Math.min(inputEl.scrollHeight, 150) + 'px';
    }
  }

  $effect(() => {
    value;
    autoResize();
  });
</script>

<footer class="composer">
  <input
    class="hidden"
    type="file"
    multiple
    bind:this={fileEl}
    onchange={handleFileChange}
  />

  {#if attachments.length}
    <div class="chips" aria-label="Attachments">
      {#each attachments as a (a.id)}
        <div class="chip" title={a.filename}>
          {#if a.previewUrl}
            <img class="chip-preview" src={a.previewUrl} alt="" />
          {:else}
            <Icon name="file" size={14} />
          {/if}
          <span class="chip-name">{a.filename}</span>
          <button
            type="button"
            class="chip-remove"
            onclick={() => onRemoveAttachment(a.id)}
            disabled={busy}
            aria-label="Remove {a.filename}"
            title="Remove"
          >
            <Icon name="x" size={14} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <form class="input-row" onsubmit={handleSubmit}>
    {#if enableUpload}
      <button
        type="button"
        class="btn-icon"
        onclick={pickFiles}
        disabled={busy}
        title="Attach files"
        aria-label="Attach files"
      >
        <Icon name="paperclip" size={20} />
      </button>
    {/if}

    <textarea
      class="input"
      bind:this={inputEl}
      bind:value
      placeholder="Type a message..."
      disabled={busy}
      aria-label="Message"
      rows="1"
      onkeydown={handleKeydown}
    ></textarea>

    <button
      type="submit"
      class="btn-send"
      disabled={busy || (!value.trim() && attachments.length === 0)}
      title="Send message"
      aria-label="Send message"
    >
      <Icon name="send" size={20} />
    </button>
  </form>
</footer>

<style>
  .composer {
    padding: var(--celine-space-md);
    border-top: 1px solid var(--celine-border);
    background: var(--celine-bg-elevated);
  }

  .hidden {
    display: none;
  }

  /* Attachment chips */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--celine-space-xs);
    margin-bottom: var(--celine-space-sm);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--celine-space-xs);
    max-width: 200px;
    border: 1px solid var(--celine-border);
    background: var(--celine-bg-sunken);
    border-radius: var(--celine-radius-full);
    padding: 4px 8px 4px 6px;
    font-size: 0.8125rem;
  }

  .chip-preview {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    object-fit: cover;
  }

  .chip-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--celine-text);
  }

  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--celine-text-tertiary);
    cursor: pointer;
    padding: 2px;
    border-radius: 50%;
    transition: all var(--celine-transition-fast);
  }

  .chip-remove:hover:not(:disabled) {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .chip-remove:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Input row */
  .input-row {
    display: flex;
    align-items: flex-end;
    gap: var(--celine-space-sm);
  }

  .input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-sm) var(--celine-space-md);
    background: var(--celine-bg);
    color: var(--celine-text);
    font-family: inherit;
    font-size: 0.9375rem;
    line-height: 1.4;
    resize: none;
    outline: none;
    max-height: 150px;
  }

  .input::placeholder {
    color: var(--celine-text-tertiary);
  }

  .input:focus {
    border-color: var(--celine-primary);
    box-shadow: 0 0 0 3px var(--celine-primary-light);
  }

  .input:disabled {
    background: var(--celine-bg-sunken);
    color: var(--celine-text-secondary);
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--celine-radius-md);
    background: transparent;
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .btn-icon:hover:not(:disabled) {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-send {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--celine-radius-md);
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .btn-send:hover:not(:disabled) {
    background: var(--celine-primary-hover);
  }

  .btn-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
