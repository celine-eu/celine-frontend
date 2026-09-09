import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Liveness/readiness endpoint for the container probes.
 *
 * The probes used to hit `/`, which renders the layout on the server and fetches
 * `/api/me` against the pod's own address, where no BFF answers. Every probe therefore
 * logged `[500] GET /api/me — TypeError: fetch failed` (about once a minute in staging,
 * for months) while still returning 200 for the page. A probe should prove the Node
 * server answers, nothing more; the BFF has its own health check.
 */
export const GET: RequestHandler = () => json({ status: 'ok' });
