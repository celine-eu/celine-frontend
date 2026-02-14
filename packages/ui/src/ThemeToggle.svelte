<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import Icon from './Icon.svelte';

  let theme: 'light' | 'dark' = $state('light');

  function setTheme(newTheme: 'light' | 'dark') {
    theme = newTheme;
    if (browser) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('celine-theme', theme);
    }
  }

  function toggle() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  onMount(() => {
    // Check saved preference or system preference
    const saved = localStorage.getItem('celine-theme');
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
    }

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('celine-theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  });
</script>

<button
  class="celine-theme-toggle"
  onclick={toggle}
  aria-label="Toggle {theme === 'light' ? 'dark' : 'light'} mode"
  title="Toggle {theme === 'light' ? 'dark' : 'light'} mode"
>
  {#if theme === 'light'}
    <Icon name="moon" size={20} />
  {:else}
    <Icon name="sun" size={20} />
  {/if}
</button>

<style>
  .celine-theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: none;
    border-radius: var(--celine-radius-md);
    background: var(--celine-bg-hover);
    color: var(--celine-text-secondary);
    cursor: pointer;
    transition: all var(--celine-transition-fast);
  }

  .celine-theme-toggle:hover {
    background: var(--celine-bg-sunken);
    color: var(--celine-text);
  }

  .celine-theme-toggle:focus-visible {
    outline: 2px solid var(--celine-primary);
    outline-offset: 2px;
  }
</style>
