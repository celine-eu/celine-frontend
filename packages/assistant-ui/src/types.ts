// @celine-eu/assistant-ui types

export interface SourceChunk {
  source: string;
  title?: string | null;
  text: string;
  score?: number | null;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType?: string | null;
  size: number;
  previewUrl?: string;
  uri?: string;
  attachmentId?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: SourceChunk[];
  attachments?: Attachment[];
}

export interface Conversation {
  conversation_id: string;
  message_count: number;
  last_message_at: number;
  last_snippet?: string;
}

export interface AttachmentItem {
  id: string;
  filename: string;
  content_type?: string;
  size_bytes: number;
  created_at: number;
  caption?: string;
}

export interface UserInfo {
  user_id: string;
  username?: string;
  email?: string;
  is_admin?: boolean;
}

export interface ChatStreamEvent {
  type: 'meta' | 'token' | 'sources' | 'error';
  data: any;
}

export interface ChatRequest {
  message: string;
  include_citations?: boolean;
  top_k?: number;
  conversation_id?: string | null;
  attachment_ids?: string[];
  context?: AssistantContext;
}

export interface AssistantContext {
  page?: string;
  section?: string;
  data?: Record<string, unknown>;
  hint?: string;
}

export interface ChatCoreProps {
  apiBaseUrl?: string;
  mode?: 'full' | 'modal' | 'floating';
  embedded?: boolean;
  showHeader?: boolean;
  enableHistory?: boolean;
  enableAttachments?: boolean;
  enableUpload?: boolean;
  enableCitations?: boolean;
  conversationId?: string | null;
  initialContext?: AssistantContext | null;
  initialPrompt?: string;
  onConversationChange?: (id: string | null) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onPanelsClose: (() => void) | undefined;
}
