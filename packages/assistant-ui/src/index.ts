// @celine-eu/assistant-ui - AI Assistant chat components

// Main components
export { default as AskAssistantButton } from './AskAssistantButton.svelte';
export { default as AssistantProvider } from './AssistantProvider.svelte';
export { default as AssistantWidget } from './AssistantWidget.svelte';
export { default as ChatCore } from './ChatCore.svelte';

export { default as AttachmentsPanel } from "./internal/AttachmentsPanel.svelte";
export { default as HistoryPanel } from "./internal/HistoryPanel.svelte";

// API client
export { createAssistantApi } from './api.js';
export type { AssistantApi } from './api.js';

// Types
export type {
  AssistantContext, Attachment, AttachmentItem, ChatCoreProps, ChatRequest, ChatStreamEvent, Conversation, Message, SourceChunk, UserInfo
} from './types.js';

