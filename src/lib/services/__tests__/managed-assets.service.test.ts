/**
 * URL and transport shape for the managed assets service.
 *
 * Two things here are worth pinning down rather than trusting:
 *
 * - Repeatable filters must serialise as repeated keys (`client_id=1&
 *   client_id=2`). The backend reads them with `getlist`; a comma-joined
 *   string silently becomes one unmatched filter value, and the page then
 *   shows every customer instead of the two that were asked for.
 * - Export and import bypass `ApiService` entirely, because it forces
 *   `Content-Type: application/json` outbound and parses JSON inbound —
 *   wrong for a multipart upload and for a file download. These tests hold
 *   that split in place: `exportAssets` must POST (never GET, the filters
 *   name customers and hostnames), and `importInspect` must send FormData
 *   without a hand-set content type, so the browser writes the multipart
 *   boundary itself.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		baseUrl: 'http://localhost:8080',
		withQuery: vi.fn((url: string, params?: Record<string, unknown>) => {
			if (!params) return url;
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (value == null) continue;
				if (Array.isArray(value)) {
					for (const item of value) if (item != null) search.append(key, String(item));
				} else {
					search.set(key, String(value));
				}
			}
			const query = search.toString();
			return query ? `${url}?${query}` : url;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

vi.mock('$app/environment', () => ({ browser: false }));

vi.mock('$lib/stores/auth.store', () => ({
	auth: {
		isTokenExpired: () => false,
		isRefreshTokenExpired: () => false,
		getAccessToken: () => 'token-abc'
	}
}));

vi.mock('../auth.service', () => ({
	AuthService: { refreshToken: vi.fn(async () => null) }
}));

import { ManagedAssetsService } from '../managed-assets.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

const BASE = '/api/v2/manage/managed-assets';

const mocked = (fn: unknown) => fn as unknown as ReturnType<typeof vi.fn>;

const jsonResponse = (status: number, body: unknown) =>
	({
		ok: status >= 200 && status < 300,
		status,
		headers: new Headers({ 'content-type': 'application/json' }),
		json: async () => body
	}) as unknown as Response;

const fileResponse = (payload: string, filename: string) =>
	({
		ok: true,
		status: 200,
		headers: new Headers({
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}"`
		}),
		blob: async () => new Blob([payload], { type: 'text/csv' })
	}) as unknown as Response;

describe('ManagedAssetsService — registry', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('list() hits the collection with no query when unfiltered', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.list({}, options);

		expect(ApiService.get).toHaveBeenCalledWith(BASE, options);
	});

	it('list() serialises repeatable filters as repeated keys', async () => {
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.list({
			client_id: [1, 2],
			criticality: ['critical', 'high']
		});

		expect(ApiService.get).toHaveBeenCalledWith(
			`${BASE}?client_id=1&client_id=2&criticality=critical&criticality=high`,
			{}
		);
	});

	it('list() passes pagination and sorting through', async () => {
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.list({
			page: 3,
			per_page: 25,
			order_by: 'name',
			sort_dir: 'desc'
		});

		expect(ApiService.get).toHaveBeenCalledWith(
			`${BASE}?page=3&per_page=25&order_by=name&sort_dir=desc`,
			{}
		);
	});

	it('list() keeps a false boolean filter instead of dropping it', async () => {
		// `is_active=false` is a real filter; only null/undefined mean "unset".
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.list({ is_active: false });

		expect(ApiService.get).toHaveBeenCalledWith(`${BASE}?is_active=false`, {});
	});

	it('get() reads one asset', async () => {
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.get(42);

		expect(ApiService.get).toHaveBeenCalledWith(`${BASE}/42`, {});
	});

	it('create() posts to the collection', async () => {
		const body = { client_id: 1, asset_type_id: 2, name: 'SRV-DC01' };
		mocked(ApiService.post).mockResolvedValueOnce({ ok: true, status: 201 });

		await ManagedAssetsService.create(body);

		expect(ApiService.post).toHaveBeenCalledWith(BASE, body, {});
	});

	it('update() puts a partial body to the member URL', async () => {
		mocked(ApiService.put).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.update(42, { criticality: 'critical' });

		expect(ApiService.put).toHaveBeenCalledWith(`${BASE}/42`, { criticality: 'critical' }, {});
	});

	it('remove() deletes the member URL', async () => {
		mocked(ApiService.delete).mockResolvedValueOnce({ ok: true, status: 204 });

		await ManagedAssetsService.remove(42);

		expect(ApiService.delete).toHaveBeenCalledWith(`${BASE}/42`, {});
	});

	it('reconcile() posts the customer id as a body, never a query', async () => {
		// It is a customer-wide write; a GET would be both a CSRF surface
		// and cacheable.
		mocked(ApiService.post).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.reconcile(7);

		expect(ApiService.post).toHaveBeenCalledWith(`${BASE}/reconcile`, { client_id: 7 }, {});
	});
});

describe('ManagedAssetsService — sub-resources', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('sightings() filters by kind', async () => {
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.sightings(42, { kind: 'alert', page: 2 });

		expect(ApiService.get).toHaveBeenCalledWith(`${BASE}/42/sightings?kind=alert&page=2`, {});
	});

	it('timeline() paginates', async () => {
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.timeline(42, { page: 2, per_page: 50 });

		expect(ApiService.get).toHaveBeenCalledWith(`${BASE}/42/timeline?page=2&per_page=50`, {});
	});

	it('audit() reads the per-asset change log', async () => {
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.audit(42, { page: 1 });

		expect(ApiService.get).toHaveBeenCalledWith(`${BASE}/42/audit?page=1`, {});
	});

	it('auditLog() reads the registry-wide change log, not an asset sub-resource', async () => {
		// Deletions only exist here: the entry's asset id is nulled when
		// the asset goes, so there is no member URL left to ask.
		mocked(ApiService.get).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.auditLog({ page: 1, per_page: 25, client_id: [3] });

		expect(ApiService.get).toHaveBeenCalledWith(`${BASE}/audit?page=1&per_page=25&client_id=3`, {});
	});
});

describe('ManagedAssetsService — export and import', () => {
	const mockFetch = vi.fn();

	beforeAll(() => {
		global.fetch = mockFetch;
	});

	beforeEach(() => {
		mockFetch.mockReset();
		vi.clearAllMocks();
	});

	it('exportAssets() POSTs the filters rather than putting them in the URL', async () => {
		mockFetch.mockResolvedValueOnce(fileResponse('"name"\r\n', 'managed-assets.csv'));

		await ManagedAssetsService.exportAssets({ format: 'csv', filters: { client_id: [1] } });

		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe(`${BASE}/export`);
		expect(init.method).toBe('POST');
		expect(JSON.parse(init.body)).toEqual({ format: 'csv', filters: { client_id: [1] } });
	});

	it('exportAssets() sends the bearer token', async () => {
		mockFetch.mockResolvedValueOnce(fileResponse('"name"\r\n', 'managed-assets.csv'));

		await ManagedAssetsService.exportAssets();

		expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-abc');
	});

	it('exportAssets() takes the filename from the server', async () => {
		mockFetch.mockResolvedValueOnce(fileResponse('"name"\r\n', 'managed-assets-20260812.csv'));

		const result = await ManagedAssetsService.exportAssets();

		expect(result).toMatchObject({ ok: true, value: { filename: 'managed-assets-20260812.csv' } });
	});

	it('exportAssets() reports the server message on failure', async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse(400, { status: 'error', message: 'Export matches more than 50000 assets.' })
		);

		const result = await ManagedAssetsService.exportAssets();

		expect(result).toEqual({
			ok: false,
			error: { message: 'Export matches more than 50000 assets.', status: 400 }
		});
	});

	it('importInspect() sends multipart form data, not JSON', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(200, { staging_token: 'a'.repeat(32) }));
		const file = new File(['name,asset_type\r\nSRV,Account\r\n'], 'assets.csv', {
			type: 'text/csv'
		});

		await ManagedAssetsService.importInspect(file, 7, 'csv');

		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe(`${BASE}/import/inspect`);
		expect(init.body).toBeInstanceOf(FormData);
		// Left unset on purpose: the browser has to add the boundary.
		expect(init.headers['Content-Type']).toBeUndefined();
	});

	it('importInspect() pins the customer chosen in the UI', async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(200, { staging_token: 'a'.repeat(32) }));
		const file = new File(['name\r\nSRV\r\n'], 'assets.csv', { type: 'text/csv' });

		await ManagedAssetsService.importInspect(file, 7, 'json');

		const form = mockFetch.mock.calls[0][1].body as FormData;
		expect([form.get('client_id'), form.get('format')]).toEqual(['7', 'json']);
	});

	it('importInspect() returns the report body itself, with no data envelope', async () => {
		const report = { staging_token: 'b'.repeat(32), counts: { create: 2, update: 0, error: 0 } };
		mockFetch.mockResolvedValueOnce(jsonResponse(200, report));
		const file = new File(['name\r\nSRV\r\n'], 'assets.csv', { type: 'text/csv' });

		const result = await ManagedAssetsService.importInspect(file, 7);

		expect(result).toEqual({ ok: true, value: report });
	});

	it('importApply() posts the staging token', async () => {
		mocked(ApiService.post).mockResolvedValueOnce({ ok: true, status: 200 });

		await ManagedAssetsService.importApply({ staging_token: 'c'.repeat(32), on_conflict: 'skip' });

		expect(ApiService.post).toHaveBeenCalledWith(
			`${BASE}/import`,
			{ staging_token: 'c'.repeat(32), on_conflict: 'skip' },
			{}
		);
	});

	it('importDiscard() deletes the staged upload', async () => {
		mocked(ApiService.delete).mockResolvedValueOnce({ ok: true, status: 204 });

		await ManagedAssetsService.importDiscard('d'.repeat(32));

		expect(ApiService.delete).toHaveBeenCalledWith(`${BASE}/import/${'d'.repeat(32)}`, {});
	});
});
