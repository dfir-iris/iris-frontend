import { request as pwRequest, type APIRequestContext } from '@playwright/test';

const API_KEY = process.env.IRIS_E2E_API_KEY ?? '';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost';

// Returns a Playwright request context authenticated with the admin API
// key. Meant for specs that need to seed data (cases, assets, IoCs, ...)
// before driving the UI. Set IRIS_E2E_API_KEY in CI to the same key as
// IRIS_ADM_API_KEY in the backend's .env.
export async function adminApi(): Promise<APIRequestContext> {
	if (!API_KEY) {
		throw new Error(
			'IRIS_E2E_API_KEY env var is not set — cannot make admin API calls in specs'
		);
	}
	return pwRequest.newContext({
		baseURL: BASE_URL,
		ignoreHTTPSErrors: true,
		extraHTTPHeaders: {
			Authorization: `Bearer ${API_KEY}`,
			'Content-Type': 'application/json'
		}
	});
}
