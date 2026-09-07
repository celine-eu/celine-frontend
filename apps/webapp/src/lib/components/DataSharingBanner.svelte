<script lang="ts">
  /**
   * The way into `/data-sharing`.
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
   * `GET /api/data-sharing`. Being *asked* is per-user state about this app's own
   * UI, which is why it lives there and not in onboarding, which holds no session
   * with the member.
   *
   * **Fetched once on mount, deliberately not in `+layout.ts`.** That load re-runs
   * on every navigation, and this endpoint is not a plain read: onboarding
   * provisions a dataspace credential on it and reconciles the member's DID onto
   * their REC-registry row. One call per page view would mean a registry lookup
   * per page view. This component is mounted by the layout, which survives
   * client-side navigation, so mounting once is once per app load.
   *
   * Failure is silence. A member who cannot be prompted is no worse off than
   * before this existed, and an error banner about a feature they did not ask for
   * is worse than nothing.
   */
  import { api } from "$lib/api";
  import { Button, Icon } from "@celine-eu/ui";
  import { onMount } from "svelte";
  import { t } from "svelte-i18n";

  interface Props {
    /** Whether the member is signed in and the feature is on for them. The
     *  backend answers 404 when data sharing is switched off, which this treats
     *  as "nothing to prompt" like any other failure — but not asking at all is
     *  cheaper and says what we mean. */
    enabled?: boolean;
  }

  let { enabled = false }: Props = $props();

  /** `null` until the answer arrives; nothing renders before then. */
  let prompt = $state<"invite" | "review" | null>(null);
  let dismissing = $state(false);

  onMount(async () => {
    if (!enabled) return;
    try {
      const status = await api.dataSharing();
      // Nothing to decide is nothing to prompt about. A member whose community
      // is not in a dataspace must not be invited to manage a consent that does
      // not exist — the state field is what makes that distinguishable from
      // "not provisioned yet".
      if (status.state && status.state !== "ok") return;
      if (status.asked === false) prompt = "invite";
      else if (status.review_due) prompt = "review";
    } catch {
      // Feature off, backend down, or no session. Prompting is optional.
      prompt = null;
    }
  });

  /** Record the dismissal and go, in that order.
   *
   * `markOnboardingSeen` writes `user_onboarding_views` under `data-sharing` —
   * the same table, key and route every in-app tour already uses, so this adds
   * no state anywhere. A failed write means the member is asked again later,
   * which is the harmless direction. */
  async function acknowledge(navigate: boolean) {
    dismissing = true;
    try {
      await api.markOnboardingSeen("data-sharing");
    } catch {
      // Asked once more than needed is the safe way to be wrong.
    }
    prompt = null;
    if (navigate) window.location.assign("/data-sharing");
  }
</script>

{#if prompt}
  <div class="sharing-banner" role="status">
    <Icon name="info" size={20} />
    <div class="sharing-banner__text">
      <strong>
        {prompt === "invite"
          ? $t("data_sharing.banner_invite_title")
          : $t("data_sharing.banner_review_title")}
      </strong>
      <span>
        {prompt === "invite"
          ? $t("data_sharing.banner_invite_body")
          : $t("data_sharing.banner_review_body")}
      </span>
    </div>
    <div class="sharing-banner__actions">
      <Button onclick={() => acknowledge(true)} disabled={dismissing}>
        {$t("data_sharing.banner_open")}
      </Button>
      <Button onclick={() => acknowledge(false)} disabled={dismissing}>
        {$t("data_sharing.banner_dismiss")}
      </Button>
    </div>
  </div>
{/if}

<style>
  .sharing-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem 1rem;
    margin: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid var(--color-border, rgba(128, 128, 128, 0.3));
    background: var(--color-surface, rgba(128, 128, 128, 0.08));
  }

  .sharing-banner__text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1 1 16rem;
    font-size: 0.875rem;
  }

  .sharing-banner__actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
</style>
