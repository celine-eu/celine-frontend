<script lang="ts">
    import { page } from "$app/state";
    import { api, type LegalDocument } from "$lib/api";
    import { Button, Icon } from "@celine-eu/ui";
    import { t } from "svelte-i18n";

    let err = $state("");
    let submitting = $state(false);

    // With a legal host: the community's own documents that need accepting, each in its
    // version. Without one: this app's /privacy and /terms, as before.
    const documents = $derived<LegalDocument[] | null>(
        page.data.me?.legal_documents ? page.data.me.legal_documents.filter((d: LegalDocument) => d.required) : null,
    );
    const fallbackTitle: Record<string, string> = {
        terms: "accept_terms.legal_terms",
        privacy: "accept_terms.privacy_policy",
    };

    async function accept() {
        err = "";
        submitting = true;
        try {
            await api.acceptTerms(
                documents?.map((d) => ({ document: d.document, version: d.version ?? null })),
            );
            window.location.href = "/";
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        } finally {
            submitting = false;
        }
    }
</script>

<section class="accept-terms">
    <header class="page-header">
        <h1 class="page-title">{$t('accept_terms.title')}</h1>
        <p class="page-subtitle">{$t('accept_terms.subtitle')}</p>
    </header>

    <div class="terms-card">
        <div class="terms-content">
            <ul class="terms-list">
                {#if documents}
                    {#each documents as doc (doc.document)}
                        <li>
                            <a href={doc.url} target="_blank" rel="noopener">
                                {doc.title || $t(fallbackTitle[doc.document] ?? doc.document)}
                            </a>
                            {#if doc.version}<span class="terms-version">v{doc.version}</span>{/if}
                        </li>
                    {/each}
                {:else}
                    <li><a href="/privacy">{$t('accept_terms.privacy_policy')}</a></li>
                    <li><a href="/terms">{$t('accept_terms.legal_terms')}</a></li>
                {/if}
            </ul>
            <p class="terms-note">{$t('accept_terms.note')}</p>
        </div>

        {#if err}
            <div class="error-banner">
                <Icon name="alert-circle" size={20} />
                <span>{err}</span>
            </div>
        {/if}

        <Button variant="primary" onclick={accept} disabled={submitting}>
            {submitting ? $t('accept_terms.saving') : $t('accept_terms.accept')}
        </Button>
    </div>
</section>

<style>
    .accept-terms {
        max-width: 500px;
        margin: 0 auto;
    }

    .page-header {
        margin-bottom: var(--celine-space-lg);
    }

    .page-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--celine-text);
        margin: 0 0 var(--celine-space-xs);
    }

    .page-subtitle {
        font-size: 0.9375rem;
        color: var(--celine-text-secondary);
        margin: 0;
    }

    .terms-version {
        margin-left: var(--celine-space-xs);
        font-size: 0.8125rem;
        color: var(--celine-text-secondary);
    }

    .terms-card {
        background: var(--celine-bg-elevated);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-lg);
        padding: var(--celine-space-lg);
    }

    .terms-content {
        margin-bottom: var(--celine-space-lg);
    }

    .terms-list {
        margin: 0 0 var(--celine-space-md);
        padding-left: var(--celine-space-lg);
    }

    .terms-list li {
        margin-bottom: var(--celine-space-xs);
    }

    .terms-list a {
        color: var(--celine-primary);
        text-decoration: underline;
    }

    .terms-note {
        font-size: 0.8125rem;
        color: var(--celine-text-tertiary);
        margin: 0;
    }

    .error-banner {
        display: flex;
        align-items: center;
        gap: var(--celine-space-sm);
        padding: var(--celine-space-sm);
        background: var(--celine-danger-bg);
        color: var(--celine-danger-text);
        border-radius: var(--celine-radius-md);
        margin-bottom: var(--celine-space-md);
    }
</style>
