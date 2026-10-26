import adapter from '@sveltejs/adapter-node';

/**
 * Content-Security-Policy, the whole policy, enforced. SvelteKit's inline bootstrap and the
 * theme script in `app.html` get a fresh nonce per request, so `script-src` carries no
 * 'unsafe-inline'. Everything else falls back to `default-src 'self'`; what the calculator
 * loads from elsewhere is named host by host:
 * - img-src: Leaflet's OpenStreetMap tiles (`{s}` in MapPicker's tile URL is a, b or c), the
 *   static map image on the printed results, `data:`/`blob:` for Leaflet's CSS images and
 *   html2canvas (feedback screenshot, PDF).
 * - connect-src: the address search and the reverse geocoding on Nominatim; the API is
 *   same-origin (`/api`).
 * - style-src keeps 'unsafe-inline': Svelte renders `style=` attributes and Leaflet sets inline
 *   styles.
 * The ingress sends no CSP for this host (it would replace this one). docs/development.md,
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
        'img-src': [
          'self',
          'data:',
          'blob:',
          'https://a.tile.openstreetmap.org',
          'https://b.tile.openstreetmap.org',
          'https://c.tile.openstreetmap.org',
          'https://staticmap.openstreetmap.de',
        ],
        'font-src': ['self'],
        'connect-src': ['self', 'https://nominatim.openstreetmap.org'],
        'object-src': ['none'],
        'base-uri': ['self'],
        'form-action': ['self'],
        'frame-ancestors': ['none'],
      },
    },
  },
};
