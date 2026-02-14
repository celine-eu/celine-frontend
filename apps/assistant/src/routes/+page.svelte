<script lang="ts">
  import { page } from '$app/stores';
  import { ChatCore } from '@celine-eu/assistant-ui';

  // Get conversation_id from URL if present
  const conversationId = $derived($page.url.searchParams.get('conversation_id'));
</script>

<svelte:head>
  <title>CELINE Assistant</title>
</svelte:head>

<main class="chat-page">
  <ChatCore
    apiBaseUrl="/api"
    mode="full"
    showHeader={true}
    enableHistory={true}
    enableAttachments={true}
    enableUpload={true}
    enableCitations={true}
    conversationId={conversationId}
    onConversationChange={(id) => {
      // Update URL without reload
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('conversation_id', id);
      } else {
        url.searchParams.delete('conversation_id');
      }
      window.history.replaceState({}, '', url);
    }}
  />
</main>

<style>
  .chat-page {
    height: 100vh;
    height: 100dvh;
    max-width: 80em;
    margin: 0 auto;
  }
</style>
