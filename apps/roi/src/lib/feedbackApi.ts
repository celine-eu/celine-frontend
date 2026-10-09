import type { FeedbackContext, FeedbackScreenshot } from './feedback';

export type FeedbackSubmission = {
  rating: number;
  comment: string;
  communityKey?: string;
  context: FeedbackContext;
  screenshot?: FeedbackScreenshot | null;
};

/**
 * The feedback API answered `401`: the visitor has no SSO session, or it expired. The ROI is
 * public and never prompts for sign-in, so this is never answered with a redirect.
 */
export class FeedbackUnauthorizedError extends Error {
  constructor() {
    super('No session for feedback');
    this.name = 'FeedbackUnauthorizedError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.status === 401) throw new FeedbackUnauthorizedError();
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

/** The communities the signed-in visitor may give feedback to; `[]` for an anonymous visitor. */
export async function getFeedbackCommunities(): Promise<string[]> {
  try {
    const result = await request<{ communities: string[] }>('/api/v1/feedback/communities');
    return result.communities;
  } catch (error) {
    if (error instanceof FeedbackUnauthorizedError) return [];
    throw error;
  }
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
