/**
 * The way into `/data-sharing`, as an entry in the app's own notification area.
 *
 * The page has been complete for a while and nothing led to it. A member who
 * never happened to navigate there was a member who was never asked — and a
 * standing consent nobody revisits is what GDPR Art. 7(3) is suspicious of.
 *
 * Two prompts, not one, because they are addressed to different people:
 *
 * - **never asked** gets an invitation. There is nothing to review.
 * - **a stale decision** gets a reminder. Telling a first-timer to "review
 *   your settings" asks them to check something they have never set.
 *
 * Both facts are the backend's — `asked` and `review_due` on
 * `GET /api/data-sharing`. A member who decided in the onboarding form has been
 * asked (`presented_version`), so they get neither right after registering.
 *
 * **Shown in the notification area, never as a banner that pops up.** The app has
 * one place for things that want the member's attention — the bell, and
 * `/notifications` — and a second one at the foot of every page competed with it.
 * The prompt counts as one unread item on the bell and is the first entry on the
 * notifications page, where it can be opened or put off.
 *
 * **Loaded once per app load, deliberately not in `+layout.ts`.** That load re-runs
 * on every navigation, and this endpoint is not a plain read: onboarding
 * provisions a dataspace credential on it and reconciles the member's DID onto
 * their REC-registry row. One call per page view would mean a registry lookup
 * per page view.
 *
 * Failure is silence. A member who cannot be prompted is no worse off than
 * before this existed, and an error about a feature they did not ask for is
 * worse than nothing.
 */
import { writable } from 'svelte/store';
import { api } from './api';

export type DataSharingPrompt = 'invite' | 'review' | null;

/** `null` until the answer arrives, and whenever there is nothing to ask. */
export const dataSharingPrompt = writable<DataSharingPrompt>(null);

let loaded = false;

/** Ask the backend once whether the member should be prompted. */
export async function loadDataSharingPrompt(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const status = await api.dataSharing();
    // Nothing to decide is nothing to prompt about. A member whose community is
    // not in a dataspace must not be invited to manage a consent that does not
    // exist — the state field is what makes that distinguishable from "not
    // provisioned yet".
    if (status.state && status.state !== 'ok') return;
    if (status.asked === false) dataSharingPrompt.set('invite');
    else if (status.review_due) dataSharingPrompt.set('review');
  } catch {
    // Feature off, backend down, or no session. Prompting is optional.
    dataSharingPrompt.set(null);
  }
}

/** Record that the member saw the prompt, then clear it.
 *
 * `dataSharingSeen` writes `user_onboarding_views` under `data-sharing`, with the
 * offers that were on offer, so a later or changed offer brings the prompt back
 * and one already shown does not. A failed write means the member is asked again
 * later, which is the harmless direction. */
export async function acknowledgeDataSharingPrompt(): Promise<void> {
  try {
    await api.dataSharingSeen();
  } catch {
    // Asked once more than needed is the safe way to be wrong.
  }
  dataSharingPrompt.set(null);
}
