// Shared init helper used by both `src/hooks.client.ts` and
// `src/hooks.server.ts`. Keeps the two entry points from drifting.
//
// Sentry.init is a no-op when dsn=null, so the caller can hand us
// the raw runtime-config slice — we decide whether to actually
// engage the SDK.

import * as Sentry from '@sentry/sveltekit';
import { beforeBreadcrumb, beforeSend } from './before-send';
import type { RuntimeErrorReporting } from './runtime-config';

let didInit = false;

export function initSentry(config: RuntimeErrorReporting): boolean {
	if (didInit) return true;
	if (!config.enabled || !config.dsn) return false;
	// Route the browser SDK through a same-origin SvelteKit endpoint
	// so cross-origin GlitchTip deployments don't hit the browser's
	// SOP/CORS block on the ingest URL. Server-side init keeps the
	// direct DSN — Node fetch isn't subject to CORS.
	const tunnel = typeof window === 'undefined' ? undefined : '/monitoring/envelope';
	Sentry.init({
		dsn: config.dsn,
		tunnel,
		environment: config.environment ?? undefined,
		release: config.release,
		sampleRate: config.sample_rate,
		tracesSampleRate: 0,
		// SDK v11 replaced `sendDefaultPii: false` with `dataCollection`,
		// whose defaults collect everything. Keep the old posture: no
		// user/IP, cookies, HTTP bodies (case data, login credentials)
		// or local variables. Headers and query strings still go out,
		// redacted by `beforeSend`.
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpBodies: [],
			stackFrameVariables: false
		},
		maxBreadcrumbs: 30,
		attachStacktrace: true,
		beforeSend,
		beforeBreadcrumb
	});
	didInit = true;
	return true;
}

export function isSentryInitialized(): boolean {
	return didInit;
}
