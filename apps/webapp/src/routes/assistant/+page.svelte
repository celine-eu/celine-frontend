<script lang="ts">
  import { ChatCore } from "@celine-eu/assistant-ui";
  import { Button, Icon } from "@celine-eu/ui";

  let showHistory = $state(false);
  let showAttachments = $state(false);
  let chatCore: ChatCore | null = $state(null);

  function handleNewChat() {
    if (chatCore) {
      chatCore.startNewConversation?.();
    }
  }
</script>

<svelte:head>
  <title>Assistant - REC</title>
</svelte:head>

<section class="assistant-page">
  <header class="page-header">
    <div class="page-header__top">
      <h1 class="page-title">Assistant</h1>
      <p class="page-subtitle">Ask questions about your energy community</p>
    </div>

    <div class="toolbar">
      <div class="tab-group">
        <button
          class="tab"
          class:active={!showHistory && !showAttachments}
          on:click={() => {
            showHistory = false;
            showAttachments = false;
          }}
        >
          <Icon name="message-circle" size={16} />
          Chat
        </button>
        <button
          class="tab"
          class:active={showHistory}
          on:click={() => {
            showHistory = true;
            showAttachments = false;
          }}
        >
          <Icon name="history" size={16} />
          History
        </button>
        <button
          class="tab"
          class:active={showAttachments}
          on:click={() => {
            showAttachments = true;
            showHistory = false;
          }}
        >
          <Icon name="paperclip" size={16} />
          Files
        </button>
      </div>

      <Button variant="secondary" onclick={handleNewChat}>
        <Icon name="plus" size={16} />
        New chat
      </Button>
    </div>
  </header>

  <div class="chat-container">
    {#if showHistory}
      <div class="panel-view">
        <p class="panel-placeholder">
          <Icon name="history" size={32} />
          <span>Conversation history</span>
          <small>Coming soon</small>
        </p>
      </div>
    {:else if showAttachments}
      <div class="panel-view">
        <p class="panel-placeholder">
          <Icon name="paperclip" size={32} />
          <span>Your uploaded files</span>
          <small>Coming soon</small>
        </p>
      </div>
    {:else}
      <ChatCore
        bind:this={chatCore}
        apiBaseUrl="/api/assistant"
        mode="full"
        showHeader={false}
        enableHistory={false}
        enableAttachments={false}
        enableUpload={true}
      />
    {/if}
  </div>
</section>

<style>
  .assistant-page {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .page-header {
    flex-shrink: 0;
    margin-bottom: var(--celine-space-md);
  }

  .page-header__top {
    margin-bottom: var(--celine-space-md);
  }

  .page-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--celine-text);
    margin: 0 0 var(--celine-space-xs);
  }

  .page-subtitle {
    font-size: 0.9375rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--celine-space-md);
    flex-wrap: wrap;
  }

  .tab-group {
    display: flex;
    gap: var(--celine-space-xs);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
    padding: var(--celine-space-xs) var(--celine-space-md);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-full);
    background: var(--celine-bg-elevated);
    color: var(--celine-text-secondary);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .tab:hover {
    border-color: var(--celine-border-strong);
    color: var(--celine-text);
  }

  .tab.active {
    background: var(--celine-primary);
    border-color: var(--celine-primary);
    color: var(--celine-primary-text);
  }

  .chat-container {
    flex: 1;
    min-height: 0;
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .chat-container :global(.chat-core) {
    flex: 1;
    min-height: 0;
  }

  .panel-view {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .panel-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--celine-space-sm);
    color: var(--celine-text-tertiary);
    text-align: center;
    margin: 0;
  }

  .panel-placeholder span {
    font-weight: 500;
    color: var(--celine-text-secondary);
  }

  .panel-placeholder small {
    font-size: 0.8125rem;
  }
</style>
