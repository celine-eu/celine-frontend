<script lang="ts">
    import { api, type Settings } from "$lib/api";
    import { requestAndSubscribeWebPush, unsubscribeWebPush } from "$lib/push";
    import { Button, Icon } from "@celine-eu/ui";
    import { onMount } from "svelte";

    let settings: Settings | null = $state(null);
    let loading = $state(true);
    let err = $state("");
    let saved = $state("");
    let pushMsg = $state("");
    let pushLoading = $state(false);

    async function load() {
        loading = true;
        err = "";
        try {
            settings = await api.settingsGet();
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    async function save() {
        if (!settings) return;
        saved = "";
        err = "";
        try {
            settings = await api.settingsPut(settings);
            saved = "Settings saved";
            document.documentElement.style.setProperty(
                "--celine-font-scale",
                String(settings.font_scale ?? 1),
            );
            setTimeout(() => (saved = ""), 3000);
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        }
    }

    async function enablePush() {
        pushMsg = "";
        pushLoading = true;
        try {
            const res = await requestAndSubscribeWebPush();
            pushMsg = res.subscribed
                ? "Web push enabled."
                : (res.message ?? "Could not enable web push.");
        } catch (e) {
            pushMsg = e instanceof Error ? e.message : String(e);
        } finally {
            pushLoading = false;
        }
    }

    async function disablePush() {
        pushMsg = "";
        pushLoading = true;
        try {
            await unsubscribeWebPush();
            pushMsg = "Web push disabled.";
        } catch (e) {
            pushMsg = e instanceof Error ? e.message : String(e);
        } finally {
            pushLoading = false;
        }
    }

    onMount(load);
</script>

<section class="settings-page">
    <header class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">
            Make the app easier to read and configure notifications.
        </p>
    </header>

    {#if loading}
        <div class="loading-card">
            <p>Loading settings...</p>
        </div>
    {:else if err}
        <div class="error-banner">
            <Icon name="alert-circle" size={20} />
            <span>{err}</span>
        </div>
    {:else if settings}
        <!-- Accessibility Section -->
        <div class="settings-card">
            <h2 class="section-title">
                <Icon name="eye" size={20} />
                Accessibility
            </h2>

            <label class="setting-row">
                <input type="checkbox" bind:checked={settings.simple_mode} />
                <div>
                    <span class="setting-label">Simple mode</span>
                    <span class="setting-description"
                        >Reduced layout, actionable info first</span
                    >
                </div>
            </label>

            <div class="setting-row setting-row--column">
                <div>
                    <span class="setting-label">Text size</span>
                    <span class="setting-description"
                        >Adjust for easier reading</span
                    >
                </div>
                <div class="slider-container">
                    <span class="slider-label">A</span>
                    <input
                        type="range"
                        min="0.85"
                        max="1.3"
                        step="0.05"
                        bind:value={settings.font_scale}
                    />
                    <span class="slider-label slider-label--large">A</span>
                    <span class="slider-value"
                        >{Math.round((settings.font_scale ?? 1) * 100)}%</span
                    >
                </div>
            </div>
        </div>

        <!-- Notifications Section -->
        <div class="settings-card">
            <h2 class="section-title">
                <Icon name="bell" size={20} />
                Notifications
            </h2>

            <div class="setting-row setting-row--column">
                <div>
                    <span class="setting-label">Web push notifications</span>
                    <span class="setting-description">
                        Receive "when to consume" indications directly in your
                        browser. Requires browser permission.
                    </span>
                </div>
                <div class="push-buttons">
                    <Button
                        variant="primary"
                        onclick={enablePush}
                        disabled={pushLoading}
                    >
                        {pushLoading ? "Loading..." : "Enable"}
                    </Button>
                    <Button
                        variant="secondary"
                        onclick={disablePush}
                        disabled={pushLoading}
                    >
                        Disable
                    </Button>
                </div>
                {#if pushMsg}
                    <p class="push-message">{pushMsg}</p>
                {/if}
            </div>

            <label class="setting-row">
                <input
                    type="checkbox"
                    bind:checked={settings.notifications.email_enabled}
                />
                <div>
                    <span class="setting-label">Email notifications</span>
                    <span class="setting-description"
                        >Receive updates via email (coming soon)</span
                    >
                </div>
            </label>
        </div>

        <!-- Save Button -->
        <div class="actions">
            <Button variant="primary" onclick={save}>Save changes</Button>
            {#if saved}
                <span class="saved-message">
                    <Icon name="check-circle" size={16} />
                    {saved}
                </span>
            {/if}
        </div>
    {/if}
</section>

<style>
    .settings-page {
        display: flex;
        flex-direction: column;
        gap: var(--celine-space-lg);
        max-width: 600px;
    }

    .page-header {
        margin-bottom: var(--celine-space-sm);
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

    .loading-card,
    .settings-card {
        background: var(--celine-bg-elevated);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-lg);
        padding: var(--celine-space-lg);
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

    .section-title {
        display: flex;
        align-items: center;
        gap: var(--celine-space-sm);
        font-size: 1rem;
        font-weight: 600;
        color: var(--celine-text);
        margin: 0 0 var(--celine-space-md);
    }

    .setting-row {
        display: flex;
        align-items: flex-start;
        gap: var(--celine-space-md);
        padding: var(--celine-space-md) 0;
        border-bottom: 1px solid var(--celine-border);
        cursor: pointer;
    }

    .setting-row:last-of-type {
        border-bottom: none;
        padding-bottom: 0;
    }

    .setting-row--column {
        flex-direction: column;
        cursor: default;
    }

    .setting-row input[type="checkbox"] {
        width: 20px;
        height: 20px;
        margin-top: 2px;
        accent-color: var(--celine-primary);
        cursor: pointer;
    }

    .setting-label {
        display: block;
        font-weight: 500;
        color: var(--celine-text);
    }

    .setting-description {
        display: block;
        font-size: 0.8125rem;
        color: var(--celine-text-secondary);
        margin-top: 2px;
    }

    .slider-container {
        display: flex;
        align-items: center;
        gap: var(--celine-space-sm);
        margin-top: var(--celine-space-sm);
    }

    .slider-container input[type="range"] {
        flex: 1;
        max-width: 200px;
        accent-color: var(--celine-primary);
    }

    .slider-label {
        font-size: 0.75rem;
        color: var(--celine-text-secondary);
        width: 16px;
        text-align: center;
    }

    .slider-label--large {
        font-size: 1.125rem;
    }

    .slider-value {
        font-size: 0.8125rem;
        color: var(--celine-text);
        font-weight: 500;
        min-width: 40px;
    }

    .push-buttons {
        display: flex;
        gap: var(--celine-space-sm);
        margin-top: var(--celine-space-sm);
    }

    .push-message {
        font-size: 0.8125rem;
        color: var(--celine-text-secondary);
        margin: var(--celine-space-sm) 0 0;
    }

    .actions {
        display: flex;
        align-items: center;
        gap: var(--celine-space-md);
    }

    .saved-message {
        display: flex;
        align-items: center;
        gap: var(--celine-space-xs);
        color: var(--celine-success);
        font-size: 0.875rem;
    }
</style>
