// Runtime config the SPA needs at boot — currently just the error-
// reporting slice used by the Sentry SDK. Fetched from
// `GET /api/v2/runtime-config` (session-authed on the backend).
//
// The client hook (src/hooks.client.ts) awaits this at module load,
// so the fetch must be single-flight and cheap on failure — if the
// backend is unreachable we return a defaults object with reporting
// disabled and the caller skips Sentry.init entirely.

export interface RuntimeErrorReporting {
	enabled: boolean;
	dsn: string | null;
	environment: string | null;
	sample_rate: number;
	release: string;
}

export interface RuntimeConfig {
	error_reporting: RuntimeErrorReporting;
}

const DISABLED: RuntimeConfig = {
	error_reporting: {
		enabled: false,
		dsn: null,
		environment: null,
		sample_rate: 1.0,
		release: 'iris@unknown'
	}
};

// The backend wraps the payload in the standard `response_api_*`
// envelope `{status, data, message}`, so we unwrap `data` here.
interface ApiEnvelope<T> {
	status?: string;
	data?: T;
	message?: string;
}

export async function fetchRuntimeConfig(
	fetchImpl: typeof fetch = fetch,
	baseUrl = ''
): Promise<RuntimeConfig> {
	try {
		const response = await fetchImpl(`${baseUrl}/api/v2/runtime-config`, {
			method: 'GET',
			credentials: 'include',
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) return DISABLED;
		const body = (await response.json()) as ApiEnvelope<RuntimeConfig>;
		const data = body?.data;
		if (!data || typeof data !== 'object') return DISABLED;
		return {
			error_reporting: {
				...DISABLED.error_reporting,
				...data.error_reporting
			}
		};
	} catch {
		// Unauth (401) / network error — reporting stays off for this
		// boot; the next reload will retry.
		return DISABLED;
	}
}
