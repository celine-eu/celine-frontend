<script lang="ts">
  import { tick } from 'svelte';
  import { Icon } from '@celine-eu/ui';
  import Markdown from './Markdown.svelte';
  import type { Message } from '../types.js';

  interface Props {
    messages: Message[];
    showSources?: boolean;
    assistantLoading?: boolean;
  }

  let { messages = [], showSources = true, assistantLoading = false }: Props = $props();

  let scroller: HTMLDivElement | null = $state(null);

  export async function scrollToBottom(force = false) {
    await tick();
    if (!scroller) return;
    if (force) {
      scroller.scrollTop = scroller.scrollHeight;
      return;
    }
    const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 200;
    if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
  }
</script>

<div class="message-list" bind:this={scroller}>
  {#if messages.length === 0 && !assistantLoading}
    <div class="empty-state">
      <div class="empty-icon">
        <Icon name="message-circle" size={48} strokeWidth={1.5} />
      </div>
      <p>Start a conversation</p>
    </div>
  {:else}
    {#each messages as m, idx (idx)}
      <div class="message message--{m.role}">
        <div class="bubble">
          {#if m.role === 'assistant' && assistantLoading && idx === messages.length - 1 && (!m.content || m.content.trim().length === 0)}
            <div class="typing" aria-label="Assistant is generating">
              <span class="dot"></span>
              <span class="dot"></span>
              <span class="dot"></span>
            </div>
          {:else if m.role === 'assistant'}
            <Markdown text={m.content} />
          {:else}
            <div class="content">{m.content}</div>
          {/if}

          {#if m.attachments && m.attachments.length}
            <div class="attachments">
              {#each m.attachments as a (a.id)}
                <div class="attachment-item">
                  {#if a.previewUrl}
                    <img class="attachment-thumb" src={a.previewUrl} alt={a.filename} />
                  {:else}
                    <div class="attachment-icon">
                      <Icon name="file" size={20} />
                    </div>
                  {/if}
                  <div class="attachment-meta">
                    <div class="attachment-name">{a.filename}</div>
                    <div class="attachment-size">{(a.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          {#if m.role === 'assistant' && showSources && m.sources && m.sources.length}
            <details class="sources">
              <summary>
                <Icon name="file" size={14} />
                <span>{m.sources.length} source{m.sources.length > 1 ? 's' : ''}</span>
              </summary>
              <ul>
                {#each m.sources as s (s.source + (s.title ?? ''))}
                  <li>
                    <div class="source-title">{s.title ?? s.source}</div>
                    <div class="source-text">
                      <Markdown text={s.text} />
                    </div>
                  </li>
                {/each}
              </ul>
            </details>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .message-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--celine-space-md);
    background: var(--celine-bg);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--celine-text-tertiary);
    text-align: center;
    padding: var(--celine-space-xl);
  }

  .empty-icon {
    opacity: 0.5;
    margin-bottom: var(--celine-space-md);
  }

  .empty-state p {
    margin: 0;
    font-size: 1rem;
  }

  .message {
    display: flex;
    margin: var(--celine-space-sm) 0;
  }

  .message--user {
    justify-content: flex-end;
  }

  .message--assistant {
    justify-content: flex-start;
  }

  .bubble {
    max-width: min(70ch, 85%);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-sm) var(--celine-space-md);
    background: var(--celine-bg-elevated);
  }

  .message--user .bubble {
    background: var(--celine-primary-light);
    border-color: transparent;
  }

  .content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  /* Typing indicator */
  .typing {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    height: 24px;
    padding: 4px 0;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--celine-text-tertiary);
    animation: bounce 1.2s infinite ease-in-out;
  }

  .dot:nth-child(2) { animation-delay: 0.15s; }
  .dot:nth-child(3) { animation-delay: 0.3s; }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: translateY(0);
      opacity: 0.5;
    }
    40% {
      transform: translateY(-6px);
      opacity: 1;
    }
  }

  /* Attachments */
  .attachments {
    margin-top: var(--celine-space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-xs);
  }

  .attachment-item {
    display: flex;
    gap: var(--celine-space-sm);
    align-items: center;
    border: 1px solid var(--celine-border);
    background: var(--celine-bg);
    border-radius: var(--celine-radius-md);
    padding: var(--celine-space-xs) var(--celine-space-sm);
  }

  .attachment-thumb {
    width: 40px;
    height: 40px;
    border-radius: var(--celine-radius-sm);
    object-fit: cover;
  }

  .attachment-icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--celine-bg-sunken);
    border-radius: var(--celine-radius-sm);
    color: var(--celine-text-secondary);
  }

  .attachment-name {
    font-size: 0.8125rem;
    word-break: break-all;
    color: var(--celine-text);
  }

  .attachment-size {
    font-size: 0.75rem;
    color: var(--celine-text-tertiary);
  }

  /* Sources */
  .sources {
    margin-top: var(--celine-space-sm);
    font-size: 0.8125rem;
    border-top: 1px solid var(--celine-border);
    padding-top: var(--celine-space-sm);
  }

  .sources summary {
    cursor: pointer;
    color: var(--celine-text-secondary);
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
    user-select: none;
  }

  .sources summary:hover {
    color: var(--celine-text);
  }

  .sources ul {
    margin: var(--celine-space-sm) 0 0;
    padding: 0;
    list-style: none;
  }

  .sources li {
    margin: var(--celine-space-sm) 0;
    padding: var(--celine-space-sm);
    background: var(--celine-bg-sunken);
    border-radius: var(--celine-radius-sm);
  }

  .source-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: var(--celine-text);
  }

  .source-text {
    color: var(--celine-text-secondary);
    font-size: 0.8125rem;
  }
</style>
