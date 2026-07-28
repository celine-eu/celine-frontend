<script lang="ts">
    /**
     * A member's own data-sharing decisions.
     *
     * The onboarding wizard can only grant a sharing consent — it holds no
     * session once somebody is approved. This page is where a decision can be
     * changed or withdrawn, which GDPR Art. 7(3) requires to be as easy as
     * giving it was.
     *
     * Two rules the markup keeps:
     *
     * - only consent-based offers get a control. A contract-based offer is
     *   disclosed, not chosen: showing a switch for something the member cannot
     *   decline is what invalidates consent.
     * - the facts come from the dataspace's published vocabulary, never a copy
     *   held here. Two copies of the text somebody agrees to is how the thing
     *   shown and the thing recorded drift apart, invisibly.
     */
    import { api, type DataSharingStatus, type SharingOffer } from "$lib/api";
    import { Button, Icon } from "@celine-eu/ui";
    import { onMount } from "svelte";
    import { t } from "svelte-i18n";

    let status = $state<DataSharingStatus | null>(null);
    let events = $state<Record<string, unknown>[]>([]);
    let loading = $state(true);
    let err = $state("");
    /** Offer ids with a change in flight, so only that row is disabled. */
    let pending = $state<Record<string, boolean>>({});

    let consentOffers = $derived(
        (status?.offers ?? []).filter((o) => o.requires_consent),
    );
    let disclosedOffers = $derived(
        (status?.offers ?? []).filter((o) => !o.requires_consent),
    );

    onMount(load);

    async function load() {
        loading = true;
        err = "";
        try {
            status = await api.dataSharing();
            if (status.has_identity) {
                // The history is a detail: the decisions stand without it, so a
                // failure here must not take the page down with it.
                try {
                    events = (await api.dataSharingHistory()).events;
                } catch {
                    events = [];
                }
            }
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    async function toggle(offer: SharingOffer) {
        pending = { ...pending, [offer.id]: true };
        err = "";
        try {
            status = await api.dataSharingSet(offer.id, !offer.granted);
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        } finally {
            const { [offer.id]: _, ...rest } = pending;
            pending = rest;
        }
    }

    function offerTitle(offer: SharingOffer): string {
        return offer.fallback_text_en?.purpose_label ?? offer.purpose;
    }

    /** A plain-language line per event. Falls back to the code rather than
     *  hiding an event nobody has written a sentence for yet. */
    function describe(event: Record<string, unknown>): string {
        const kind = String(event.event_type ?? "");
        const key = `data_sharing.event_${kind}`;
        const label = $t(key);
        return label === key ? kind : label;
    }
</script>

<section class="sharing-page">
    <header class="page-header">
        <h1 class="page-title">{$t("data_sharing.title")}</h1>
        <p class="page-subtitle">{$t("data_sharing.subtitle")}</p>
    </header>

    {#if loading}
        <div class="loading-card">{$t("data_sharing.loading")}</div>
    {:else if err}
        <div class="error-banner">{err}</div>
        <Button onclick={load}>{$t("data_sharing.retry")}</Button>
    {:else if !status?.has_identity}
        <!-- Normal for a participant enabled before the dataspace existed, or in
             a community that does not take part. Explain rather than fail. -->
        <div class="settings-card">
            <p class="setting-description">{$t("data_sharing.no_identity")}</p>
        </div>
    {:else}
        {#if consentOffers.length === 0 && disclosedOffers.length === 0}
            <div class="settings-card">
                <p class="setting-description">{$t("data_sharing.none")}</p>
            </div>
        {/if}

        {#each consentOffers as offer (offer.id)}
            <div class="settings-card">
                <h2 class="section-title">
                    <Icon name="info" size={20} />
                    {offerTitle(offer)}
                </h2>

                {#if offer.fallback_text_en?.purpose_definition}
                    <p class="setting-description">
                        {offer.fallback_text_en.purpose_definition}
                    </p>
                {/if}

                <dl class="offer-facts">
                    {#if offer.recipients?.controller}
                        <dt>{$t("data_sharing.controller")}</dt>
                        <dd>{offer.recipients.controller}</dd>
                    {/if}
                    {#if offer.fallback_text_en?.processor_category}
                        <dt>{$t("data_sharing.recipients")}</dt>
                        <dd>{offer.fallback_text_en.processor_category}</dd>
                    {/if}
                    {#if offer.retention}
                        <dt>{$t("data_sharing.retention")}</dt>
                        <dd>{offer.retention}</dd>
                    {/if}
                </dl>

                <label class="setting-row">
                    <input
                        type="checkbox"
                        checked={offer.granted}
                        disabled={pending[offer.id]}
                        onchange={() => toggle(offer)}
                    />
                    <div>
                        <span class="setting-label">
                            {offer.granted
                                ? $t("data_sharing.sharing_on")
                                : $t("data_sharing.sharing_off")}
                        </span>
                        <span class="setting-description">
                            {$t("data_sharing.toggle_description")}
                        </span>
                    </div>
                </label>

                {#if offer.granted && offer.evidence}
                    <!-- The record of what was shown when the decision was made:
                         codes and hashes, never anything about the person. -->
                    <details class="evidence">
                        <summary>{$t("data_sharing.evidence")}</summary>
                        <dl class="offer-facts">
                            <dt>{$t("data_sharing.text_version")}</dt>
                            <dd>{offer.consent_text_version}</dd>
                            {#if offer.decided_at}
                                <dt>{$t("data_sharing.decided_at")}</dt>
                                <dd>{new Date(offer.decided_at).toLocaleString()}</dd>
                            {/if}
                        </dl>
                    </details>
                {/if}
            </div>
        {/each}

        {#each disclosedOffers as offer (offer.id)}
            <!-- Disclosed, not chosen: no control, because there is no choice. -->
            <div class="settings-card settings-card--muted">
                <h2 class="section-title">
                    <Icon name="info" size={20} />
                    {offerTitle(offer)}
                </h2>
                <p class="setting-description">
                    {$t("data_sharing.disclosed_description")}
                </p>
            </div>
        {/each}

        {#if events.length}
            <div class="settings-card">
                <h2 class="section-title">
                    <Icon name="info" size={20} />
                    {$t("data_sharing.history")}
                </h2>
                <ul class="history">
                    {#each events as event, i (i)}
                        <li>{describe(event)}</li>
                    {/each}
                </ul>
            </div>
        {/if}
    {/if}
</section>

<style>
    .sharing-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .offer-facts {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.25rem 1rem;
        margin: 0.5rem 0;
        font-size: 0.875rem;
    }

    .offer-facts dt {
        opacity: 0.7;
    }

    .offer-facts dd {
        margin: 0;
    }

    .evidence {
        margin-top: 0.75rem;
        font-size: 0.875rem;
    }

    .settings-card--muted {
        opacity: 0.85;
    }

    .history {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.875rem;
    }
</style>
