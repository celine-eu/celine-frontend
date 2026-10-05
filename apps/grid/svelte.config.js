import adapter from '@sveltejs/adapter-node';

/**
 * Content-Security-Policy, scripts only: SvelteKit's inline bootstrap and the theme script in
 * `app.html` get a fresh nonce per request, so `script-src` carries no 'unsafe-inline'. MapLibre
 * starts its worker from a `blob:` URL (worker-src, child-src). The other directives are still
 * on trial: the ingress sends them as Content-Security-Policy-Report-Only.
 * docs/development.md, "Content-Security-Policy".
 */
export default {
  kit: {
    adapter: adapter(),
    csp: {
      mode: 'nonce',
      directives: {
        'script-src': ['self'],
        'worker-src': ['self', 'blob:'],
        'child-src': ['self', 'blob:'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};
