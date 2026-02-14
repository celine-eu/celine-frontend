<script lang="ts">
  /**
   * Skeleton component for loading states
   */
  type SkeletonVariant = 'text' | 'heading' | 'avatar' | 'card' | 'rect';
  
  interface Props {
    variant?: SkeletonVariant;
    width?: string;
    height?: string;
    lines?: number;
    class?: string;
  }
  
  let { 
    variant = 'text', 
    width = '', 
    height = '',
    lines = 1,
    class: className = ''
  }: Props = $props();
</script>

{#if variant === 'card'}
  <div class="celine-skeleton-card {className}">
    <div class="celine-skeleton" style="width: 40%; height: 1.25rem;"></div>
    <div class="celine-skeleton" style="width: 100%; height: 1rem; margin-top: 1rem;"></div>
    <div class="celine-skeleton" style="width: 80%; height: 1rem; margin-top: 0.5rem;"></div>
  </div>
{:else if variant === 'avatar'}
  <div 
    class="celine-skeleton celine-skeleton--avatar {className}" 
    style:width={width || '40px'} 
    style:height={height || '40px'}
  ></div>
{:else if variant === 'heading'}
  <div 
    class="celine-skeleton celine-skeleton--heading {className}" 
    style:width={width || '60%'}
    style:height={height || '1.5em'}
  ></div>
{:else if variant === 'rect'}
  <div 
    class="celine-skeleton celine-skeleton--rect {className}" 
    style:width={width || '100%'}
    style:height={height || '200px'}
  ></div>
{:else}
  {#each Array(lines) as _, i}
    <div 
      class="celine-skeleton celine-skeleton--text {className}" 
      style:width={i === lines - 1 && lines > 1 ? '70%' : width || '100%'}
      style:margin-bottom={i < lines - 1 ? '0.5rem' : '0'}
    ></div>
  {/each}
{/if}

<style>
  .celine-skeleton {
    background: linear-gradient(
      90deg,
      var(--celine-skeleton-base) 25%,
      var(--celine-skeleton-shine) 50%,
      var(--celine-skeleton-base) 75%
    );
    background-size: 200% 100%;
    animation: celine-skeleton-shimmer 1.5s ease-in-out infinite;
    border-radius: var(--celine-radius-sm);
  }

  .celine-skeleton--text {
    height: 1em;
  }

  .celine-skeleton--heading {
    height: 1.5em;
  }

  .celine-skeleton--avatar {
    border-radius: 50%;
  }

  .celine-skeleton--rect {
    border-radius: var(--celine-radius-md);
  }

  .celine-skeleton-card {
    background: var(--celine-bg-elevated);
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-lg);
    padding: var(--celine-space-lg);
  }

  @keyframes celine-skeleton-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
</style>
