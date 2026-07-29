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

// `response_api_success` returns the payload flat — no
// `{status,data,message}` envelope — so JSON parsing reads fields at
// the top level of the body for both /runtime-config and
// /auth/refresh-token.

function readAccessToken(): string | null {
	if (typeof localStorage === 'undefined') return null;
	return localStorage.getItem('iris_access_token');
}

async function refreshOnce(fetchImpl: typeof fetch, baseUrl: string): Promise<string | null> {
	// Minimal refresh: swap the current refresh token for a new access
	// token, mirror the auth store's localStorage layout so subsequent
	// callers see the fresh token. We deliberately don't import the
	// auth store here — this module boots before it, and we want to
	// keep the dep graph minimal (see the comment on fetchRuntimeConfig).
	if (typeof localStorage === 'undefined') return null;
	const refreshToken = localStorage.getItem('iris_refresh_token');
	if (!refreshToken) return null;
	try {
		const response = await fetchImpl(`${baseUrl}/api/v2/auth/refresh-token`, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ refresh_token: refreshToken })
		});
		if (!response.ok) return null;
		// The backend `response_api_success` returns the payload flat
		// (no `{status,data,message}` envelope), so tokens live at the
		// top level of the JSON body.
		const body = (await response.json()) as {
			tokens?: {
				access_token: string;
				refresh_token: string;
				access_token_expires_at: number;
				refresh_token_expires_at: number;
			};
		};
		const tokens = body?.tokens;
		if (!tokens?.access_token) return null;
		localStorage.setItem('iris_access_token', tokens.access_token);
		localStorage.setItem('iris_refresh_token', tokens.refresh_token);
		localStorage.setItem('iris_token_expiry', String(tokens.access_token_expires_at));
		localStorage.setItem('iris_refresh_expiry', String(tokens.refresh_token_expires_at));
		return tokens.access_token;
	} catch {
		return null;
	}
}

async function callRuntimeConfig(
	fetchImpl: typeof fetch,
	baseUrl: string,
	accessToken: string | null
): Promise<Response> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
	return fetchImpl(`${baseUrl}/api/v2/runtime-config`, {
		method: 'GET',
		credentials: 'include',
		headers
	});
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
		let response = await callRuntimeConfig(fetchImpl, baseUrl, readAccessToken());
		// A 401 on a browser reload most often means the localStorage
		// access token expired while the SPA was closed. Refresh once
		// and retry — this is the same recovery the rest of the app
		// gets for free via ApiService, but boot-time modules bypass it
		// (no rune-store dep), so we inline a single-attempt refresh
		// here. Without this the runtime config permanently falls back
		// to DISABLED for this boot, hiding the chatbot FAB / Sentry
		// init / MCP endpoint until the next full page load with a
		// fresh token.
		if (response.status === 401) {
			const fresh = await refreshOnce(fetchImpl, baseUrl);
			if (fresh) response = await callRuntimeConfig(fetchImpl, baseUrl, fresh);
		}
		if (!response.ok) return DISABLED;
		// Flat body — runtime-config keys live at the top level.
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
