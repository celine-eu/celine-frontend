import { setupI18n } from '$lib/i18n';
import { waitLocale } from 'svelte-i18n';

export const load = async () => {
  try {
    setupI18n();
    await waitLocale();
  } catch {
    // i18n setup failed — page will render with fallback keys
  }
};
