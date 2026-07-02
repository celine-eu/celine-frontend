// @celine-eu/assistant-ui API client
// Configurable base URL for use in different contexts

import type {
  ChatRequest,
  ChatStreamEvent,
  UserInfo,
  Conversation,
  AttachmentItem,
  Message,
  SuggestionsResponse
} from './types.js';

function redirectToLogin(): never {
  window.location.href = `/oauth2/sign_in?rd=${encodeURIComponent(window.location.pathname)}`;
  throw new Error('Redirecting to login');
}

export function createAssistantApi(baseUrl: string = '/api') {
  const base = baseUrl.replace(/\/$/, '');

  async function uploadFile(file: File): Promise<{ uri?: string; attachment_id?: string }> {
    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch(`${base}/upload`, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });

    if (res.status === 401) redirectToLogin();
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok) {
      const err = ct.includes('json') ? JSON.stringify(await res.json()) : await res.text();
      throw new Error(err);
    }

    if (ct.includes('json')) return await res.json();
    return { };
  }

  async function* chatStream(payload: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const res = await fetch(`${base}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: payload.message,
        include_citations: payload.include_citations ?? true,
        top_k: payload.top_k ?? 5,
        conversation_id: payload.conversation_id ?? null,
        attachment_ids: payload.attachment_ids ?? [],
      }),
      credentials: 'include',
    });

    if (res.status === 401) redirectToLogin();
    if (!res.ok || !res.body) {
      const txt = await res.text();
      throw new Error(txt || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);

        const lines = chunk.split('\n');

        // Standard SSE: look for event: and data: lines
        let eventType: string | null = null;
        let dataStr: string | null = null;

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice('event: '.length).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice('data: '.length);
          }
        }

        if (dataStr == null) continue;

        if (eventType) {
          // New standard SSE format: event type from the event: line
          const data = JSON.parse(dataStr);
          yield { type: eventType, data } as ChatStreamEvent;
        } else {
          // Legacy format: data: {"type": "...", "data": ...}
          yield JSON.parse(dataStr) as ChatStreamEvent;
        }
      }
    }
  }

  async function getUser(): Promise<UserInfo | null> {
    const res = await fetch(`${base}/user`, { credentials: 'include' });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) return null;
    return res.json();
  }

  async function listConversations(): Promise<{ items: Conversation[] }> {
    const res = await fetch(`${base}/conversations`, { credentials: 'include' });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function deleteConversation(conversationId: string): Promise<void> {
    const res = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
  }

  async function fetchConversationMessages(conversationId: string): Promise<{ messages: Message[] }> {
    const res = await fetch(`${base}/conversations/${encodeURIComponent(conversationId)}/messages`, {
      credentials: 'include',
    });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function listAttachments(): Promise<{ items: AttachmentItem[] }> {
    const res = await fetch(`${base}/attachments`, { credentials: 'include' });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  function attachmentRawUrl(attachmentId: string): string {
    return `${base}/attachments/${encodeURIComponent(attachmentId)}/raw`;
  }

  async function deleteAttachment(attachmentId: string): Promise<void> {
    const res = await fetch(`${base}/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
  }

  async function getSuggestions(lang: string = 'en'): Promise<SuggestionsResponse> {
    const res = await fetch(`${base}/suggestions?lang=${encodeURIComponent(lang)}`, {
      credentials: 'include',
    });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) return { suggestions: [], tool_labels: {} };
    return res.json();
  }

  // Admin functions
  async function reindex(): Promise<void> {
    const res = await fetch(`${base}/admin/ingest`, { method: 'POST', credentials: 'include' });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
  }

  async function reload(): Promise<void> {
    const res = await fetch(`${base}/admin/reload`, { method: 'POST', credentials: 'include' });
    if (res.status === 401) redirectToLogin();
    if (!res.ok) throw new Error(await res.text());
  }

  return {
    uploadFile,
    chatStream,
    getUser,
    listConversations,
    deleteConversation,
    fetchConversationMessages,
    listAttachments,
    attachmentRawUrl,
    deleteAttachment,
    getSuggestions,
    reindex,
    reload,
  };
}

export type AssistantApi = ReturnType<typeof createAssistantApi>;
