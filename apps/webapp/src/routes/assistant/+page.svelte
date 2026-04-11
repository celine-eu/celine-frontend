<script lang="ts">
  import { page } from "$app/state";
  import {
    api,
    type Co2LocaleSettings,
    type CommitmentHistoryResponse,
    type ForecastResponse,
    type Overview,
    type SuggestionItem,
    type WeatherResponse,
  } from "$lib/api";
  import { ChatCore } from "@celine-eu/assistant-ui";
  import { Icon } from "@celine-eu/ui";
  import { onMount } from "svelte";

  let showHistory = $state(false);
  let showAttachments = $state(false);
  let chatCore: ChatCore | null = $state(null);
  let hasConversation = $state(false);
  let contextReady = $state(false);
  let resolvedInitialContext = $state<Record<string, unknown> | null>(null);
  const conversationId = $derived(page.url.searchParams.get("conversation_id"));
  const initialPrompt = $derived(page.url.searchParams.get("prompt") ?? "");
  const urlContext = $derived.by(() => {
    const pageName = page.url.searchParams.get("page");
    const section = page.url.searchParams.get("section");
    if (!pageName && !section) return null;
    return {
      page: pageName ?? undefined,
      section: section ?? undefined,
    };
  });

  function buildOverviewContextData(
    overview: Overview,
    weather: WeatherResponse | null,
    co2Settings: Co2LocaleSettings | null,
  ) {
    const data: Record<string, unknown> = {
      overview,
    };

    if (weather) {
      data.weather = weather;
    }

    if (
      co2Settings &&
      overview.rec.production_kwh != null &&
      overview.rec.production_kwh > 0
    ) {
      const co2Kg = overview.rec.production_kwh * co2Settings.kg_per_kwh;
      const trees =
        Math.round((co2Kg / 1000) * co2Settings.trees_per_ton * 10) / 10;
      data.co2 = {
        kg: co2Kg,
        trees,
        settings: co2Settings,
      };
    }

    return data;
  }

  function buildSuggestionsContextData(
    forecast: ForecastResponse | null,
    suggestions: SuggestionItem[] | null,
    history: CommitmentHistoryResponse | null,
  ) {
    const data: Record<string, unknown> = {};

    if (forecast) {
      data.forecast = forecast;
    }

    if (suggestions) {
      data.suggestions = suggestions;
    }

    if (history) {
      data.history = history;
    }

    return data;
  }

  onMount(async () => {
    if (!urlContext?.page) {
      resolvedInitialContext = urlContext;
      contextReady = true;
      return;
    }

    try {
      if (urlContext.page === "overview") {
        const [overview, weather, co2Settings] = await Promise.all([
          api.overview(),
          api.weather().catch(() => null),
          api.co2Settings().then((res) => res.current).catch(() => null),
        ]);

        resolvedInitialContext = {
          ...urlContext,
          data: buildOverviewContextData(overview, weather, co2Settings),
        };
        return;
      }

      if (urlContext.page === "suggestions") {
        const [forecast, suggestions, history] = await Promise.all([
          api.forecast().catch(() => null),
          api.suggestions().catch(() => null),
          api.gamificationHistory().catch(() => null),
        ]);

        resolvedInitialContext = {
          ...urlContext,
          data: buildSuggestionsContextData(forecast, suggestions, history),
        };
        return;
      }

      resolvedInitialContext = urlContext;
    } catch {
      resolvedInitialContext = urlContext;
    } finally {
      contextReady = true;
    }
  });

  function closePanels() {
    showHistory = false;
    showAttachments = false;
    chatCore?.closePanels?.();
  }

  function handleNewChat() {
    if (chatCore) {
      chatCore.startNewConversation?.();
    }
    closePanels();
  }

  function handleConversationChange(id: string | null) {
    hasConversation = id !== null;

    const url = new URL(window.location.href);
    if (id) {
      url.searchParams.set("conversation_id", id);
      url.searchParams.delete("prompt");
      url.searchParams.delete("page");
      url.searchParams.delete("section");
    } else {
      url.searchParams.delete("conversation_id");
    }
    window.history.replaceState({}, "", url);
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
          class:active={showHistory}
          onclick={() => {
            showHistory = true;
            showAttachments = false;
            chatCore?.openHistory?.();
          }}
        >
          <Icon name="history" size={16} />
          History
        </button>
        <button
          class="tab"
          class:active={showAttachments}
          onclick={() => {
            showAttachments = true;
            showHistory = false;
            chatCore?.openAttachments?.();
          }}
        >
          <Icon name="paperclip" size={16} />
          Files
        </button>
      </div>

      {#if hasConversation}
        <button class="tab new-chat" onclick={handleNewChat}>
          <Icon name="bot" size={16} />
          New chat
        </button>
      {/if}
    </div>
  </header>

  <div class="chat-container">
    {#if contextReady}
      <ChatCore
        bind:this={chatCore}
        apiBaseUrl="/api/assistant"
        mode="full"
        showHeader={false}
        enableHistory={true}
        enableAttachments={true}
        enableUpload={true}
        {conversationId}
        {initialPrompt}
        initialContext={resolvedInitialContext}
        onConversationChange={handleConversationChange}
        onPanelsClose={() => {
          showHistory = false;
          showAttachments = false;
        }}
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

  .new-chat {
    margin-left: var(--celine-space-sm);
    font-weight: 600;
  }

  .new-chat:hover {
    background: var(--celine-primary-bg);
    color: var(--celine-primary);
    border-color: var(--celine-primary);
  }
</style>
