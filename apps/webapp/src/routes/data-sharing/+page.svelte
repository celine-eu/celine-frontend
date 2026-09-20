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
    import {
        api,
        offerState,
        type DataSharingStatus,
        type SharingOffer,
    } from "$lib/api";
    import { Button, Icon } from "@celine-eu/ui";
    import { onMount } from "svelte";
    import { t, locale } from "svelte-i18n";

    let status = $state<DataSharingStatus | null>(null);
    let events = $state<Record<string, unknown>[]>([]);
    let loading = $state(true);
    let err = $state("");
    /** Offer ids with a change in flight, so only that row is disabled. */
    let pending = $state<Record<string, boolean>>({});

    /** Which explanation a member without an identity gets.
     *
     * These are four different situations and used to be one sentence. The one
     * that matters most is the difference between `no_dataspace` — nothing to
     * decide, ever — and `no_identity`, which onboarding tries to resolve every
     * time this page is opened and may well have resolved by the next reload.
     * Telling somebody in the first case to "try again" would be a lie, and
     * telling somebody in the second that their community does not take part
     * would be a different one.
     *
     * An unrecognised state falls back to the generic sentence rather than
     * rendering a raw code: a backend that grows a fifth state should degrade to
     * what this page said before, not to a word nobody wrote.
     */
    const STATE_KEYS: Record<string, string> = {
        no_dataspace: "data_sharing.state_no_dataspace",
        no_identity: "data_sharing.state_no_identity",
        identity_conflict: "data_sharing.state_identity_conflict",
        ambiguous_community: "data_sharing.state_ambiguous_community",
    };

    let explanation = $derived(
        STATE_KEYS[status?.state ?? ""] ?? "data_sharing.no_identity",
    );

    /** Whether reloading could plausibly change the answer.
     *
     * Only `no_identity` can: onboarding provisions on the read. Offering a
     * retry for a community that does not take part, or for a conflict only an
     * operator can clear, invites a member to keep pressing a button that
     * cannot help them. */
    let canRetry = $derived(status?.state === "no_identity");

    let identity = $derived(status?.identity ?? null);
    let copied = $state(false);

    async function copyDid() {
        if (!identity?.did) return;
        try {
            await navigator.clipboard.writeText(identity.did);
            copied = true;
            setTimeout(() => (copied = false), 2000);
        } catch {
            // Clipboard is permission-gated and absent over plain HTTP. The DID
            // is on the page either way, so a failure here costs the member a
            // convenience and not the value.
            copied = false;
        }
    }

    function formatDate(value: string | null): string {
        if (!value) return "—";
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
    }

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

    /** Mixed, not on or off, while the connectors holding this offer's data
     *  disagree. `indeterminate` is a DOM property with no attribute, so it is
     *  set here rather than in the markup. */
    function mixed(node: HTMLInputElement, on: boolean) {
        node.indeterminate = on;
        return {
            update(next: boolean) {
                node.indeterminate = next;
            },
        };
    }

    /** What pressing the control asks for.
     *
     * Only a withdrawn offer is granted. A pending one is **withdrawn**, like a
     * granted one: a mixed switch has no obvious direction, withdrawal is the one
     * that must always be available (GDPR Art. 7(3)), and onboarding sends it to
     * every connector holding the data, so it settles them rather than adding a
     * third disagreement. Granting again is one more press, from `withdrawn`. */
    function nextDecision(offer: SharingOffer): boolean {
        return offerState(offer) === "withdrawn";
    }

    async function toggle(offer: SharingOffer) {
        pending = { ...pending, [offer.id]: true };
        err = "";
        try {
            status = await api.dataSharingSet(offer.id, nextDecision(offer));
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        } finally {
            const { [offer.id]: _, ...rest } = pending;
            pending = rest;
        }
    }

    /** The community's wording: the member's language, else the first one
     *  written. `null` means the dataspace's generic label and definition. */
    function offerWording(
        offer: SharingOffer,
    ): { title: string; body: string } | null {
        const text = offer.text;
        if (!text) return null;
        const pick = (key: string | undefined) => {
            const value = key && key !== "version" ? text[key] : undefined;
            return value && typeof value === "object" ? value : null;
        };
        const first = Object.keys(text).find((k) => k !== "version");
        return pick($locale?.slice(0, 2)) ?? pick(first);
    }

    function offerTitle(offer: SharingOffer): string {
        return (
            offerWording(offer)?.title ??
            offer.fallback_text_en?.purpose_label ??
            offer.purpose
        );
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
             a community that does not take part. Explain rather than fail — and
             say *which*, because they are not the same situation. -->
        <div class="settings-card">
            <p class="setting-description">{$t(explanation)}</p>
            {#if canRetry}
                <Button onclick={load}>{$t("data_sharing.retry")}</Button>
            {/if}
        </div>
    {:else}
        {#if consentOffers.length === 0 && disclosedOffers.length === 0}
            <div class="settings-card">
                <p class="setting-description">{$t("data_sharing.none")}</p>
            </div>
        {/if}

        {#each consentOffers as offer (offer.id)}
            {@const state = offerState(offer)}
            <div class="settings-card">
                <h2 class="section-title">
                    <Icon name="info" size={20} />
                    {offerTitle(offer)}
                </h2>

                {#if offerWording(offer)}
                    <p class="setting-description offer-body">
                        {offerWording(offer)?.body}
                    </p>
                {:else if offer.fallback_text_en?.purpose_definition}
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

                <!-- `pending`: the connectors holding this offer's data disagree
                     (a grant one has not recorded, a withdrawal one did not take).
                     Shown as neither on nor off, and still pressable: see
                     `nextDecision`. -->
                <label class="setting-row">
                    <input
                        type="checkbox"
                        checked={state !== "withdrawn"}
                        use:mixed={state === "pending"}
                        disabled={pending[offer.id]}
                        onchange={() => toggle(offer)}
                    />
                    <div>
                        <span class="setting-label">
                            {state === "pending"
                                ? $t("data_sharing.sharing_pending")
                                : state === "granted"
                                  ? $t("data_sharing.sharing_on")
                                  : $t("data_sharing.sharing_off")}
                        </span>
                        <span class="setting-description">
                            {state === "pending"
                                ? $t("data_sharing.pending_description")
                                : $t("data_sharing.toggle_description")}
                        </span>
                    </div>
                </label>

                {#if state === "granted" && offer.evidence}
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

        {#if identity?.did}
            <!-- What a member can quote to a REC manager looking them up. The
                 DID was minted on their behalf, so this page is the only place
                 they can learn it. Four named fields and never the credential:
                 the API projects the block for that reason and rendering it by
                 name is what keeps it true from this end. -->
            <div class="settings-card">
                <h2 class="section-title">
                    <Icon name="info" size={20} />
                    {$t("data_sharing.identity")}
                </h2>
                <p class="setting-description">
                    {$t("data_sharing.identity_description")}
                </p>
                <dl class="offer-facts">
                    <dt>{$t("data_sharing.identity_did")}</dt>
                    <dd class="did-row">
                        <code class="did">{identity.did}</code>
                        <Button onclick={copyDid}>
                            {copied
                                ? $t("data_sharing.identity_copied")
                                : $t("data_sharing.identity_copy")}
                        </Button>
                    </dd>
                    {#if identity.role}
                        <dt>{$t("data_sharing.identity_role")}</dt>
                        <dd>{identity.role}</dd>
                    {/if}
                    {#if identity.issued_at}
                        <dt>{$t("data_sharing.identity_issued")}</dt>
                        <dd>{formatDate(identity.issued_at)}</dd>
                    {/if}
                    {#if identity.expires_at}
                        <dt>{$t("data_sharing.identity_expires")}</dt>
                        <dd>{formatDate(identity.expires_at)}</dd>
                    {/if}
                </dl>
            </div>
        {/if}

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
    /* A community's wording is written in paragraphs; keep its line breaks. */
    .offer-body {
        white-space: pre-line;
    }

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

    .did-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .did {
        font-size: 0.8125rem;
        word-break: break-all;
    }

    .history {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.875rem;
    }
</style>
