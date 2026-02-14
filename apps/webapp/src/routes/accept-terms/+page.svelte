<script lang="ts">
    import { api } from "$lib/api";
    import { Button, Icon } from "@celine-eu/ui";

    let err = $state("");
    let submitting = $state(false);

    async function accept() {
        err = "";
        submitting = true;
        try {
            await api.acceptTerms();
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
        <h1 class="page-title">Before you continue</h1>
        <p class="page-subtitle">
            Please accept our Privacy Policy and Legal Terms.
        </p>
    </header>

    <div class="terms-card">
        <div class="terms-content">
            <ul class="terms-list">
                <li><a href="/privacy">Privacy Policy</a></li>
                <li><a href="/terms">Legal Terms</a></li>
            </ul>
            <p class="terms-note">
                We store your acceptance with your account identifier, the
                policy version date, your IP address, and a timestamp. If the
                policy version changes, you will be asked to accept again.
            </p>
        </div>

        {#if err}
            <div class="error-banner">
                <Icon name="alert-circle" size={20} />
                <span>{err}</span>
            </div>
        {/if}

        <Button variant="primary" onclick={accept} disabled={submitting}>
            {submitting ? "Saving…" : "I accept and continue"}
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
