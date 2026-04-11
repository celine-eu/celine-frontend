<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<div class="denied">
  <div class="denied-card">
    <div class="denied-icon" aria-hidden="true">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    </div>
    <h1>{$_('denied.title')}</h1>
    <p>{$_('denied.body')}</p>
    <a href="/oauth2/sign_out" class="sign-out-btn">{$_('denied.sign_out')}</a>
  </div>
</div>

<style>
  .denied {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    background: var(--celine-bg, #f8fafc);
    padding: 2rem;
  }

  .denied-card {
    background: var(--celine-bg-elevated, #ffffff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 12px;
    padding: 3rem 2.5rem;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  }

  .denied-icon {
    color: var(--celine-text-muted, #64748b);
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: center;
  }

  h1 {
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--celine-text, #1e293b);
    margin-bottom: 0.75rem;
  }

  p {
    font-size: 0.9rem;
    color: var(--celine-text-muted, #64748b);
    line-height: 1.6;
    margin-bottom: 2rem;
  }

  .sign-out-btn {
    display: inline-block;
    padding: 0.5rem 1.5rem;
    border-radius: 6px;
    background: var(--celine-primary, #0d9488);
    color: #fff;
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.15s;
  }

  .sign-out-btn:hover {
    opacity: 0.88;
  }
</style>
