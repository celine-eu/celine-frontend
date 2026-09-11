import { redirect } from '@sveltejs/kit';
import { waitLocale } from 'svelte-i18n';
import type { LayoutLoad } from './$types';
import { getMe } from '$lib/api';
import { setupI18n } from '$lib/i18n';
import { meStore } from '$lib/stores';

export const ssr = false;

export const load: LayoutLoad = async ({ url }) => {
  if (url.pathname === '/denied') {
    meStore.set(null);
    setupI18n(undefined);
    await waitLocale();
    return { me: null };
  }

  try {
    const me = await getMe();
    // Populate the store before Svelte mounts child pages. Their onMount
    // loaders consume it synchronously, so setting it later from a component
    // effect can leave a page in its initial loading state forever.
    meStore.set(me);
    setupI18n(me.locale);
    await waitLocale();
    return { me };
  } catch (error) {
    // 403 here means "signed in, and manages nothing" — a valid token that
    // grants nothing is not an authentication failure.
    if (error instanceof Error && error.message.includes('403')) {
      redirect(302, '/denied?reason=no-recs');
    }
    // 503 is the REC registry being down for a caller whose REC list has no
    // other source. Also not an authentication failure, and not permanent —
    // which is why it reaches the denied page with a reason of its own rather
    // than the same wording as a refusal.
    if (error instanceof Error && error.message.includes('503')) {
      redirect(302, '/denied?reason=registry');
    }
    if (error instanceof Error && error.message.includes('401')) {
      redirect(302, `/oauth2/sign_in?rd=${encodeURIComponent(window.location.href)}`);
    }

    // A BFF/downstream outage is not an authentication failure. Redirecting
    // every 5xx to sign-in creates a successful-login loop while the API is
    // unavailable; let SvelteKit render its error boundary instead.
    throw error;
  }
};
