import adapter from '@sveltejs/adapter-node';

/**
 * Content-Security-Policy: the app sends it, not the ingress. SvelteKit renders every page on
 * request and gives its inline bootstrap — and the theme script in `app.html` — a fresh nonce,
 * so `script-src` carries no 'unsafe-inline'. The ingress may not send this header as well:
 * ingress-nginx's `custom-headers` replaces a header of the same name. Styles keep
 * 'unsafe-inline' for Svelte's `style=` attributes and transitions. docs/development.md,
 * "Content-Security-Policy".
 */
export default {
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'nonce',
      directives: {
        'default-src': ['self'],
        'script-src': ['self'],
        'style-src': ['self', 'unsafe-inline'],
        'img-src': ['self', 'data:', 'blob:'],
        'font-src': ['self'],
        'connect-src': ['self'],
        'worker-src': ['self'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};
