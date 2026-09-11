import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';
import { communityStore } from '$lib/stores';

export const load: LayoutLoad = async ({ params, parent }) => {
  const { me } = await parent();
  const community = me?.communities.find((entry) => entry.key === params.community);

  // A REC that is not in the list is refused here rather than by the first API
  // call: the list already says what this caller may open, and a page that
  // renders seven loading panels before seven 403s tells them nothing.
  if (!community) {
    redirect(
      302,
      `/denied?reason=not-your-rec&rec=${encodeURIComponent(params.community)}`,
    );
  }

  communityStore.set(community);
  return { community };
};
