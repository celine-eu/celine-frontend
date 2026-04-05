<script lang="ts">
  import { page } from "$app/state";
  import { Icon } from "@celine-eu/ui";
  import { t } from "svelte-i18n";

  const me = $derived(page.data.me);
  const community = $derived(page.data.community);
</script>

<section class="profile-page">
  <header class="page-header">
    <h1 class="page-title">{$t('profile.title')}</h1>
    <p class="page-subtitle">{$t('profile.subtitle')}</p>
  </header>

  <!-- Identity card -->
  <div class="section-card">
    <div class="avatar-row">
      <div class="avatar">
        {#if me?.user?.name}
          {me.user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
        {:else}
          ?
        {/if}
      </div>
      <div>
        {#if me?.user?.name}
          <p class="user-name">{me.user.name}</p>
        {/if}
        {#if me?.user?.email}
          <p class="user-email">{me.user.email}</p>
        {/if}
      </div>
    </div>

    <div class="info-list">
      {#if community}
        <div class="info-row">
          <span class="info-label">
            <Icon name="leaf" size={14} class="info-icon" />
            {$t('profile.community')}
          </span>
          <span class="info-value">{community.name}</span>
        </div>
      {/if}
      <div class="info-row">
        <span class="info-label">
          <Icon name="shield-check" size={14} class="info-icon" />
          {$t('profile.status')}
        </span>
        <span class="info-value info-value--badge">
          <Icon name="check-circle" size={12} class="status-icon" />
          {$t('profile.status_active')}
        </span>
      </div>
    </div>
  </div>

  <!-- Placeholder for future account management -->
  <div class="section-card placeholder-card">
    <Icon name="settings" size={32} class="placeholder-icon" />
    <p class="placeholder-title">{$t('profile.management_title')}</p>
    <p class="placeholder-body">{$t('profile.management_body')}</p>
  </div>
</section>

<style>
  .profile-page {
    display: flex;
    flex-direction: column;
    gap: var(--celine-space-lg);
  }

  .page-header { margin-bottom: var(--celine-space-sm); }

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
    padding: var(--celine-space-lg);
  }

  /* Avatar row */
  .avatar-row {
    display: flex;
    align-items: center;
    gap: var(--celine-space-md);
    margin-bottom: var(--celine-space-lg);
  }

  .avatar {
    width: 56px;
    height: 56px;
    border-radius: 999px;
    background: var(--celine-primary);
    color: #fff;
    font-size: 1.125rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .user-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--celine-text);
    margin: 0 0 2px;
  }

  .user-email {
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    margin: 0;
  }

  /* Info list */
  .info-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid var(--celine-border);
  }

  .info-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--celine-space-sm) 0;
    border-bottom: 1px solid var(--celine-border);
    gap: var(--celine-space-md);
  }

  .info-row:last-child { border-bottom: none; }

  .info-label {
    display: flex;
    align-items: center;
    gap: var(--celine-space-xs);
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
  }

  :global(.info-icon) { color: var(--celine-text-tertiary); }

  .info-value {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--celine-text);
  }

  .info-value--badge {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--celine-success, #10b981);
    font-weight: 600;
    font-size: 0.8125rem;
  }

  :global(.status-icon) { color: var(--celine-success, #10b981); }

  /* Placeholder */
  .placeholder-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--celine-space-xl);
    gap: var(--celine-space-sm);
    border-style: dashed;
  }

  :global(.placeholder-icon) {
    color: var(--celine-text-tertiary);
    opacity: 0.4;
  }

  .placeholder-title {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--celine-text);
    margin: 0;
  }

  .placeholder-body {
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
    margin: 0;
    max-width: 300px;
  }

  @media (min-width: 640px) {
    .section-card { padding: var(--celine-space-xl); }
    .page-title { font-size: 1.75rem; }
  }
</style>
