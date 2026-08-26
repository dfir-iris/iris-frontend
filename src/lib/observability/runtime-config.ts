// Runtime config the SPA needs at boot — the error-reporting slice
// for Sentry, the MCP enable bit, and the chatbot enable bit that
// gates the topbar FAB. Fetched from `GET /api/v2/runtime-config`,
// which is decorated `@ac_api_requires()` — Bearer OR session.
//
// The client hook (src/hooks.client.ts) awaits this at module load,
// so the fetch must be single-flight and cheap on failure. No token
// handling happens here: the request is same-origin, so the HttpOnly
// access-token cookie rides along and the proxy in hooks.server.ts
// turns it into the Bearer header the backend expects. That is the
// whole reason the access token is mirrored into a cookie — this
// fetch runs before any JS holds a token.
//
// On failure we return a defaults object with everything disabled and
// every gated UI (Sentry, MCP callouts, the chatbot FAB) stays hidden.

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

export async function fetchRuntimeConfig(
	fetchImpl: typeof fetch = fetch,
	baseUrl = ''
): Promise<RuntimeConfig> {
	try {
		// `response_api_success` returns the payload flat — no
		// `{status,data,message}` envelope — so keys live at the top level.
		const response = await fetchImpl(`${baseUrl}/api/v2/runtime-config`, {
			method: 'GET',
			credentials: 'include',
			headers: { Accept: 'application/json' }
		});
		if (!response.ok) return DISABLED;
		const body = (await response.json()) as Partial<RuntimeConfig>;
		if (!body || typeof body !== 'object') return DISABLED;
		return {
			error_reporting: {
				...DISABLED.error_reporting,
				...(body.error_reporting ?? {})
			},
			mcp: { ...DISABLED.mcp, ...(body.mcp ?? {}) },
			chatbot: { ...DISABLED.chatbot, ...(body.chatbot ?? {}) }
		};
	} catch {
		// Network error — reporting stays off for this boot; the next
		// reload will retry.
		return DISABLED;
	}
}
