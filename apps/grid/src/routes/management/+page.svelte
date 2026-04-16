<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import {
    getAlertRules,
    createAlertRule,
    updateAlertRule,
    deleteAlertRule,
    getNotificationSettings,
    updateNotificationSettings,
    type AlertRule,
  } from '$lib/api';

  // ---------------------------------------------------------------------------
  // Alert rules
  // ---------------------------------------------------------------------------

  let rules = $state<AlertRule[]>([]);
  let editingId = $state<string | null>(null);
  let saving = $state<string | null>(null);

  // Draft edits — keyed by rule id
  let drafts = $state<Record<string, Partial<AlertRule>>>({});

  onMount(async () => {
    rules = await getAlertRules();
    const ns = await getNotificationSettings();
    notifEmail = ns.email_recipients ?? '';
    notifWebhook = ns.webhook_url ?? '';
  });

  function startEdit(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (rule) drafts[id] = { ...rule };
    editingId = id;
  }

  async function addRule() {
    const created = await createAlertRule({
      risk_types: ['wind'],
      threshold: 'ALERT',
      recipients: '',
      active: true,
    });
    rules = [...rules, created];
    startEdit(created.id);
  }

  async function saveRule(id: string) {
    saving = id;
    try {
      const draft = drafts[id] ?? {};
      const updated = await updateAlertRule(id, {
        risk_types: draft.risk_types,
        threshold: draft.threshold,
        recipients: draft.recipients,
        active: draft.active,
      });
      rules = rules.map((r) => (r.id === id ? updated : r));
      editingId = null;
    } finally {
      saving = null;
    }
  }

  async function removeRule(id: string) {
    await deleteAlertRule(id);
    rules = rules.filter((r) => r.id !== id);
    if (editingId === id) editingId = null;
  }

  async function toggleActive(id: string) {
    const rule = rules.find((r) => r.id === id)!;
    const updated = await updateAlertRule(id, { active: !rule.active });
    rules = rules.map((r) => (r.id === id ? updated : r));
  }

  function draftRiskTypes(id: string): ('wind' | 'heat')[] {
    return (drafts[id]?.risk_types ?? rules.find((r) => r.id === id)?.risk_types ?? []) as ('wind' | 'heat')[];
  }

  function toggleDraftRiskType(id: string, type: 'wind' | 'heat') {
    const current = draftRiskTypes(id);
    const has = current.includes(type);
    const next = has ? current.filter((t) => t !== type) : [...current, type];
    if (next.length === 0) return; // must keep at least one
    drafts[id] = { ...(drafts[id] ?? {}), risk_types: next };
  }

  // ---------------------------------------------------------------------------
  // Notification settings
  // ---------------------------------------------------------------------------

  let notifEmail = $state('');
  let notifWebhook = $state('');
  let savingNotif = $state(false);

  async function saveNotifSettings() {
    savingNotif = true;
    try {
      await updateNotificationSettings({
        email_recipients: notifEmail || null,
        webhook_url: notifWebhook || null,
      });
    } finally {
      savingNotif = false;
    }
  }
</script>

