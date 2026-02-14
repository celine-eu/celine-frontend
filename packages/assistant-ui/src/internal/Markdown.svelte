<script lang="ts">
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';

  interface Props {
    text: string;
  }

  let { text = '' }: Props = $props();

  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  const rendered = $derived(marked.parse(text ?? ''));
  const html = $derived(
    typeof rendered === 'string'
      ? DOMPurify.sanitize(rendered, {
          USE_PROFILES: { html: true },
          ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
          ADD_ATTR: ['target', 'rel'],
        })
      : ''
  );
</script>

<div class="assistant-markdown">
  {@html html}
</div>

<style>
  .assistant-markdown {
    line-height: 1.6;
  }

  .assistant-markdown :global(p) {
    margin: 0.6em 0;
  }

  .assistant-markdown :global(p:first-child) {
    margin-top: 0;
  }

  .assistant-markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .assistant-markdown :global(pre) {
    background: var(--celine-bg-sunken, #0f172a);
    color: var(--celine-text, #e5e7eb);
    padding: 12px;
    border-radius: var(--celine-radius-md, 10px);
    overflow-x: auto;
    margin: 0.8em 0;
  }

  .assistant-markdown :global(code) {
    font-family: var(--celine-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    font-size: 0.9em;
  }

  .assistant-markdown :global(:not(pre) > code) {
    background: var(--celine-bg-sunken, #f1f5f9);
    padding: 0.15em 0.4em;
    border-radius: 4px;
  }

  .assistant-markdown :global(a) {
    color: var(--celine-primary, #2563eb);
    text-decoration: underline;
  }

  .assistant-markdown :global(a:hover) {
    text-decoration: none;
  }

  .assistant-markdown :global(ul),
  .assistant-markdown :global(ol) {
    margin: 0.6em 0;
    padding-left: 1.4em;
  }

  .assistant-markdown :global(li) {
    margin: 0.25em 0;
  }

  .assistant-markdown :global(blockquote) {
    margin: 0.6em 0;
    padding-left: 1em;
    border-left: 3px solid var(--celine-border, #e2e8f0);
    color: var(--celine-text-secondary, #334155);
  }

  .assistant-markdown :global(table) {
    border-collapse: collapse;
    margin: 0.8em 0;
    width: 100%;
    font-size: 0.9em;
  }

  .assistant-markdown :global(th),
  .assistant-markdown :global(td) {
    border: 1px solid var(--celine-border, #e2e8f0);
    padding: 8px 12px;
    vertical-align: top;
    text-align: left;
  }

  .assistant-markdown :global(th) {
    background: var(--celine-bg-sunken, #f8fafc);
    font-weight: 600;
  }

  .assistant-markdown :global(h1),
  .assistant-markdown :global(h2),
  .assistant-markdown :global(h3),
  .assistant-markdown :global(h4) {
    margin: 1em 0 0.5em;
    font-weight: 600;
    line-height: 1.3;
  }

  .assistant-markdown :global(h1) { font-size: 1.4em; }
  .assistant-markdown :global(h2) { font-size: 1.25em; }
  .assistant-markdown :global(h3) { font-size: 1.1em; }
  .assistant-markdown :global(h4) { font-size: 1em; }

  .assistant-markdown :global(hr) {
    border: none;
    border-top: 1px solid var(--celine-border, #e2e8f0);
    margin: 1em 0;
  }

  .assistant-markdown :global(img) {
    max-width: 100%;
    border-radius: var(--celine-radius-md, 10px);
  }
</style>
