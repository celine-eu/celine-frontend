import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ parent }) => {
  const { me } = await parent();
  if (!me) redirect(302, '/denied?reason=no-recs');

  // One REC is the common case and the only case for an organization-scoped
  // manager, so the picker is skipped rather than shown with a single row.
  // `redirect` from a load replaces the history entry, so Back does not bounce
  // off the picker straight back into the REC.
  if (me.communities.length === 1) redirect(302, `/${encodeURIComponent(me.communities[0].key)}`);

  return { communities: me.communities };
};
