<script lang="ts">
  import { _ } from 'svelte-i18n';

  // ---------------------------------------------------------------------------
  // Alert rule types
  // ---------------------------------------------------------------------------

  interface AlertRule {
    id: string;
    risk_type: 'wind' | 'heat';
    threshold: 'ALERT' | 'WARNING';
    operational_unit: string;
    recipients: string;
    active: boolean;
  }

  let rules = $state<AlertRule[]>([
    {
      id: '1',
      risk_type: 'wind',
      threshold: 'ALERT',
      operational_unit: '',
      recipients: '',
      active: true,
    },
  ]);

  let editingId = $state<string | null>(null);

  function addRule() {
    const id = String(Date.now());
    rules = [
      ...rules,
      {
        id,
        risk_type: 'wind',
        threshold: 'ALERT',
        operational_unit: '',
        recipients: '',
        active: true,
      },
    ];
    editingId = id;
  }

  function removeRule(id: string) {
    rules = rules.filter((r) => r.id !== id);
  }

  function toggleActive(id: string) {
    rules = rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r));
  }

  function saveRule(id: string) {
    editingId = null;
    // TODO: persist via API call
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
            <th>{$_('filter.unit')}</th>
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
                  <select bind:value={rule.risk_type}>
                    <option value="wind">Wind</option>
                    <option value="heat">Heat</option>
                  </select>
                {:else}
                  {rule.risk_type}
                {/if}
              </td>
              <td>
                {#if editingId === rule.id}
                  <select bind:value={rule.threshold}>
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
                  <input type="text" bind:value={rule.operational_unit} placeholder="All" />
                {:else}
                  {rule.operational_unit || $_('filter.all')}
                {/if}
              </td>
              <td>
                {#if editingId === rule.id}
                  <input
                    type="text"
                    bind:value={rule.recipients}
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
                  <button class="btn-sm btn-primary" onclick={() => saveRule(rule.id)}>Save</button>
                {:else}
                  <button class="btn-sm btn-ghost" onclick={() => (editingId = rule.id)}>Edit</button>
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
        <input id="notif-email" type="text" placeholder="ops@example.com" />
      </div>
      <div class="form-group">
        <label for="notif-webhook">Webhook URL</label>
        <input id="notif-webhook" type="url" placeholder="https://hooks.example.com/..." />
      </div>
      <button class="btn-primary">Save settings</button>
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
  .rules-table input[type='text'],
  .rules-table input[type='url'] {
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;
    background: var(--celine-bg-elevated, #fff);
    color: var(--celine-text, #1e293b);
  }

  .wide-input { width: 100%; min-width: 200px; }

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
