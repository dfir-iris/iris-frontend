import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: (path: string, params?: Record<string, unknown>) => {
			if (!params || Object.keys(params).length === 0) return path;
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params)) {
				if (v == null) continue;
				qs.set(k, String(v));
			}
			const str = qs.toString();
			return str ? `${path}?${str}` : path;
		},
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseObjectsService, assetIconUrl } from '../case-objects.service';
import { ApiService } from '../api.service';
import type { CaseObjectResource } from '../case-objects.service';

// All five supported resource types.
const RESOURCES: CaseObjectResource[] = [
	'asset-types',
	'ioc-types',
	'case-classifications',
	'case-states',
	'evidence-types'
];

describe('CaseObjectsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// search()
	// -----------------------------------------------------------------------

	describe('search()', () => {
		it.each(RESOURCES)('calls GET /manage/case-objects/%s for resource %s', async (resource) => {
			const mock = { ok: true, status: 200, data: { data: [], total: 0 } };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseObjectsService.search(resource);

			expect(ApiService.get).toHaveBeenCalledOnce();
			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe(`/manage/case-objects/${resource}`);
			expect(res).toBe(mock);
		});

		it('appends pagination params via ApiService.withQuery', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.search('asset-types', { page: 2, per_page: 25 });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('page=2');
			expect(url).toContain('per_page=25');
		});

		it('appends search param', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.search('ioc-types', { search: 'domain' });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('search=domain');
		});

		it('appends order_by and sort_dir params', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.search('case-states', { order_by: 'name', sort_dir: 'desc' });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('order_by=name');
			expect(url).toContain('sort_dir=desc');
		});

		it('forwards options to ApiService.get', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.search('evidence-types', {}, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});

		it('returns paginated result as-is', async () => {
			const mock = {
				ok: true,
				status: 200,
				data: {
					data: [{ id: 1, name: 'Malware' }],
					total: 1,
					per_page: 25,
					current_page: 1,
					last_page: 1,
					next_page: null
				}
			};
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseObjectsService.search('asset-types');

			expect(res).toBe(mock);
		});
	});

	// -----------------------------------------------------------------------
	// get()
	// -----------------------------------------------------------------------

	describe('get()', () => {
		it.each(RESOURCES)('calls GET /manage/case-objects/%s/{id} for resource %s', async (resource) => {
			const mock = { ok: true, status: 200, data: { id: 1 } };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseObjectsService.get(resource, 1);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith(`/manage/case-objects/${resource}/1`, {});
			expect(res).toBe(mock);
		});

		it('embeds the correct identifier in the path', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.get('ioc-types', 99);

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/manage/case-objects/ioc-types/99');
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.get('asset-types', 1, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// create()
	// -----------------------------------------------------------------------

	describe('create()', () => {
		it.each(RESOURCES)('calls POST /manage/case-objects/%s with body for resource %s', async (resource) => {
			const body = { name: 'New entry', some_field: 'value' };
			const mock = { ok: true, status: 201, data: { id: 10, ...body } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseObjectsService.create(resource, body);

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith(`/manage/case-objects/${resource}`, body, {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, data: {} });

			await CaseObjectsService.create('case-classifications', { name: 'test' }, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.post as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// update()
	// -----------------------------------------------------------------------

	describe('update()', () => {
		it.each(RESOURCES)('calls PUT /manage/case-objects/%s/{id} with body for resource %s', async (resource) => {
			const body = { name: 'Updated entry' };
			const mock = { ok: true, status: 200, data: { id: 5, ...body } };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseObjectsService.update(resource, 5, body);

			expect(ApiService.put).toHaveBeenCalledOnce();
			expect(ApiService.put).toHaveBeenCalledWith(`/manage/case-objects/${resource}/5`, body, {});
			expect(res).toBe(mock);
		});

		it('embeds the correct identifier in the path', async () => {
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.update('ioc-types', 77, { name: 'X' });

			const [url] = (ApiService.put as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/manage/case-objects/ioc-types/77');
		});

		it('forwards options', async () => {
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await CaseObjectsService.update('evidence-types', 1, {}, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.put as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// remove()
	// -----------------------------------------------------------------------

	describe('remove()', () => {
		it.each(RESOURCES)('calls DELETE /manage/case-objects/%s/{id} for resource %s', async (resource) => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseObjectsService.remove(resource, 5);

			expect(ApiService.delete).toHaveBeenCalledOnce();
			expect(ApiService.delete).toHaveBeenCalledWith(`/manage/case-objects/${resource}/5`, {});
			expect(res).toBe(mock);
		});

		it('embeds the correct identifier in the path', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await CaseObjectsService.remove('asset-types', 123);

			const [url] = (ApiService.delete as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/manage/case-objects/asset-types/123');
		});

		it('forwards options', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await CaseObjectsService.remove('case-states', 1, { skipTokenRefresh: true });

			const [, opts] = (ApiService.delete as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// uploadAssetTypeIcon() — multipart, mocked via global.fetch
	// -----------------------------------------------------------------------

	describe('uploadAssetTypeIcon()', () => {
		const setupFetchMock = (body: unknown, ok = true, status = 200) => {
			vi.doMock('$lib/stores/auth.store', () => ({
				auth: {
					isTokenExpired: vi.fn().mockReturnValue(false),
					isRefreshTokenExpired: vi.fn().mockReturnValue(false),
					getAccessToken: vi.fn().mockReturnValue('test-token')
				}
			}));
			vi.doMock('./auth.service', async () => ({ AuthService: { refreshToken: vi.fn() } }));
			vi.doMock('$app/environment', () => ({ browser: false }));
			vi.doMock('$lib/config/api.config', () => ({ apiOrigin: () => 'http://localhost:5000' }));

			global.fetch = vi.fn().mockResolvedValueOnce({
				ok,
				status,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: vi.fn().mockResolvedValueOnce(body)
			} as unknown as Response);
		};

		it('POSTs to /api/v2/manage/case-objects/asset-types/{id}/icon/compromised', async () => {
			setupFetchMock({ asset_type_id: 1 });
			const file = new File(['data'], 'icon.png', { type: 'image/png' });

			const res = await CaseObjectsService.uploadAssetTypeIcon(1, 'compromised', file);

			expect(global.fetch).toHaveBeenCalledOnce();
			const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('/api/v2/manage/case-objects/asset-types/1/icon/compromised');
			expect((init as RequestInit).method).toBe('POST');
			expect((init as RequestInit).body).toBeInstanceOf(FormData);
			expect(res.ok).toBe(true);
			expect(res.status).toBe(200);
		});

		it('POSTs to /api/v2/manage/case-objects/asset-types/{id}/icon/not_compromised', async () => {
			setupFetchMock({ asset_type_id: 2 });
			const file = new File(['data'], 'icon_nc.png', { type: 'image/png' });

			await CaseObjectsService.uploadAssetTypeIcon(2, 'not_compromised', file);

			const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('/icon/not_compromised');
		});

		it('includes Authorization header when token is present', async () => {
			setupFetchMock({});
			const file = new File(['x'], 'x.png', { type: 'image/png' });

			await CaseObjectsService.uploadAssetTypeIcon(1, 'compromised', file);

			const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect((init as RequestInit & { headers: Record<string, string> }).headers['Authorization']).toBe(
				'Bearer test-token'
			);
		});

		it('returns response data as-is on success', async () => {
			const payload = { asset_type_id: 5, asset_icon_compromised: 'new_icon.png' };
			setupFetchMock(payload);
			const file = new File(['x'], 'x.png', { type: 'image/png' });

			const res = await CaseObjectsService.uploadAssetTypeIcon(5, 'compromised', file);

			expect(res.data).toMatchObject(payload);
		});

		it('handles non-JSON response bodies gracefully', async () => {
			vi.doMock('$lib/stores/auth.store', () => ({
				auth: {
					isTokenExpired: vi.fn().mockReturnValue(false),
					isRefreshTokenExpired: vi.fn().mockReturnValue(false),
					getAccessToken: vi.fn().mockReturnValue('tok')
				}
			}));
			vi.doMock('./auth.service', async () => ({ AuthService: { refreshToken: vi.fn() } }));
			vi.doMock('$app/environment', () => ({ browser: false }));
			vi.doMock('$lib/config/api.config', () => ({ apiOrigin: () => 'http://localhost:5000' }));

			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ 'content-type': 'text/plain' }),
				text: vi.fn().mockResolvedValueOnce('ok')
			} as unknown as Response);

			const file = new File(['x'], 'x.png', { type: 'image/png' });
			const res = await CaseObjectsService.uploadAssetTypeIcon(1, 'compromised', file);

			expect(res.data).toBe('ok');
		});
	});
});

// -----------------------------------------------------------------------
// assetIconUrl() helper — exported standalone function
// -----------------------------------------------------------------------

describe('assetIconUrl()', () => {
	it('returns null for null input', () => {
		expect(assetIconUrl(null)).toBeNull();
	});

	it('returns null for undefined input', () => {
		expect(assetIconUrl(undefined)).toBeNull();
	});

	it('returns null for empty string', () => {
		expect(assetIconUrl('')).toBeNull();
	});

	it('returns correct /static path for a valid filename', () => {
		expect(assetIconUrl('server.png')).toBe('/static/assets/img/graph/server.png');
	});

	it('handles filenames with subdirectory segments', () => {
		expect(assetIconUrl('custom/my-icon.svg')).toBe(
			'/static/assets/img/graph/custom/my-icon.svg'
		);
	});
});