<div class="mgmt-page">
  <div class="mgmt-header">
    <h1>{$_('management.title')}</h1>
  </div>

  <section class="section">
    <div class="section-header">
      <h2>{$_('management.rules')}</h2>
      <button class="btn-primary" onclick={addRule}>{$_('management.add_rule')}</button>
    </div>

    <div class="rules-table-wrap">
      <table class="rules-table">
        <thead>
          <tr>
            <th>{$_('management.risk_type')}</th>
            <th>{$_('management.threshold')}</th>
            <th>{$_('management.recipients')}</th>
            <th>{$_('management.active')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each rules as rule (rule.id)}
            <tr class:editing={editingId === rule.id}>
              <td>
                {#if editingId === rule.id}
                  <div class="risk-checks">
                    <label>
                      <input
                        type="checkbox"
                        checked={draftRiskTypes(rule.id).includes('wind')}
                        onchange={() => toggleDraftRiskType(rule.id, 'wind')}
                      /> Wind
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={draftRiskTypes(rule.id).includes('heat')}
                        onchange={() => toggleDraftRiskType(rule.id, 'heat')}
                      /> Heat
                    </label>
                  </div>
                {:else}
                  {rule.risk_types.join(', ')}
                {/if}
              </td>
              <td>
                {#if editingId === rule.id}
                  <select bind:value={drafts[rule.id].threshold}>
                    <option value="ALERT">ALERT</option>
                    <option value="WARNING">WARNING</option>
                  </select>
                {:else}
                  <span
                    class="badge"
                    class:badge-alert={rule.threshold === 'ALERT'}
                    class:badge-warning={rule.threshold === 'WARNING'}
                  >
                    {rule.threshold}
                  </span>
                {/if}
              </td>
              <td>
                {#if editingId === rule.id}
                  <input
                    type="text"
                    bind:value={drafts[rule.id].recipients}
                    placeholder="email1@example.com, email2@example.com"
                    class="wide-input"
                  />
                {:else}
                  <span class="recipients-cell">{rule.recipients || '—'}</span>
                {/if}
              </td>
              <td>
                <label class="toggle-switch">
                  <input type="checkbox" checked={rule.active} onchange={() => toggleActive(rule.id)} />
                  <span class="slider"></span>
                </label>
              </td>
              <td class="row-actions">
                {#if editingId === rule.id}
                  <button class="btn-sm btn-primary" disabled={saving === rule.id} onclick={() => saveRule(rule.id)}>
                    {saving === rule.id ? '…' : 'Save'}
                  </button>
                {:else}
                  <button class="btn-sm btn-ghost" onclick={() => startEdit(rule.id)}>Edit</button>
                {/if}
                <button class="btn-sm btn-danger" onclick={() => removeRule(rule.id)}>Delete</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>

  <section class="section">
    <div class="section-header">
      <h2>{$_('management.notifications')}</h2>
    </div>
    <div class="notif-form">
      <div class="form-group">
        <label for="notif-email">Email recipients (global)</label>
        <input id="notif-email" type="text" bind:value={notifEmail} placeholder="ops@example.com" />
      </div>
      <div class="form-group">
        <label for="notif-webhook">Webhook URL</label>
        <input id="notif-webhook" type="url" bind:value={notifWebhook} placeholder="https://hooks.example.com/..." />
      </div>
      <button class="btn-primary" disabled={savingNotif} onclick={saveNotifSettings}>
        {savingNotif ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  </section>
</div>

<style>
  .mgmt-page {
    padding: 1.5rem;
    max-width: 1100px;
    height: 100%;
    overflow-y: auto;
  }

  .mgmt-header h1 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--celine-text, #1e293b);
    margin-bottom: 1.5rem;
  }

  .section {
    margin-bottom: 2rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .section-header h2 {
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--celine-text, #1e293b);
  }

  .rules-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
  }

  .rules-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }

  .rules-table th {
    padding: 0.625rem 0.875rem;
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--celine-text-muted, #64748b);
    background: var(--celine-bg, #f8fafc);
    border-bottom: 1px solid var(--celine-border, #e2e8f0);
  }

  .rules-table td {
    padding: 0.625rem 0.875rem;
    border-bottom: 1px solid var(--celine-border, #e2e8f0);
    color: var(--celine-text, #1e293b);
    vertical-align: middle;
  }

  .rules-table tbody tr:last-child td {
    border-bottom: none;
  }

  .rules-table tr.editing td {
    background: var(--celine-bg, #f8fafc);
  }

  .rules-table select,
  .rules-table input[type='text'] {
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    background: var(--celine-bg-elevated, #fff);
    color: var(--celine-text, #1e293b);
  }

  .wide-input { width: 100%; min-width: 200px; }

  .risk-checks {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.875rem;
  }

  .risk-checks label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
  }

  .badge {
    padding: 0.2rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    color: #fff;
  }

  .badge-alert { background: #D00000; }
  .badge-warning { background: #c49a00; color: #1e293b; }

  .recipients-cell {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  /* Toggle switch */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 36px;
    height: 20px;
  }

  .toggle-switch input { opacity: 0; width: 0; height: 0; }

  .slider {
    position: absolute;
    inset: 0;
    background: #cbd5e1;
    border-radius: 999px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .slider::before {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    left: 3px;
    top: 3px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .toggle-switch input:checked + .slider { background: var(--celine-primary, #0d9488); }
  .toggle-switch input:checked + .slider::before { transform: translateX(16px); }

  /* Buttons */
  .row-actions {
    display: flex;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .btn-primary {
    padding: 0.375rem 1rem;
    background: var(--celine-primary, #0d9488);
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-primary:hover { filter: brightness(1.1); }

  .btn-sm { padding: 0.25rem 0.625rem; font-size: 0.75rem; border-radius: 5px; border: none; cursor: pointer; font-weight: 600; }
  .btn-sm.btn-primary { background: var(--celine-primary, #0d9488); color: #fff; }
  .btn-sm.btn-ghost { background: transparent; border: 1px solid var(--celine-border, #e2e8f0); color: var(--celine-text-muted, #64748b); }
  .btn-sm.btn-ghost:hover { background: var(--celine-bg-hover, #f1f5f9); }
  .btn-sm.btn-danger { background: #fee2e2; color: #b91c1c; }
  .btn-sm.btn-danger:hover { background: #fecaca; }

  /* Notification form */
  .notif-form {
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    max-width: 480px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .form-group label {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--celine-text-muted, #64748b);
  }

  .form-group input {
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    padding: 0.4375rem 0.75rem;
    font-size: 0.875rem;
    background: var(--celine-bg, #f8fafc);
    color: var(--celine-text, #1e293b);
  }
</style>
