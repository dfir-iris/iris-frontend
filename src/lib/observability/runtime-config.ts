// Runtime config the SPA needs at boot — the error-reporting slice
// for Sentry, the MCP enable bit, and the chatbot enable bit that
// gates the topbar FAB. Fetched from `GET /api/v2/runtime-config`,
// which is decorated `@ac_api_requires()` — Bearer OR session.
//
// The client hook (src/hooks.client.ts) awaits this at module load,
// so the fetch must be single-flight and cheap on failure — if the
// backend rejects us (401 with no session cookie because the SPA
// authenticates via in-memory Bearer tokens) we return a defaults
// object with everything disabled and every gated UI (Sentry, MCP
// callouts, the chatbot FAB) stays hidden. Attach the Bearer token
// from localStorage so this doesn't happen: the auth store loads
// tokens synchronously at module init, well before this fetch fires.

export interface RuntimeErrorReporting {
	enabled: boolean;
	dsn: string | null;
	environment: string | null;
	sample_rate: number;
	release: string;
}

export interface RuntimeMcp {
	enabled: boolean;
	endpoint: string;
}

export interface RuntimeChatbot {
	enabled: boolean;
	provider_available: boolean;
	model: string;
}

export interface RuntimeConfig {
	error_reporting: RuntimeErrorReporting;
	mcp: RuntimeMcp;
	chatbot: RuntimeChatbot;
}

const DISABLED: RuntimeConfig = {
	error_reporting: {
		enabled: false,
		dsn: null,
		environment: null,
		sample_rate: 1.0,
		release: 'iris@unknown'
	},
	mcp: { enabled: false, endpoint: '/api/v2/mcp' },
	chatbot: { enabled: false, provider_available: false, model: '' }
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
		// Read the access token straight from localStorage rather than
		// importing the auth store here — this module is imported by
		// `hooks.client.ts` at the very top of the boot sequence and we
		// want to keep its dependency graph minimal (no rune stores, no
		// SvelteKit navigation, nothing that pulls in `$app/state`).
		let accessToken: string | null = null;
		if (typeof localStorage !== 'undefined') {
			accessToken = localStorage.getItem('iris_access_token');
		}
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (accessToken) {
			headers.Authorization = `Bearer ${accessToken}`;
		}
		const response = await fetchImpl(`${baseUrl}/api/v2/runtime-config`, {
			method: 'GET',
			credentials: 'include',
			headers
		});
		if (!response.ok) return DISABLED;
		const body = (await response.json()) as ApiEnvelope<RuntimeConfig>;
		const data = body?.data;
		if (!data || typeof data !== 'object') return DISABLED;
		return {
			error_reporting: {
				...DISABLED.error_reporting,
				...data.error_reporting
			},
			mcp: { ...DISABLED.mcp, ...(data.mcp ?? {}) },
			chatbot: { ...DISABLED.chatbot, ...(data.chatbot ?? {}) }
		};
	} catch {
		// Unauth (401) / network error — reporting stays off for this
		// boot; the next reload will retry.
		return DISABLED;
	}
}
