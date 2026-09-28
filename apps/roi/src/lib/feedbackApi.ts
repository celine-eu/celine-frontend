import type { FeedbackContext, FeedbackScreenshot } from './feedback';

export type FeedbackSubmission = {
  rating: number;
  comment: string;
  communityKey?: string;
  context: FeedbackContext;
  screenshot?: FeedbackScreenshot | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) {
    window.location.assign(`/oauth2/start?rd=${encodeURIComponent(window.location.href)}`);
    throw new Error('Authentication required');
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // Keep the status fallback for non-JSON proxy errors.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export async function getFeedbackCommunities(): Promise<string[]> {
  const result = await request<{ communities: string[] }>('/api/v1/feedback/communities');
  return result.communities;
}

export async function submitFeedback(payload: FeedbackSubmission): Promise<unknown> {
  if (!payload.communityKey) throw new Error('Select a community');
  return request('/api/v1/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      community_key: payload.communityKey,
      rating: payload.rating,
      comment: payload.comment,
      context: payload.context,
      screenshot: payload.screenshot ?? null,
    }),
  });
}
