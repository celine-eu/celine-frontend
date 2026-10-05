import adapter from '@sveltejs/adapter-node';

/**
 * Content-Security-Policy: the app sends it, not the ingress — SvelteKit's inline bootstrap
 * gets a fresh nonce per request, so `script-src` carries no 'unsafe-inline'.
 * docs/development.md, "Content-Security-Policy".
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
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};
