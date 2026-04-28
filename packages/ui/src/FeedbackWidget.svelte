<script lang="ts">
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Modal from './Modal.svelte';

  type FeedbackContext = {
    page_url: string;
    page_title?: string | null;
    page_path?: string | null;
    locale?: string | null;
    timezone?: string | null;
    user_agent?: string | null;
    viewport_width?: number | null;
    viewport_height?: number | null;
    screen_width?: number | null;
    screen_height?: number | null;
    color_scheme?: 'light' | 'dark' | null;
    client_timestamp?: string | null;
    extra?: Record<string, unknown>;
  };

  type FeedbackScreenshot = {
    mime_type: string;
    data_base64: string;
  };

  export type FeedbackSubmission = {
    rating: number;
    comment: string;
    context: FeedbackContext;
    screenshot?: FeedbackScreenshot | null;
  };

  type FeedbackWidgetLabels = {
    rating: string;
    comment: string;
    commentPlaceholder: string;
    currentSelection: string;
    close: string;
    submit: string;
    success: string;
  };

  interface Props {
    submitFeedback: (payload: FeedbackSubmission) => Promise<void>;
    collectContext: () => Promise<{ context: FeedbackContext; screenshot?: FeedbackScreenshot | null }>;
    buttonLabel?: string;
    title?: string;
    description?: string;
    labels?: Partial<FeedbackWidgetLabels>;
    class?: string;
  }

  let {
    submitFeedback,
    collectContext,
    buttonLabel = 'Feedback',
    title = 'Lascia un feedback',
    description = 'Valuta la pagina e aggiungi un commento utile per debug e miglioramenti.',
    labels = {},
    class: className = '',
  }: Props = $props();

  const resolvedLabels: FeedbackWidgetLabels = $derived.by(() => ({
    rating: labels.rating ?? 'Valutazione',
    comment: labels.comment ?? 'Commento',
    commentPlaceholder: labels.commentPlaceholder ?? 'Descrivi cosa ha funzionato o cosa è andato storto.',
    currentSelection: labels.currentSelection ?? 'Selezione corrente',
    close: labels.close ?? 'Chiudi',
    submit: labels.submit ?? 'Invia',
    success: labels.success ?? 'Feedback inviato correttamente.',
  }));

  let open = $state(false);
  let rating = $state(0);
  let comment = $state('');
  let loading = $state(false);
  let error = $state('');
  let success = $state('');

  function resetForm(): void {
    rating = 0;
    comment = '';
    error = '';
    success = '';
  }

  function close(): void {
    open = false;
    resetForm();
  }

  function openWidget(): void {
    open = true;
    error = '';
    success = '';
  }

  async function handleSubmit(): Promise<void> {
    loading = true;
    error = '';
    success = '';

    try {
      const diagnostics = await collectContext();
      await submitFeedback({
        rating,
        comment: comment.trim(),
        context: diagnostics.context,
        screenshot: diagnostics.screenshot ?? null,
      });
      success = resolvedLabels.success;
      rating = 0;
      comment = '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invio non riuscito';
    } finally {
      loading = false;
    }
  }

  function starsLabel(value: number): string {
    if (value === 0) return '0 stelle';
    if (value === 1) return '1 stella';
    return `${value} stelle`;
  }
</script>

<div class="feedback-widget {className}" data-feedback-widget-root>
  <button class="feedback-widget__trigger" type="button" onclick={openWidget}>
    <Icon name="message-square" size={18} />
    <span>{buttonLabel}</span>
  </button>

  <Modal open={open} title={title} size="md" onClose={close}>
    <div class="feedback-widget__body">
      <p class="feedback-widget__description">{description}</p>

      <div class="feedback-widget__group">
        <label class="feedback-widget__label">{resolvedLabels.rating}</label>
        <div class="feedback-widget__rating" role="radiogroup" aria-label={resolvedLabels.rating}>
          {#each [1, 2, 3, 4, 5] as value}
            <button
              type="button"
              class="feedback-widget__star"
              onclick={() => rating = value}
              aria-label={starsLabel(value)}
              aria-pressed={rating === value}
              title={starsLabel(value)}
            >
              <span
                class="feedback-widget__star-icon"
                class:feedback-widget__star-icon--filled={value <= rating}
              >
                <Icon name="star" size={22} />
              </span>
            </button>
          {/each}
        </div>
        <div class="feedback-widget__hint">{resolvedLabels.currentSelection}: {starsLabel(rating)}</div>
      </div>

      <div class="feedback-widget__group">
        <label class="feedback-widget__label" for="feedback-comment">{resolvedLabels.comment}</label>
        <textarea
          id="feedback-comment"
          class="feedback-widget__textarea"
          bind:value={comment}
          rows={6}
          maxlength={4000}
          placeholder={resolvedLabels.commentPlaceholder}
        ></textarea>
      </div>

      {#if error}
        <p class="feedback-widget__status feedback-widget__status--error">{error}</p>
      {/if}
      {#if success}
        <p class="feedback-widget__status feedback-widget__status--success">{success}</p>
      {/if}
    </div>

    {#snippet footer()}
      <Button variant="ghost" onclick={close}>{resolvedLabels.close}</Button>
      <Button variant="primary" loading={loading} onclick={handleSubmit}>{resolvedLabels.submit}</Button>
    {/snippet}
  </Modal>
</div>

<style>
  .feedback-widget__trigger {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: var(--celine-z-floating);
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: 0;
    border-radius: var(--celine-radius-full);
    background: var(--celine-primary);
    color: var(--celine-primary-text);
    box-shadow: var(--celine-shadow-lg);
    cursor: pointer;
    font: inherit;
  }

  .feedback-widget__trigger:hover {
    background: var(--celine-primary-hover);
  }

  .feedback-widget__body {
    display: grid;
    gap: var(--celine-space-lg);
  }

  .feedback-widget__description {
    margin: 0;
    color: var(--celine-text-secondary);
  }

  .feedback-widget__group {
    display: grid;
    gap: var(--celine-space-sm);
  }

  .feedback-widget__label {
    font-weight: 600;
    color: var(--celine-text);
  }

  .feedback-widget__rating {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .feedback-widget__star {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: 0;
    border-radius: var(--celine-radius-full);
    background: transparent;
    color: var(--celine-text-tertiary);
    cursor: pointer;
  }

  .feedback-widget__star:hover {
    background: var(--celine-bg-hover);
  }

  .feedback-widget__star-icon {
    display: inline-flex;
    color: var(--celine-text-tertiary);
    transition: color var(--celine-transition-fast);
  }

  .feedback-widget__star-icon--filled {
    color: #f59e0b;
  }

  .feedback-widget__hint {
    font-size: 0.875rem;
    color: var(--celine-text-secondary);
  }

  .feedback-widget__textarea {
    width: 100%;
    min-height: 8rem;
    padding: 0.875rem 1rem;
    border: 1px solid var(--celine-border);
    border-radius: var(--celine-radius-md);
    background: var(--celine-bg);
    color: var(--celine-text);
    box-sizing: border-box;
    resize: vertical;
    font: inherit;
  }

  .feedback-widget__status {
    margin: 0;
    font-size: 0.9375rem;
  }

  .feedback-widget__status--error {
    color: var(--celine-danger);
  }

  .feedback-widget__status--success {
    color: var(--celine-success);
  }

  @media (max-width: 640px) {
    .feedback-widget__trigger {
      right: 0.75rem;
      bottom: 0.75rem;
      padding: 0.75rem;
    }

    .feedback-widget__trigger span {
      display: none;
    }
  }
</style>
