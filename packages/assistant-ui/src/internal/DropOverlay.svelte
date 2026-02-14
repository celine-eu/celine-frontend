<script lang="ts">
  import { Icon } from '@celine-eu/ui';

  interface Props {
    visible: boolean;
  }

  let { visible }: Props = $props();
</script>

{#if visible}
  <div class="drop-overlay">
    <div class="drop-content">
      <div class="drop-icon">
        <Icon name="upload" size={48} strokeWidth={1.5} />
      </div>
      <p class="drop-text">Drop files here</p>
      <p class="drop-hint">to add them to your message</p>
    </div>
  </div>
{/if}

<style>
  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(13, 148, 136, 0.1);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    border: 3px dashed var(--celine-primary);
    border-radius: var(--celine-radius-lg);
    pointer-events: none;
    animation: fadeIn 0.15s ease;
  }

  .drop-content {
    text-align: center;
    color: var(--celine-primary);
  }

  .drop-icon {
    margin-bottom: var(--celine-space-md);
    animation: bounce 0.6s ease infinite alternate;
  }

  .drop-text {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
  }

  .drop-hint {
    font-size: 0.875rem;
    margin: var(--celine-space-xs) 0 0;
    opacity: 0.8;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes bounce {
    from { transform: translateY(0); }
    to { transform: translateY(-8px); }
  }
</style>
