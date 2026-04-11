<script lang="ts">
  interface Props {
    options: string[];
    selected: string[];
    placeholder?: string;
  }

  let { options, selected = $bindable([]), placeholder = 'Search…' }: Props = $props();

  let query = $state('');
  let open = $state(false);
  let root: HTMLDivElement;
  let inputEl: HTMLInputElement;

  const filtered = $derived(
    options
      .filter((o) => !selected.includes(o) && o.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20)
  );

  function pick(val: string) {
    selected = [...selected, val];
    query = '';
    inputEl?.focus();
  }

  function remove(val: string) {
    selected = selected.filter((s) => s !== val);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { open = false; return; }
    if (e.key === 'Backspace' && !query && selected.length) {
      selected = selected.slice(0, -1);
    }
    if (e.key === 'Enter' && filtered.length) {
      pick(filtered[0]);
    }
  }

  $effect(() => {
    if (!open) return;
    function handleOutside(e: PointerEvent) {
      if (!root?.contains(e.target as Node)) open = false;
    }
    document.addEventListener('pointerdown', handleOutside, true);
    return () => document.removeEventListener('pointerdown', handleOutside, true);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="ac-root" bind:this={root}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="ac-field" onclick={() => { open = true; inputEl?.focus(); }}>
    {#each selected as s}
      <span class="ac-tag">
        {s}
        <button
          class="ac-tag-remove"
          tabindex="-1"
          onclick={(e) => { e.stopPropagation(); remove(s); }}
        >×</button>
      </span>
    {/each}
    <input
      bind:this={inputEl}
      bind:value={query}
      {placeholder}
      class="ac-input"
      onfocus={() => (open = true)}
      onkeydown={onKeydown}
    />
  </div>
  {#if open && filtered.length > 0}
    <ul class="ac-dropdown">
      {#each filtered as opt}
        <li>
          <button
            class="ac-option"
            onmousedown={(e) => { e.preventDefault(); pick(opt); }}
          >{opt}</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .ac-root {
    position: relative;
    width: 100%;
  }

  .ac-field {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
    min-height: 32px;
    padding: 0.25rem 0.375rem;
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    background: var(--celine-bg, #f8fafc);
    cursor: text;
  }

  .ac-field:focus-within {
    border-color: var(--celine-primary, #0d9488);
    outline: none;
  }

  .ac-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.125rem 0.375rem;
    background: var(--celine-primary, #0d9488);
    color: #fff;
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 500;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ac-tag-remove {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    padding: 0;
    font-size: 0.75rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .ac-tag-remove:hover {
    color: #fff;
  }

  .ac-input {
    flex: 1;
    min-width: 60px;
    border: none;
    background: transparent;
    font-size: 0.8rem;
    color: var(--celine-text, #1e293b);
    outline: none;
    padding: 0;
  }

  .ac-input::placeholder {
    color: var(--celine-text-muted, #94a3b8);
  }

  .ac-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--celine-bg-elevated, #fff);
    border: 1px solid var(--celine-border, #e2e8f0);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    max-height: 180px;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0.25rem 0;
  }

  .ac-option {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.375rem 0.75rem;
    font-size: 0.8rem;
    color: var(--celine-text, #1e293b);
    background: none;
    border: none;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ac-option:hover {
    background: var(--celine-bg-hover, #f1f5f9);
  }
</style>
