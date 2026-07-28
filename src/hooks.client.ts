// Client-side SvelteKit hooks — installs the Sentry SDK if the
// backend has error reporting enabled, and wires `handleError` so
// unhandled router errors get captured. The SDK also installs its
// own `window.onerror` + `unhandledrejection` listeners on init, so
// exceptions outside the router surface too.
//
// `Sentry.init` needs a DSN at module load. The DSN lives on the
// backend (per-install config, not build-time), so we do a
// single-flight fetch of `/api/v2/runtime-config` here at top level
// and only call `initSentry` once the response comes back. Any code
// that runs before this promise resolves (there isn't much — modules
// are hoisted, layouts run after) will simply miss capture.

import { handleErrorWithSentry } from '@sentry/sveltekit';
import type { HandleClientError } from '@sveltejs/kit';
import { initSentry } from '$lib/observability/init';
import { fetchRuntimeConfig } from '$lib/observability/runtime-config';
import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';

const config = await fetchRuntimeConfig();
initSentry(config.error_reporting);
// Populate the module-scoped rune store so components that gate on
// `runtimeConfig.chatbot.enabled` (topbar FAB) or `runtimeConfig.mcp`
// can `$derived` off it without a per-component fetch.
runtimeConfig.set(config);

const fallbackHandleError: HandleClientError = ({ error, event }) => {
	const message = error instanceof Error ? error.message : 'Client error';
	// Return the shape SvelteKit expects on `App.Error`.
	return {
		message,
		// Route id helps operators triage which page threw.
		route: event.route?.id ?? undefined
	};
};

export const handleError = handleErrorWithSentry(fallbackHandleError);
