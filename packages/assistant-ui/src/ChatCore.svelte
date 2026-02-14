<script lang="ts">
  import { onMount, tick } from "svelte";
  import { createAssistantApi, type AssistantApi } from "./api.js";
  import type {
    AssistantContext,
    Attachment,
    ChatCoreProps,
    Message,
  } from "./types.js";

  import AttachmentsPanel from "./internal/AttachmentsPanel.svelte";
  import ChatHeader from "./internal/ChatHeader.svelte";
  import Composer from "./internal/Composer.svelte";
  import DropOverlay from "./internal/DropOverlay.svelte";
  import HistoryPanel from "./internal/HistoryPanel.svelte";
  import MessageList from "./internal/MessageList.svelte";

  let {
    apiBaseUrl = "/api",
    mode = "full",
    embedded = false,
    showHeader = true,
    enableHistory = true,
    enableAttachments = true,
    enableUpload = true,
    enableCitations = true,
    conversationId: initialConversationId = null,
    initialContext = null,
    initialPrompt = "",
    onConversationChange,
    onError,
    onClose,
    onPanelsClose,
  }: ChatCoreProps = $props();

  // API client
  const api: AssistantApi = createAssistantApi(apiBaseUrl);

  // State
  let conversationId = $state<string | null>(initialConversationId);
  let messages = $state<Message[]>([]);
  let input = $state(initialPrompt);
  let busy = $state(false);
  let errorBanner = $state<string | null>(null);
  let includeCitations = $state(enableCitations);
  let isAdmin = $state(false);
  let context = $state<AssistantContext | null>(initialContext);

  // Attachments
  let attachments = $state<Attachment[]>([]);
  const attachmentFiles = new Map<string, File>();

  // Drag & drop
  let dragging = $state(false);
  let dragDepth = 0;

  // Panels
  let historyPanelOpen = $state(false);
  let attachmentsPanelOpen = $state(false);

  // Component refs
  let messageList: InstanceType<typeof MessageList> | null = $state(null);
  let composer: InstanceType<typeof Composer> | null = $state(null);

  // Initialize
  onMount(async () => {
    try {
      const user = await api.getUser();
      isAdmin = Boolean(user?.is_admin);

      // Load existing conversation if provided
      if (initialConversationId) {
        const res = await api.fetchConversationMessages(initialConversationId);
        messages = (res?.messages ?? []).map((m: any) => ({
          role: m.role,
          content: m.content,
        }));
        await messageList?.scrollToBottom(true);
      }

      // Auto-send if initial prompt provided
      if (initialPrompt && !initialConversationId) {
        await send();
      }
    } catch (e) {
      handleError(e);
    }
  });

  function handleError(e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    errorBanner = error.message;
    onError?.(error);
  }

  // File handling
  function addFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const id = crypto.randomUUID();
      attachmentFiles.set(id, f);

      const a: Attachment = {
        id,
        filename: f.name,
        contentType: f.type || null,
        size: f.size,
      };

      if (
        a.contentType?.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.filename)
      ) {
        a.previewUrl = URL.createObjectURL(f);
      }

      attachments = [...attachments, a];
    }
  }

  function removeAttachment(id: string) {
    const a = attachments.find((x) => x.id === id);
    if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl);
    attachments = attachments.filter((x) => x.id !== id);
    attachmentFiles.delete(id);
  }

  async function uploadAllAttachments(
    local: Attachment[],
  ): Promise<Attachment[]> {
    const out: Attachment[] = [];
    for (const a of local) {
      const f = attachmentFiles.get(a.id);
      if (!f) continue;

      const res = await api.uploadFile(f);
      out.push({
        ...a,
        uri: res?.uri,
        attachmentId: res?.attachment_id,
      });
    }
    return out;
  }

  // Send message
  async function send() {
    const localText = input.trim();
    if (!localText && attachments.length === 0) return;
    if (busy) return;

    errorBanner = null;
    busy = true;
    input = "";

    const localAttachments = attachments;
    attachments = [];

    messages = [
      ...messages,
      {
        role: "user",
        content: localText,
        attachments: localAttachments.map(
          ({ id, filename, previewUrl, contentType, size }) => ({
            id,
            filename,
            previewUrl,
            contentType,
            size,
          }),
        ),
      },
      { role: "assistant", content: "" },
    ];

    // force scroll for the “user just sent” event
    await tick();
    await messageList?.scrollToBottom(true);

    const assistantIdx = messages.length - 1;

    try {
      const uploaded = await uploadAllAttachments(localAttachments);
      const attachmentIds = uploaded
        .map((a) => a.attachmentId)
        .filter((x): x is string => typeof x === "string" && x.length > 0);

      let acc = "";
      let pendingSources: any[] | undefined;

      for await (const evt of api.chatStream({
        message: localText,
        include_citations: includeCitations,
        top_k: 5,
        conversation_id: conversationId,
        attachment_ids: attachmentIds,
        context: context ?? undefined,
      })) {
        if (evt.type === "token") {
          const t =
            (evt as any).data?.token ??
            (evt as any).token ??
            (evt as any).data ??
            "";
          acc += String(t);
          messages[assistantIdx] = { ...messages[assistantIdx], content: acc };
          messages = messages;
          await messageList?.scrollToBottom();
          continue;
        }

        if (evt.type === "sources") {
          pendingSources =
            (evt as any).data?.sources ??
            (evt as any).sources ??
            (evt as any).data;
          continue;
        }

        if (evt.type === "meta") {
          const newId =
            (evt as any).data?.conversation_id ?? (evt as any).conversation_id;
          if (newId && newId !== conversationId) {
            conversationId = newId;
            onConversationChange?.(newId);
          }
          continue;
        }

        if (evt.type === "error") {
          const msg =
            (evt as any).data?.message ??
            (evt as any).message ??
            (evt as any).data ??
            "Unknown streaming error";
          throw new Error(String(msg));
        }
      }

      messages[assistantIdx] = {
        ...messages[assistantIdx],
        content: acc,
        sources: pendingSources,
        attachments: uploaded.length ? uploaded : undefined,
      };
      messages = messages;
      await messageList?.scrollToBottom(true);
    } catch (e) {
      handleError(e);
      messages = messages.filter((_, idx) => idx !== assistantIdx);
      await messageList?.scrollToBottom(true);
    } finally {
      for (const a of localAttachments) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
      attachmentFiles.clear();
      busy = false;
      await tick();
      composer?.focusInput();
      await messageList?.scrollToBottom(true);
    }
  }

  // Conversation management
  async function loadConversationInternal(id: string) {
    try {
      conversationId = id;
      const res = await api.fetchConversationMessages(id);
      messages = (res?.messages ?? []).map((m: any) => ({
        role: m.role,
        content: m.content,
      }));
      onConversationChange?.(id);
      await messageList?.scrollToBottom(true);
    } catch (e) {
      handleError(e);
    }
  }

  // Public method for external control (webapp tab UI)
  export async function loadConversation(id: string) {
    await loadConversationInternal(id);
  }

  export function startNewConversation() {
    conversationId = null;
    messages = [];
    context = null;
    onConversationChange?.(null);
    historyPanelOpen = false;
  }

  // Admin actions
  async function handleReindex() {
    errorBanner = null;
    try {
      await api.reindex();
    } catch (e) {
      handleError(e);
    }
  }

  async function handleReload() {
    errorBanner = null;
    try {
      await api.reload();
    } catch (e) {
      handleError(e);
    }
  }

  // Drag & drop
  function handleDragEnter(e: DragEvent) {
    if (!e.dataTransfer?.types.includes("Files")) return;
    dragDepth += 1;
    dragging = true;
  }

  function handleDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dragging = false;
  }

  function handleDrop(e: DragEvent) {
    dragDepth = 0;
    dragging = false;
    addFiles(e.dataTransfer?.files ?? null);
  }

  // Public methods for external control
  export function setContext(ctx: AssistantContext | null) {
    context = ctx;
  }

  export function setPrompt(prompt: string) {
    input = prompt;
  }

  export function focus() {
    composer?.focusInput();
  }

  export function openHistory() {
    historyPanelOpen = true;
    attachmentsPanelOpen = false;
  }

  export function openAttachments() {
    attachmentsPanelOpen = true;
    historyPanelOpen = false;
  }

  export function closePanels() {
    historyPanelOpen = false;
    attachmentsPanelOpen = false;
    onPanelsClose?.();
  }

  // Computed classes
  const containerClass = $derived(
    `chat-core chat-core--${mode}${embedded ? " chat-core--embedded" : ""}`,
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={containerClass}
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault();
    handleDrop(e);
  }}
