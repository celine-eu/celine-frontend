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
        ApiError,
        offerState,
        type DataSharingStatus,
        type SharingOffer,
    } from "$lib/api";
    import { Button, Icon, Skeleton } from "@celine-eu/ui";
    import { onMount } from "svelte";
    import { t, locale } from "svelte-i18n";

    let status = $state<DataSharingStatus | null>(null);
    let events = $state<Record<string, unknown>[]>([]);
    let loading = $state(true);
    /** An i18n key, never the server's text: that names connectors and
     *  status codes a member can do nothing with. */
    let err = $state("");

    /** What to tell the member when a call fails; the reason goes to the console. */
    function failure(e: unknown): string {
        console.error("data sharing:", e);
        return e instanceof ApiError && e.status === 503
            ? "data_sharing.unavailable"
            : "data_sharing.failed";
    }
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

    /** An ISO-8601 period (`P2Y`, `P18M`, `P30D`) in words, in the member's
     *  language; the code itself when it is anything else. */
    function period(value: string | null | undefined): string {
        if (!value) return "";
        const match = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(value);
        if (!match || !match.slice(1).some(Boolean)) return value;
        const units = ["year", "month", "day"] as const;
        return match
            .slice(1)
            .map((n, i) =>
                n
                    ? new Intl.NumberFormat($locale ?? undefined, {
                          style: "unit",
                          unit: units[i],
                          unitDisplay: "long",
                      }).format(Number(n))
                    : "",
            )
            .filter(Boolean)
            .join(" ");
    }

    /** Who may process the data for the recipient, in words; the code when no
     *  sentence has been written for it. */
    function processors(category: string): string {
        const key = `data_sharing.processors_${category}`;
        const label = $t(key);
        return label === key ? category.replaceAll("-", " ") : label;
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

    /** Every offer another one requires (an access before its uses) first,
     *  then the rest — each group in the order the dataspace publishes them. */
    let orderedConsent = $derived.by(() => {
        const required = new Set(consentOffers.flatMap((o) => o.requires_offers ?? []));
        const rank = (o: SharingOffer) => (required.has(o.id) ? 0 : 1);
        return [...consentOffers].sort((a, b) => rank(a) - rank(b));
    });

    /** The community's one switch, as the onboarding wizard shows it: onboarding
     *  carries its wording on every offer (`switch`). `null` → one row per offer
     *  with no switch above them. */
    let switchWording = $derived.by((): { title: string; label: string } | null => {
        const wording = consentOffers.find((o) => o.switch)?.switch;
        if (!wording) return null;
        const first = Object.keys(wording)[0];
        return wording[$locale?.slice(0, 2) ?? ""] ?? (first ? wording[first] : null) ?? null;
    });

    let parties = $derived(
        [...new Set(orderedConsent.map(recipientName))].filter(Boolean),
    );
    let allOn = $derived(
        consentOffers.length > 0 &&
            consentOffers.every((o) => offerState(o) === "granted"),
    );
    let someOn = $derived(consentOffers.some((o) => offerState(o) !== "withdrawn"));
    let busy = $derived(Object.keys(pending).length > 0);

    /** Who gets the data, by name: onboarding's `recipient_name`, else the alias. */
    function recipientName(offer: SharingOffer): string {
        return (
            offer.recipient_name ??
            offer.recipients?.recipient ??
            offer.recipients?.controller ??
            ""
        );
    }

    function current(id: string): SharingOffer | undefined {
        return consentOffers.find((o) => o.id === id);
    }

    /** The offers this one needs that are not granted. A use of data that only
     *  exists because of another offer (an access) cannot be granted without it. */
    function unmet(offer: SharingOffer): SharingOffer[] {
        return (offer.requires_offers ?? [])
            .map(current)
            .filter((o): o is SharingOffer => !!o && offerState(o) !== "granted");
    }

    /** Every offer that needs this one, directly or not. */
    function dependents(offer: SharingOffer): SharingOffer[] {
        const out: SharingOffer[] = [];
        const walk = (id: string) => {
            for (const o of consentOffers) {
                if ((o.requires_offers ?? []).includes(id) && !out.includes(o)) {
                    out.push(o);
                    walk(o.id);
                }
            }
        };
        walk(offer.id);
        return out;
    }

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
            err = failure(e);
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

    /** One decision on one offer; `status` is replaced by the answer. */
    async function decide(id: string, grant: boolean) {
        pending = { ...pending, [id]: true };
        try {
            status = await api.dataSharingSet(id, grant);
        } finally {
            const { [id]: _, ...rest } = pending;
            pending = rest;
        }
    }

    /** Withdrawing an offer withdraws what depends on it first, as the wizard
     *  does: a use left standing without its access admits nobody, and would
     *  read as on. */
    async function toggle(offer: SharingOffer) {
        err = "";
        const grant = nextDecision(offer);
        try {
            if (!grant) {
                for (const d of dependents(offer).reverse()) {
                    const now = current(d.id);
                    if (now && offerState(now) !== "withdrawn") await decide(d.id, false);
                }
            }
            await decide(offer.id, grant);
        } catch (e) {
            err = failure(e);
        }
    }

    /** The one switch: every offer on (accesses before their uses) or every
     *  offer off (uses before their accesses). Each is still its own decision. */
    async function setAll(grant: boolean) {
        err = "";
        const order = grant ? orderedConsent : [...orderedConsent].reverse();
        try {
            for (const o of order) {
                const now = current(o.id);
                if (!now) continue;
                const state = offerState(now);
                if (grant ? state !== "granted" : state !== "withdrawn") {
                    await decide(o.id, grant);
                }
            }
        } catch (e) {
            err = failure(e);
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

    /** An event's type. Provenance serves JSON-LD — `"@type": "ds:ConsentGranted"`,
     *  and no `event_type` — so reading only `event_type` rendered every line
     *  empty. `event_type` stays as the fallback for a plain-JSON source. */
    function eventType(event: Record<string, unknown>): string {
        return String(event["@type"] ?? event.event_type ?? "").replace(/^ds:/, "");
    }

    /** A plain-language line per event. Falls back to the code rather than
     *  hiding an event nobody has written a sentence for yet. */
    function describe(event: Record<string, unknown>): string {
        const kind = eventType(event);
        if (!kind) return $t("data_sharing.event_unknown");
        const key = `data_sharing.event_${kind}`;
        const label = $t(key);
        return label === key ? kind : label;
    }

    /** One line per thing that happened, not per record of it. A consent is
     *  recorded once per dataset its offer is bound to, so one decision on an
     *  offer bound to six datasets arrives as six identical events in the same
     *  second. Consecutive events of one type, on one offer, in one second are
     *  one line. */
    let historyLines = $derived.by(() => {
        const lines: { key: string; event: Record<string, unknown> }[] = [];
        for (const event of events) {
            const when = String(event["ds:occurredAt"] ?? event.occurred_at ?? "").slice(0, 19);
            const key = `${eventType(event)}|${event["ds:offerId"] ?? event.offer_id ?? ""}|${when}`;
            if (lines.at(-1)?.key === key) continue;
            lines.push({ key, event });
        }
        return lines;
    });

    function eventWhen(event: Record<string, unknown>): string {
        const value = event["ds:occurredAt"] ?? event.occurred_at;
        if (!value) return "";
        const parsed = new Date(String(value));
        return isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
    }

    /** Which choice the event is about, by the title the member saw. */
    function eventOffer(event: Record<string, unknown>): string {
        const id = event["ds:offerId"] ?? event.offer_id;
        if (!id) return "";
        const offer = (status?.offers ?? []).find((o) => o.id === id);
        if (!offer) return String(id);
        const who = recipientName(offer);
        return who ? `${offerTitle(offer)} · ${who}` : offerTitle(offer);
    }
</script>

<section class="sharing-page">
    <header class="page-header">
        <h1 class="page-title">{$t("data_sharing.title")}</h1>
        <p class="page-subtitle">{$t("data_sharing.subtitle")}</p>
    </header>

    {#if loading}
        <div class="section-card loading-card">
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="90%" />
            <Skeleton variant="text" width="70%" />
        </div>
    {:else if err}
        <div class="error-banner">
            <Icon name="alert-circle" size={20} />
            <span>{$t(err)}</span>
        </div>
        <div><Button variant="secondary" onclick={load}>{$t("data_sharing.retry")}</Button></div>
    {:else if !status?.has_identity}
        <!-- Normal for a participant enabled before the dataspace existed, or in
             a community that does not take part. Explain rather than fail — and
             say *which*, because they are not the same situation. -->
        <div class="section-card">
            <p class="card-text">{$t(explanation)}</p>
            {#if canRetry}
                <div class="card-actions">
                    <Button variant="secondary" onclick={load}>{$t("data_sharing.retry")}</Button>
                </div>
            {/if}
        </div>
    {:else}
        {#if consentOffers.length === 0 && disclosedOffers.length === 0}
            <div class="section-card">
                <p class="card-text">{$t("data_sharing.none")}</p>
            </div>
        {/if}

        {#if consentOffers.length}
            <section class="section-card consent-card">
                <div class="section-header">
                    <Icon name="shield-check" size={22} class="section-icon" />
                    <h2 class="section-title">
                        {switchWording?.title ?? $t("data_sharing.title")}
                    </h2>
                </div>

                {#if switchWording}
                    <label class="setting-row switch-row">
                        <input
                            type="checkbox"
                            checked={allOn}
                            use:mixed={someOn && !allOn}
                            disabled={busy}
                            onchange={() => setAll(!allOn)}
                        />
                        <span class="setting-copy">
                            <span class="setting-label">{switchWording.label}</span>
                            {#if parties.length}
                                <span class="setting-description">{parties.join(", ")}</span>
                            {/if}
                        </span>
                    </label>
                    <details class="more">
                        <summary class="more-toggle">
                            {$t("data_sharing.learn_more")}
                            <Icon name="chevron-down" size={16} class="more-chevron" />
                        </summary>
                        <div class="offer-list offer-list--nested">
                            {#each orderedConsent as offer (offer.id)}
                                {@render offerRow(offer)}
                            {/each}
                        </div>
                    </details>
                {:else}
                    <div class="offer-list">
                        {#each orderedConsent as offer (offer.id)}
                            {@render offerRow(offer)}
                        {/each}
                    </div>
                {/if}

                <p class="card-footnote">{$t("data_sharing.toggle_description")}</p>
            </section>
        {/if}

        {#each disclosedOffers as offer (offer.id)}
            <!-- Disclosed, not chosen: no control, because there is no choice. -->
            <section class="section-card section-card--muted">
                <div class="section-header">
                    <Icon name="info" size={22} class="section-icon" />
                    <h2 class="section-title">{offerTitle(offer)}</h2>
                </div>
                <p class="card-text">{$t("data_sharing.disclosed_description")}</p>
            </section>
        {/each}

        {#if identity?.did}
            <!-- What a member can quote to a REC manager looking them up. The
                 DID was minted on their behalf, so this page is the only place
                 they can learn it. Four named fields and never the credential:
                 the API projects the block for that reason and rendering it by
                 name is what keeps it true from this end. -->
            <section class="section-card">
                <div class="section-header">
                    <Icon name="users" size={22} class="section-icon" />
                    <div>
                        <h2 class="section-title">{$t("data_sharing.identity")}</h2>
                        <p class="section-subtitle">{$t("data_sharing.identity_description")}</p>
                    </div>
                </div>
                <div class="did-row">
                    <code class="did">{identity.did}</code>
                    <Button variant="secondary" size="sm" onclick={copyDid}>
                        {copied
                            ? $t("data_sharing.identity_copied")
                            : $t("data_sharing.identity_copy")}
                    </Button>
                </div>
                <dl class="facts">
                    {#if identity.role}
                        <div>
                            <dt>{$t("data_sharing.identity_role")}</dt>
                            <dd>{identity.role}</dd>
                        </div>
                    {/if}
                    {#if identity.issued_at}
                        <div>
                            <dt>{$t("data_sharing.identity_issued")}</dt>
                            <dd>{formatDate(identity.issued_at)}</dd>
                        </div>
                    {/if}
                    {#if identity.expires_at}
                        <div>
                            <dt>{$t("data_sharing.identity_expires")}</dt>
                            <dd>{formatDate(identity.expires_at)}</dd>
                        </div>
                    {/if}
                </dl>
            </section>
        {/if}

        {#if events.length}
            <section class="section-card">
                <div class="section-header">
                    <Icon name="history" size={22} class="section-icon" />
                    <h2 class="section-title">{$t("data_sharing.history")}</h2>
                </div>
                <ul class="history">
                    {#each historyLines as { event }, i (i)}
                        <li class="history-item">
                            <span class="history-what">{describe(event)}</span>
                            {#if eventOffer(event)}
                                <span class="history-offer">{eventOffer(event)}</span>
                            {/if}
                            {#if eventWhen(event)}
                                <span class="history-when">{eventWhen(event)}</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
            </section>
        {/if}
    {/if}
</section>

{#snippet offerRow(offer: SharingOffer)}
    {@const state = offerState(offer)}
    {@const blocked = state === "withdrawn" && unmet(offer).length > 0}
    <div class="offer-row" class:offer-row--blocked={blocked} data-offer-id={offer.id}>
        <!-- `pending`: the connectors holding this offer's data disagree (a
             grant one has not recorded, a withdrawal one did not take). Shown
             as neither on nor off, and still pressable: see `nextDecision`. -->
        <label class="setting-row">
            <input
                type="checkbox"
                checked={state !== "withdrawn"}
                use:mixed={state === "pending"}
                disabled={pending[offer.id] || blocked}
                onchange={() => toggle(offer)}
            />
            <span class="setting-copy">
                <span class="setting-label">{offerTitle(offer)}</span>
                {#if recipientName(offer)}
                    <span class="setting-description">{recipientName(offer)}</span>
                {/if}
            </span>
        </label>
        <div class="offer-detail">
            {#if state === "pending"}
                <p class="offer-note offer-note--warning">
                    <Icon name="alert-triangle" size={14} />
                    <span>
                        {$t("data_sharing.sharing_pending")} — {$t("data_sharing.pending_description")}
                    </span>
                </p>
            {/if}
            {#if blocked}
                <p class="offer-note">
                    {$t("data_sharing.requires")}
                    {unmet(offer)
                        .map((o) => `«${offerTitle(o)}» (${recipientName(o)})`)
                        .join(", ")}
                </p>
            {/if}
            <details class="more">
                <summary class="more-toggle">
                    {$t("data_sharing.learn_more")}
                    <Icon name="chevron-down" size={16} class="more-chevron" />
                </summary>
                <div class="more-panel">
                    {#if offerWording(offer)}
                        <p class="offer-body">{offerWording(offer)?.body}</p>
                    {:else if offer.fallback_text_en?.purpose_definition}
                        <p class="offer-body">{offer.fallback_text_en.purpose_definition}</p>
                    {/if}
                    <dl class="facts">
                        {#if recipientName(offer)}
                            <div>
                                <dt>{$t("data_sharing.controller")}</dt>
                                <dd>{recipientName(offer)}</dd>
                            </div>
                        {/if}
                        {#if offer.fallback_text_en?.processor_category}
                            <div>
                                <dt>{$t("data_sharing.recipients")}</dt>
                                <dd>{processors(offer.fallback_text_en.processor_category)}</dd>
                            </div>
                        {/if}
                        {#if offer.retention}
                            <div>
                                <dt>{$t("data_sharing.retention")}</dt>
                                <dd>{period(offer.retention)}</dd>
                            </div>
                        {/if}
                        {#if state === "granted" && offer.evidence}
                            <!-- The record of what was shown when the decision was made:
                                 codes and hashes, never anything about the person. -->
                            <div class="evidence">
                                <dt>{$t("data_sharing.text_version")}</dt>
                                <dd>{offer.consent_text_version}</dd>
                            </div>
                            {#if offer.decided_at}
                                <div class="evidence">
                                    <dt>{$t("data_sharing.decided_at")}</dt>
                                    <dd>{new Date(offer.decided_at).toLocaleString()}</dd>
                                </div>
                            {/if}
                        {/if}
                    </dl>
                </div>
            </details>
        </div>
    </div>
{/snippet}

<style>
    /* The app's page and card language — `section-card`, `section-header`,
       `page-header` from the overview, `setting-row` from settings. Scoped per
       page there, so stated again here. */
    .sharing-page {
        display: flex;
        flex-direction: column;
        gap: var(--celine-space-lg);
    }

    .page-header {
        margin-bottom: var(--celine-space-sm);
    }

    .page-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--celine-text);
        margin: 0 0 var(--celine-space-xs);
        line-height: 1.2;
    }

    .page-subtitle {
        font-size: 0.9375rem;
        color: var(--celine-text-secondary);
        margin: 0;
    }

    .section-card {
        background: var(--celine-bg-elevated);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-lg);
        padding: var(--celine-space-md);
    }

    .section-card--muted {
        background: var(--celine-bg-sunken);
    }

    .loading-card {
        display: flex;
        flex-direction: column;
        gap: var(--celine-space-sm);
    }

    .section-header {
        display: flex;
        align-items: flex-start;
        gap: var(--celine-space-sm);
        margin-bottom: var(--celine-space-md);
    }

    .section-header > div {
        flex: 1;
    }

    :global(.section-icon) {
        color: var(--celine-primary);
        margin-top: 2px;
        flex: none;
    }

    .section-title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--celine-text);
        margin: 0;
        line-height: 1.3;
    }

    .section-subtitle,
    .card-text {
        font-size: 0.875rem;
        color: var(--celine-text-secondary);
        margin: var(--celine-space-xs) 0 0;
        line-height: 1.5;
    }

    .card-text {
        margin: 0;
    }

    .card-actions {
        margin-top: var(--celine-space-md);
    }

    .card-footnote {
        font-size: 0.8125rem;
        color: var(--celine-text-tertiary);
        margin: var(--celine-space-md) 0 0;
        padding-top: var(--celine-space-md);
        border-top: 1px solid var(--celine-border);
    }

    .error-banner {
        display: flex;
        align-items: center;
        gap: var(--celine-space-sm);
        padding: var(--celine-space-md);
        background: var(--celine-danger-bg);
        color: var(--celine-danger-text);
        border-radius: var(--celine-radius-md);
    }

    /* ── rows: the settings page's checkbox rows ─────────────────────────── */

    .setting-row {
        display: flex;
        align-items: flex-start;
        gap: var(--celine-space-md);
        cursor: pointer;
    }

    .setting-row input[type="checkbox"] {
        width: 20px;
        height: 20px;
        margin: 2px 0 0;
        flex: none;
        accent-color: var(--celine-primary);
        cursor: pointer;
    }

    .setting-row input[type="checkbox"]:disabled {
        cursor: not-allowed;
    }

    .setting-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .setting-label {
        font-weight: 500;
        color: var(--celine-text);
        line-height: 1.4;
    }

    .setting-description {
        font-size: 0.8125rem;
        color: var(--celine-text-secondary);
        margin-top: 2px;
    }

    .switch-row .setting-label {
        font-weight: 600;
    }

    .offer-list {
        display: flex;
        flex-direction: column;
    }

    .offer-list--nested {
        margin-top: var(--celine-space-sm);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-md);
        padding: 0 var(--celine-space-md);
    }

    .offer-row {
        padding: var(--celine-space-md) 0;
        border-bottom: 1px solid var(--celine-border);
    }

    .offer-row:last-child {
        border-bottom: none;
    }

    .offer-row--blocked .setting-label {
        color: var(--celine-text-secondary);
    }

    /* Everything under a row lines up with its label, not its checkbox. */
    .offer-detail,
    .switch-row + .more {
        margin-left: calc(20px + var(--celine-space-md));
    }

    .offer-note {
        display: flex;
        align-items: flex-start;
        gap: var(--celine-space-xs);
        font-size: 0.8125rem;
        color: var(--celine-text-tertiary);
        margin: var(--celine-space-xs) 0 0;
    }

    .offer-note--warning {
        color: var(--celine-warning-text);
        background: var(--celine-warning-bg);
        border-radius: var(--celine-radius-sm);
        padding: var(--celine-space-xs) var(--celine-space-sm);
    }

    /* ── "Learn more" ────────────────────────────────────────────────────── */

    .more {
        margin-top: var(--celine-space-xs);
    }

    .more-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--celine-space-xs);
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--celine-primary);
        cursor: pointer;
        list-style: none;
        border-radius: var(--celine-radius-sm);
    }

    .more-toggle::-webkit-details-marker {
        display: none;
    }

    .more-toggle::marker {
        content: "";
    }

    .more-toggle:hover {
        color: var(--celine-primary-hover);
    }

    .more-toggle:focus-visible {
        outline: 2px solid var(--celine-primary);
        outline-offset: 2px;
    }

    :global(.more-chevron) {
        transition: transform 0.15s ease;
    }

    .more[open] > .more-toggle :global(.more-chevron) {
        transform: rotate(180deg);
    }

    .more-panel {
        margin-top: var(--celine-space-sm);
        padding: var(--celine-space-sm) var(--celine-space-md);
        background: var(--celine-bg-sunken);
        border-radius: var(--celine-radius-md);
    }

    /* A community's wording is written in paragraphs; keep its line breaks. */
    .offer-body {
        white-space: pre-line;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--celine-text);
        margin: 0 0 var(--celine-space-sm);
    }

    /* ── facts ───────────────────────────────────────────────────────────── */

    .facts {
        display: flex;
        flex-direction: column;
        gap: var(--celine-space-xs);
        margin: 0;
        font-size: 0.8125rem;
    }

    .facts > div {
        display: flex;
        gap: var(--celine-space-sm);
    }

    .facts dt {
        flex: 0 0 9rem;
        color: var(--celine-text-secondary);
    }

    .facts dd {
        margin: 0;
        color: var(--celine-text);
        min-width: 0;
    }

    .did-row {
        display: flex;
        align-items: center;
        gap: var(--celine-space-sm);
        flex-wrap: wrap;
        margin-bottom: var(--celine-space-md);
    }

    .did {
        flex: 1 1 16rem;
        font-size: 0.8125rem;
        word-break: break-all;
        padding: var(--celine-space-sm) var(--celine-space-md);
        background: var(--celine-bg-sunken);
        border-radius: var(--celine-radius-md);
        color: var(--celine-text);
    }

    /* ── history ─────────────────────────────────────────────────────────── */

    .history {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .history-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: var(--celine-space-sm) 0;
        border-bottom: 1px solid var(--celine-border);
    }

    .history-item:first-child {
        padding-top: 0;
    }

    .history-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .history-what {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--celine-text);
    }

    .history-offer {
        font-size: 0.8125rem;
        color: var(--celine-text-secondary);
    }

    .history-when {
        font-size: 0.75rem;
        color: var(--celine-text-tertiary);
    }

    /* Narrow screens: one level of indentation, and each fact's label above
       its value, so the text keeps a readable measure. */
    @media (max-width: 639px) {
        .switch-row + .more {
            margin-left: 0;
        }

        .offer-list--nested {
            border: none;
            border-top: 1px solid var(--celine-border);
            border-radius: 0;
            padding: 0;
        }

        .more-panel {
            padding: var(--celine-space-sm);
        }

        .facts > div {
            flex-direction: column;
            gap: 0;
        }

        .facts dt {
            flex: none;
        }
    }

    @media (min-width: 640px) {
        .section-card {
            padding: var(--celine-space-lg);
        }

        .page-title {
            font-size: 1.75rem;
        }
    }

    @media (min-width: 768px) {
        .section-card {
            padding: var(--celine-space-xl);
        }

        .section-title {
            font-size: 1.125rem;
        }

        .section-header {
            margin-bottom: var(--celine-space-lg);
        }
    }
</style>
