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
	Sentry.init({
		dsn: config.dsn,
		environment: config.environment ?? undefined,
		release: config.release,
		sampleRate: config.sample_rate,
		tracesSampleRate: 0,
		sendDefaultPii: false,
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