>
  {#if showHeader}
    <ChatHeader
      title="Assistant"
      bind:showCitations={includeCitations}
      {enableHistory}
      {enableAttachments}
      {isAdmin}
      onToggleHistory={() => (historyPanelOpen = !historyPanelOpen)}
      onToggleAttachments={() => (attachmentsPanelOpen = !attachmentsPanelOpen)}
      onReindex={handleReindex}
      onReload={handleReload}
      {onClose}
    />
  {/if}

  {#if errorBanner}
    <div class="error-banner">
      {errorBanner}
      <button class="error-dismiss" onclick={() => (errorBanner = null)}
        >×</button
      >
    </div>
  {/if}

  <MessageList
    bind:this={messageList}
    {messages}
    showSources={includeCitations}
    assistantLoading={busy}
  />

  <Composer
    bind:this={composer}
    bind:value={input}
    {busy}
    {attachments}
    {enableUpload}
    onAddFiles={addFiles}
    onRemoveAttachment={removeAttachment}
    onSend={send}
  />

  <DropOverlay visible={dragging} />

  {#if enableHistory}
    <HistoryPanel
      open={historyPanelOpen}
      onClose={closePanels}
      {api}
      currentConversationId={conversationId}
      onSelectConversation={loadConversationInternal}
      onNewConversation={startNewConversation}
    />
  {/if}

  {#if enableAttachments}
    <AttachmentsPanel open={attachmentsPanelOpen} onClose={closePanels} {api} />
  {/if}
</div>

<style>
  .chat-core {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--celine-bg);
    overflow: hidden;
  }

  .chat-core--full {
    height: 100vh;
    height: 100dvh;
  }

  .chat-core--modal {
    height: 70vh;
    max-height: 600px;
    border-radius: var(--celine-radius-xl);
  }

  .chat-core--floating {
    height: 100%;
  }

  .chat-core--embedded {
    border-radius: var(--celine-radius-lg);
    border: 1px solid var(--celine-border);
  }

  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--celine-space-sm) var(--celine-space-md);
    background: var(--celine-warning-bg);
    color: var(--celine-warning-text);
    font-size: 0.875rem;
  }

  .error-dismiss {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: inherit;
    opacity: 0.7;
    line-height: 1;
    padding: 0 4px;
  }

  .error-dismiss:hover {
    opacity: 1;
  }
</style>
