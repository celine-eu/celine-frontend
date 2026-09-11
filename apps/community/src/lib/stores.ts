import { writable } from 'svelte/store';
import type { CommunityAccess, Me } from './api';

export const meStore = writable<Me | null>(null);

/**
 * The REC the current route is about, as `[community]/+layout.ts` resolved it.
 *
 * Separate from `meStore` because a caller may manage several: which one is on
 * screen is a property of the URL, not of the session. Pages read the key from
 * here rather than from the profile, so a reload, a bookmark and a shared link
 * all land on the REC they name.
 */
export const communityStore = writable<CommunityAccess | null>(null);
