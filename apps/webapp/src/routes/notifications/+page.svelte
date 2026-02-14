<script lang="ts">
    import { api, type NotificationItem } from "$lib/api";
    import { requestAndSubscribeWebPush } from "$lib/push";
    import { Button, Icon, Skeleton } from "@celine-eu/ui";
    import { onMount } from "svelte";

    let items: NotificationItem[] = $state([]);
    let loading = $state(true);
    let err = $state("");
    let filter = $state<"all" | "unread">("all");

    // Push notification state
    let pushPermission = $state<NotificationPermission>("default");
    let pushBanner = $state("");
    let pushLoading = $state(false);

    async function loadAll() {
        loading = true;
        err = "";
        try {
            items = await api.notifications();
            if (typeof Notification !== "undefined") {
                pushPermission = Notification.permission;
            }
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    async function enablePush() {
        pushBanner = "";
        pushLoading = true;
        try {
            const res = await requestAndSubscribeWebPush();
            if (res.subscribed) {
                pushPermission = "granted";
                pushBanner = "";
            } else {
                pushBanner = res.message ?? "Could not enable web push.";
            }
        } catch (e) {
            pushBanner = e instanceof Error ? e.message : String(e);
        } finally {
            pushLoading = false;
        }
    }

    async function markRead(id: string) {
        try {
            await api.notificationMarkRead(id);
            items = items.map((n) =>
                n.id === id ? { ...n, read_at: new Date().toISOString() } : n,
            );
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        }
    }

    async function markAllRead() {
        try {
            await api.notificationMarkAllRead();
            items = items.map((n) => ({
                ...n,
                read_at: n.read_at ?? new Date().toISOString(),
            }));
        } catch (e) {
            err = e instanceof Error ? e.message : String(e);
        }
    }

    const filteredItems = $derived(
        filter === "unread" ? items.filter((n) => !n.read_at) : items,
    );

    const unreadCount = $derived(items.filter((n) => !n.read_at).length);

    onMount(loadAll);
</script>

<section class="notifications-page">
    <header class="page-header">
        <h1 class="page-title">Notifications</h1>
        <p class="page-subtitle">Consumption guidance and REC updates</p>
    </header>

    <!-- Push notification banners -->
    {#if typeof Notification !== "undefined"}
        {#if pushPermission === "denied"}
            <div class="push-banner push-banner--warning">
                <Icon name="alert-triangle" size={20} />
                <div class="push-banner__content">
                    <strong>Web push is blocked</strong>
                    <p>
                        You can still read notifications here, but you won't
                        receive real-time alerts. Re-enable in your browser's
                        site settings.
                    </p>
                </div>
            </div>
        {:else if pushPermission !== "granted"}
            <div class="push-banner push-banner--info">
                <Icon name="bell" size={20} />
                <div class="push-banner__content">
                    <strong>Enable push notifications</strong>
                    <p>
                        Get "when to consume" alerts delivered directly to your
                        device.
                    </p>
                </div>
                <Button
                    variant="primary"
                    size="sm"
                    onclick={enablePush}
                    disabled={pushLoading}
                >
                    {pushLoading ? "Enabling..." : "Enable"}
                </Button>
            </div>
        {/if}
    {/if}

    {#if pushBanner}
        <div class="push-banner push-banner--warning">
            <Icon name="alert-circle" size={20} />
            <span>{pushBanner}</span>
        </div>
    {/if}

    <div class="toolbar">
        <div class="filter-tabs">
            <button
                class="tab"
                class:active={filter === "all"}
                on:click={() => (filter = "all")}
            >
                All
            </button>
            <button
                class="tab"
                class:active={filter === "unread"}
                on:click={() => (filter = "unread")}
            >
                Unread {#if unreadCount > 0}<span class="badge"
                        >{unreadCount}</span
                    >{/if}
            </button>
        </div>
        {#if unreadCount > 0}
            <button class="mark-all-btn" on:click={markAllRead}
                >Mark all read</button
            >
        {/if}
    </div>

    {#if loading}
        <div class="loading">
            {#each [1, 2, 3] as _}
                <div class="notification-skeleton">
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="40%" />
                </div>
            {/each}
        </div>
    {:else if err}
        <div class="error-banner">
            <Icon name="alert-circle" size={20} />
            <span>{err}</span>
        </div>
    {:else if filteredItems.length === 0}
        <div class="empty-state">
            <Icon name="bell" size={48} />
            <p class="empty-title">
                {filter === "unread"
                    ? "No unread notifications"
                    : "No notifications yet"}
            </p>
            <p class="empty-text">
                You'll see updates about your energy community here
            </p>
        </div>
    {:else}
        <ul class="notification-list">
            {#each filteredItems as n (n.id)}
                <li class="notification-item" class:unread={!n.read_at}>
                    <div class="notification-header">
                        <span class="notification-title">{n.title}</span>
                        <span class="notification-time">
                            {new Date(n.created_at).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                            )}
                        </span>
                    </div>
                    <p class="notification-body">{n.body}</p>
                    <div class="notification-footer">
                        <span class="severity-tag severity--{n.severity}">
                            {n.severity}
                        </span>
                        {#if !n.read_at}
                            <button
                                class="mark-read-btn"
                                on:click={() => markRead(n.id)}
                            >
                                Mark as read
                            </button>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
</section>

<style>
    .notifications-page {
        display: flex;
        flex-direction: column;
        gap: var(--celine-space-md);
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

    /* Push notification banners */
    .push-banner {
        display: flex;
        align-items: flex-start;
        gap: var(--celine-space-md);
        padding: var(--celine-space-md);
        border-radius: var(--celine-radius-lg);
    }

    .push-banner--info {
        background: var(--celine-info-bg);
        color: var(--celine-info-text);
        border: 1px solid var(--celine-info);
    }

    .push-banner--warning {
        background: var(--celine-warning-bg);
        color: var(--celine-warning-text);
        border: 1px solid var(--celine-warning);
    }

    .push-banner__content {
        flex: 1;
    }

    .push-banner__content strong {
        display: block;
        margin-bottom: var(--celine-space-xs);
    }

    .push-banner__content p {
        margin: 0;
        font-size: 0.875rem;
        opacity: 0.9;
    }

    .toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--celine-space-md);
    }

    .filter-tabs {
        display: flex;
        gap: var(--celine-space-xs);
    }

    .tab {
        display: flex;
        align-items: center;
        gap: var(--celine-space-xs);
        padding: var(--celine-space-xs) var(--celine-space-md);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-full);
        background: var(--celine-bg-elevated);
        color: var(--celine-text-secondary);
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all var(--celine-transition-fast);
    }

    .tab:hover {
        border-color: var(--celine-border-strong);
    }

    .tab.active {
        background: var(--celine-primary);
        border-color: var(--celine-primary);
        color: var(--celine-primary-text);
    }

    .badge {
        background: var(--celine-danger);
        color: white;
        font-size: 0.6875rem;
        padding: 2px 6px;
        border-radius: var(--celine-radius-full);
    }

    .tab.active .badge {
        background: rgba(255, 255, 255, 0.3);
    }

    .mark-all-btn {
        padding: var(--celine-space-xs) var(--celine-space-sm);
        border: none;
        background: transparent;
        color: var(--celine-primary);
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
    }

    .mark-all-btn:hover {
        text-decoration: underline;
    }

    .loading,
    .notification-list {
        display: flex;
        flex-direction: column;
        gap: var(--celine-space-sm);
    }

    .notification-skeleton {
        padding: var(--celine-space-md);
        background: var(--celine-bg-elevated);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-lg);
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

    .empty-state {
        text-align: center;
        padding: var(--celine-space-2xl);
        color: var(--celine-text-tertiary);
    }

    .empty-title {
        font-weight: 600;
        color: var(--celine-text);
        margin: var(--celine-space-md) 0 var(--celine-space-xs);
    }

    .empty-text {
        margin: 0;
        font-size: 0.875rem;
    }

    .notification-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }

    .notification-item {
        padding: var(--celine-space-md);
        background: var(--celine-bg-elevated);
        border: 1px solid var(--celine-border);
        border-radius: var(--celine-radius-lg);
        transition: border-color var(--celine-transition-fast);
    }

    .notification-item.unread {
        border-left: 3px solid var(--celine-primary);
    }

    .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--celine-space-xs);
    }

    .notification-title {
        font-weight: 600;
        color: var(--celine-text);
    }

    .notification-time {
        font-size: 0.75rem;
        color: var(--celine-text-tertiary);
    }

    .notification-body {
        color: var(--celine-text-secondary);
        font-size: 0.9375rem;
        margin: 0 0 var(--celine-space-sm);
        line-height: 1.5;
    }

    .notification-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .severity-tag {
        font-size: 0.75rem;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: var(--celine-radius-full);
        text-transform: capitalize;
    }

    .severity--info {
        background: var(--celine-info-bg);
        color: var(--celine-info-text);
    }

    .severity--warning {
        background: var(--celine-warning-bg);
        color: var(--celine-warning-text);
    }

    .severity--critical {
        background: var(--celine-danger-bg);
        color: var(--celine-danger-text);
    }

    .mark-read-btn {
        border: none;
        background: none;
        color: var(--celine-primary);
        font: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
    }

    .mark-read-btn:hover {
        text-decoration: underline;
    }
</style>
