import { browser, dev } from '$app/environment';
import { env } from '$env/dynamic/public';

// Default values

export const DEFAULT_DEBOUNCE = 250;
export const DEFAULT_ITEMS_PER_PAGE = 25;

// Get API base URL from environment or use default
export const API_BASE_URL = env.PUBLIC_INTERNAL_API_URL || '/api/v2';

const trimSlash = (value: string | undefined | null): string => (value ?? '').replace(/\/$/, '');

/**
 * Origin the browser must address the backend on.
 *
 * Always the origin the page was actually loaded from. One deployment
 * can answer on several hostnames — an instance is reachable under the
 * name it was deployed with, and any further domain pointed at the same
 * stack serves the very same app. `PUBLIC_EXTERNAL_API_URL` holds a
 * single hostname, so using it here sent every browser fetch to that
 * one name: same-origin (and therefore fine) on the hostname it was
 * configured with, cross-origin on every other one. That cross-origin
 * hop is what CORS then rejected, and it also stranded cookies on the
 * wrong domain.
 *
 * Same-origin is correct in every deployment because whatever fronts
 * the app routes `/api/`, `/auth/`, `/static/` and `/socket.io/` to the
 * backend on each hostname it serves. Under `vite dev` there is no such
 * proxy in front, but SvelteKit's own `hooks.server.ts` forwards those
 * HTTP paths itself — see `socketOrigin` for the one thing it can't.
 *
 * On the server there is no page origin; requests go straight to the
 * backend over the internal network.
 */
export function apiOrigin(): string {
	if (browser) return window.location.origin;
	return trimSlash(API_BASE_URL);
}

/**
 * Origin to open the Socket.IO connection against.
 *
 * Same as `apiOrigin` wherever a reverse proxy fronts the app, which is
 * every built deployment. `vite dev` is the exception: `hooks.server.ts`
 * proxies HTTP paths but cannot proxy a WebSocket upgrade, so the dev
 * loop still has to name the backend explicitly. Cross-origin there is
 * harmless — the loopback origins are in the backend's allow-list.
 */
export function socketOrigin(): string {
	if (dev) return trimSlash(env.PUBLIC_EXTERNAL_API_URL);
	return apiOrigin();
}

// Other API related configurations
export const API_TIMEOUT = 30000; // 30 seconds
export const API_RETRY_COUNT = 3;

// Determine if we're in a browser or server environment
export const IS_BROWSER = browser;

// Export other needed config
export const API_CONFIG = {
	baseUrl: API_BASE_URL,
	timeout: API_TIMEOUT,
	retryCount: API_RETRY_COUNT
};
