<script lang="ts">
  import { Icon } from "@celine-eu/ui";
  import ChatCore from "./ChatCore.svelte";
  import type { AssistantContext } from "./types.js";

  interface Props {
    apiBaseUrl?: string;
    position?: "bottom-right" | "bottom-left";
    context?: AssistantContext | null;
  }

  let {
    apiBaseUrl = "/api",
    position = "bottom-right",
    context = null,
  }: Props = $props();

  let open = $state(false);
  let minimized = $state(false);
  let chatCore: ChatCore | null = $state(null);
  let currentContext = $state<AssistantContext | null>(context);
  let initialPrompt = $state("");

  export function openWith(
    opts: { context?: AssistantContext; prompt?: string } = {},
  ) {
    if (opts.context) {
      currentContext = opts.context;
    }
    if (opts.prompt) {
      initialPrompt = opts.prompt;
    }
    open = true;
    minimized = false;
  }

  function handleClose() {
    open = false;
    initialPrompt = "";
  }

  $effect(() => {
    currentContext = context;
    if (chatCore && context) {
      chatCore.setContext(context);
    }
  });
</script>

<!-- Floating Action Button -->
{#if !open}
  <button
    class="assistant-fab {position}"
    on:click={() => (open = true)}
    aria-label="Open Assistant"
  >
    <Icon name="bot" size={24} />
    <span class="fab-label">Ask Assistant</span>
  </button>
{/if}

<!-- Floating Chat Window -->
{#if open}
  <div class="assistant-window {position}" class:minimized>
    <header class="window-header">
      <div class="window-title">
        <Icon name="bot" size={18} />
        <span>Assistant</span>
      </div>
      <div class="window-controls">
        <button
          class="control-btn"
          on:click={() => (minimized = !minimized)}
          aria-label={minimized ? "Expand" : "Minimize"}
        >
          <Icon name={minimized ? "chevron-up" : "chevron-down"} size={16} />
        </button>
        <button
          class="control-btn control-btn--close"
          on:click={handleClose}
          aria-label="Close"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    </header>

    {#if !minimized}
      <div class="window-body">
        <ChatCore
          bind:this={chatCore}
          {apiBaseUrl}
          mode="floating"
          showHeader={false}
          enableHistory={true}
          enableAttachments={true}
          initialContext={currentContext}
          {initialPrompt}
        />
      </div>
    {/if}
  </div>
{/if}

<style>
  .assistant-fab {
    position: fixed;
    bottom: calc(var(--celine-space-lg) + env(safe-area-inset-bottom, 0px));
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    padding: var(--celine-space-sm) var(--celine-space-md);
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    border: none;
    border-radius: var(--celine-radius-full);
    box-shadow: var(--celine-shadow-lg);
    cursor: pointer;
    font-family: inherit;
    font-size: 0.9375rem;
    font-weight: 500;
    transition: all var(--celine-transition-fast);
    z-index: var(--celine-z-floating, 300);
  }

  .assistant-fab.bottom-right {
    right: var(--celine-space-lg);
  }

  .assistant-fab.bottom-left {
    left: var(--celine-space-lg);
  }

  .assistant-fab:hover {
    background: var(--celine-primary-hover);
    transform: translateY(-2px);
    box-shadow: var(--celine-shadow-xl);
  }

  .fab-label {
    display: none;
  }

  @media (min-width: 640px) {
    .fab-label {
      display: inline;
    }
  }

  /* Floating Window */
  .assistant-window {
    position: fixed;
    bottom: calc(var(--celine-space-lg) + env(safe-area-inset-bottom, 0px));
    width: 380px;
    max-width: calc(100vw - 2 * var(--celine-space-md));
    height: 500px;
    max-height: calc(100vh - 150px);
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-xl);
    box-shadow: var(--celine-shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: var(--celine-z-floating, 300);
    animation: slideUp 0.2s ease;
  }

  .assistant-window.bottom-right {
    right: var(--celine-space-lg);
  }

  .assistant-window.bottom-left {
    left: var(--celine-space-lg);
  }

  .assistant-window.minimized {
    height: auto;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .window-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--celine-space-sm) var(--celine-space-md);
    background: var(--celine-bg-elevated);
    border-bottom: 1px solid var(--celine-border);
    flex-shrink: 0;
  }

  .window-title {
    display: flex;
    align-items: center;
    gap: var(--celine-space-sm);
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--celine-text);
  }

  .window-title :global(.celine-icon) {
    color: var(--celine-primary);
  }

  .window-controls {
    display: flex;
    gap: 4px;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--celine-radius-sm);
    background: transparent;
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .control-btn:hover {
    background: var(--celine-bg-hover);
    color: var(--celine-text);
  }

  .control-btn--close:hover {
    background: var(--celine-danger-bg);
    color: var(--celine-danger-text);
  }

  .window-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  /* Mobile: full screen */
  @media (max-width: 480px) {
    .assistant-window {
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      width: 100%;
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
      border: none;
    }
  }
</style>
