import { request as pwRequest, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost';
const USERNAME = process.env.IRIS_E2E_USERNAME ?? 'administrator';
const PASSWORD = process.env.IRIS_E2E_PASSWORD ?? 'MySuperAdminPassword!';

// Returns a Playwright request context authenticated as the admin. Meant
// for specs that need to seed data (cases, assets, IoCs, ...) before
// driving the UI.
//
// The v2 API accepts Bearer JWTs, not the legacy IRIS_ADM_API_KEY. We
// POST /api/v2/auth/login once and reuse the returned access_token.
export async function adminApi(): Promise<APIRequestContext> {
	const anon = await pwRequest.newContext({
		baseURL: BASE_URL,
		ignoreHTTPSErrors: true,
		extraHTTPHeaders: { 'Content-Type': 'application/json' }
	});
	const res = await anon.post('/api/v2/auth/login', {
		data: { username: USERNAME, password: PASSWORD }
	});
	if (!res.ok()) {
		throw new Error(`admin login failed: ${res.status()} ${await res.text()}`);
	}
	const body = (await res.json()) as { tokens?: { access_token?: string } };
	const token = body.tokens?.access_token;
	if (!token) {
		throw new Error('admin login returned no access_token');
	}
	await anon.dispose();
	return pwRequest.newContext({
		baseURL: BASE_URL,
		ignoreHTTPSErrors: true,
		extraHTTPHeaders: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		}
	});
}

// Small helpers to unwrap the response_api_* envelope. Every v2 endpoint
// responds with `{status, message, data}` on success.
export async function apiJson<T = unknown>(res: { json: () => Promise<unknown> }): Promise<T> {
	const body = (await res.json()) as { data?: T; status?: string; message?: string };
	if (body.data === undefined) {
		throw new Error(`API response missing 'data' field: ${JSON.stringify(body)}`);
	}
	return body.data as T;
}

// A small pool of factories. Every one returns the created object's id so
// specs can chain: `const caseId = await seed.case(api, {...})`.

const rand = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

export const seed = {
	async case(
		api: APIRequestContext,
		overrides: Partial<{
			case_name: string;
			case_description: string;
			case_soc_id: string;
			case_customer_id: number;
			case_classification_id: number;
		}> = {}
	): Promise<number> {
		const payload = {
			case_name: overrides.case_name ?? rand('e2e case'),
			case_description: overrides.case_description ?? 'created by e2e',
			case_soc_id: overrides.case_soc_id ?? rand('SOC'),
			case_customer_id: overrides.case_customer_id ?? 1,
			case_classification_id: overrides.case_classification_id ?? 1
		};
		const res = await api.post('/api/v2/cases', { data: payload });
		if (!res.ok()) throw new Error(`seed.case failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ case_id: number }>(res);
		return data.case_id;
	},

	async alert(
		api: APIRequestContext,
		overrides: Partial<{
			alert_title: string;
			alert_description: string;
			alert_source: string;
			alert_severity_id: number;
			alert_status_id: number;
			alert_customer_id: number;
		}> = {}
	): Promise<number> {
		const payload = {
			alert_title: overrides.alert_title ?? rand('e2e alert'),
			alert_description: overrides.alert_description ?? 'created by e2e',
			alert_source: overrides.alert_source ?? 'e2e',
			alert_severity_id: overrides.alert_severity_id ?? 4,
			alert_status_id: overrides.alert_status_id ?? 2,
			alert_customer_id: overrides.alert_customer_id ?? 1
		};
		const res = await api.post('/api/v2/alerts', { data: payload });
		if (!res.ok()) throw new Error(`seed.alert failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ alert_id: number }>(res);
		return data.alert_id;
	},

	async asset(
		api: APIRequestContext,
		caseId: number,
		overrides: Partial<{ asset_name: string; asset_type_id: number }> = {}
	): Promise<number> {
		const payload = {
			asset_name: overrides.asset_name ?? rand('asset'),
			asset_type_id: overrides.asset_type_id ?? 9 // Windows Computer
		};
		const res = await api.post(`/api/v2/cases/${caseId}/assets`, { data: payload });
		if (!res.ok()) throw new Error(`seed.asset failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ asset_id: number }>(res);
		return data.asset_id;
	},

	async ioc(
		api: APIRequestContext,
		caseId: number,
		overrides: Partial<{ ioc_value: string; ioc_type_id: number; ioc_tlp_id: number }> = {}
	): Promise<number> {
		const payload = {
			ioc_value: overrides.ioc_value ?? rand('ioc'),
			ioc_type_id: overrides.ioc_type_id ?? 1,
			ioc_tlp_id: overrides.ioc_tlp_id ?? 2
		};
		const res = await api.post(`/api/v2/cases/${caseId}/iocs`, { data: payload });
		if (!res.ok()) throw new Error(`seed.ioc failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ ioc_id: number }>(res);
		return data.ioc_id;
	},

	async note(
		api: APIRequestContext,
		caseId: number,
		overrides: Partial<{ note_title: string; note_content: string }> = {}
	): Promise<number> {
		const payload = {
			note_title: overrides.note_title ?? rand('note'),
			note_content: overrides.note_content ?? '# heading\n\ntest'
		};
		const res = await api.post(`/api/v2/cases/${caseId}/notes`, { data: payload });
		if (!res.ok()) throw new Error(`seed.note failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ note_id: number }>(res);
		return data.note_id;
	},

	async task(
		api: APIRequestContext,
		caseId: number,
		overrides: Partial<{ task_title: string; task_status_id: number }> = {}
	): Promise<number> {
		const payload = {
			task_title: overrides.task_title ?? rand('task'),
			task_status_id: overrides.task_status_id ?? 1
		};
		const res = await api.post(`/api/v2/cases/${caseId}/tasks`, { data: payload });
		if (!res.ok()) throw new Error(`seed.task failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ id: number }>(res);
		return data.id;
	},

	async evidence(
		api: APIRequestContext,
		caseId: number,
		overrides: Partial<{ filename: string; file_hash: string; file_size: number }> = {}
	): Promise<number> {
		const payload = {
			filename: overrides.filename ?? `${rand('evidence')}.bin`,
			file_hash: overrides.file_hash ?? 'deadbeef'.repeat(8), // 64-char hex, sha256-shaped
			file_size: overrides.file_size ?? 42
		};
		const res = await api.post(`/api/v2/cases/${caseId}/evidences`, { data: payload });
		if (!res.ok())
			throw new Error(`seed.evidence failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ id: number }>(res);
		return data.id;
	},

	async warRoom(
		api: APIRequestContext,
		overrides: Partial<{ name: string; description: string; case_id: number | null }> = {}
	): Promise<number> {
		const payload = {
			name: overrides.name ?? rand('war-room'),
			description: overrides.description ?? 'created by e2e',
			case_id: overrides.case_id ?? null
		};
		const res = await api.post('/api/v2/war-rooms', { data: payload });
		if (!res.ok())
			throw new Error(`seed.warRoom failed: ${res.status()} ${await res.text()}`);
		const data = await apiJson<{ id: number }>(res);
		return data.id;
	}
};

// Small teardown helper — best-effort delete, doesn't throw.
export const cleanup = {
	async case(api: APIRequestContext, id: number): Promise<void> {
		await api.delete(`/api/v2/cases/${id}`).catch(() => {});
	},
	async alert(api: APIRequestContext, id: number): Promise<void> {
		await api.delete(`/api/v2/alerts/${id}`).catch(() => {});
	},
	async warRoom(api: APIRequestContext, id: number): Promise<void> {
		await api.delete(`/api/v2/war-rooms/${id}`).catch(() => {});
	}
};
