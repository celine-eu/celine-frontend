<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { env } from '$env/dynamic/public';
  import { ChatCore } from '@celine-eu/assistant-ui';
  import { t } from 'svelte-i18n';

  // Get conversation_id from URL if present
  const conversationId = $derived($page.url.searchParams.get('conversation_id'));
  // This app knows no community, so it cannot link one community's notice: the
  // deployment's explicit setting wins; otherwise the legal host's privacy page, which
  // lists every community's notice; otherwise `/privacy` as before.
  const legalBase = (env.PUBLIC_LEGAL_BASE_URL || '').replace(/\/+$/, '');
  const privacyPolicyUrl =
    env.PUBLIC_PRIVACY_POLICY_URL || (legalBase ? `${legalBase}/privacy/` : '/privacy');
</script>

<svelte:head>
  <title>{$t('assistant.page_title')}</title>
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
    {privacyPolicyUrl}
    onConversationChange={(id) => {
      // Update URL without reload
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('conversation_id', id);
      } else {
        url.searchParams.delete('conversation_id');
      }
      replaceState(url, {});
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
