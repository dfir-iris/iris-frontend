import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		baseUrl: 'http://localhost:8080',
		withQuery: vi.fn((url: string, params?: Record<string, unknown>) => {
			if (!params) return url;
			const search = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (value == null) continue;
				search.set(key, String(value));
			}
			const query = search.toString();
			return query ? `${url}?${query}` : url;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
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

import { WarRoomScopeService } from '../war-room-scope.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

describe('WarRoomScopeService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('listAssets', () => {
		it('GETs the scope assets with no query when unfiltered', async () => {
			const res = { ok: true, status: 200, data: { data: [], truncated: false, limit: 5000 } };
			mock('get').mockResolvedValueOnce(res);

			const out = await WarRoomScopeService.listAssets(7);

			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/scope/assets', {});
			expect(out).toBe(res);
		});

		it('serialises every filter, compromised as 1 and "none" flag verbatim', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.listAssets(
				7,
				{ q: '  dc01 ', flag_id: 'none', case_id: 3, compromised: true },
				{ skipTokenRefresh: true }
			);

			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/scope/assets?q=dc01&flag_id=none&case_id=3&compromised=1',
				{ skipTokenRefresh: true }
			);
		});

		it('drops a blank search and a false compromised flag', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.listAssets(7, {
				q: '   ',
				compromised: false,
				flag_id: 4,
				without_flag_id: 2
			});

			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/scope/assets?flag_id=4&without_flag_id=2',
				{}
			);
		});
	});

	describe('listIocs', () => {
		it('GETs the scope IOCs with search and case filter', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.listIocs(7, { q: 'evil', case_id: 2 });

			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/scope/iocs?q=evil&case_id=2', {});
		});
	});

	describe('createAsset', () => {
		it('POSTs the asset and its targets', async () => {
			const body = {
				asset: { asset_name: 'DC01', asset_type_id: 9 },
				case_ids: [1, 2],
				flag_ids: [3, 4],
				flag_reason: 'why'
			};
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.createAsset(7, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/scope/assets', body, {});
		});
	});

	describe('pushAssets', () => {
		it('POSTs to /assets/push and forwards options', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.pushAssets(
				7,
				{ asset_ids: [10], case_ids: [2] },
				{ skipAuthRedirect: true }
			);

			const [url, body, opts] = mock('post').mock.calls[0];
			expect(url).toBe('/war-rooms/7/scope/assets/push');
			expect(body).toEqual({ asset_ids: [10], case_ids: [2] });
			expect(opts).toEqual({ skipAuthRedirect: true });
		});
	});

	describe('createIoc / pushIocs', () => {
		it('POSTs a new IOC', async () => {
			const body = { ioc: { ioc_value: '1.2.3.4', ioc_type_id: 76 }, case_ids: [1] };
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.createIoc(7, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/scope/iocs', body, {});
		});

		it('POSTs to /iocs/push', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.pushIocs(7, { ioc_ids: [5], case_ids: [1, 2] });

			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/7/scope/iocs/push',
				{ ioc_ids: [5], case_ids: [1, 2] },
				{}
			);
		});
	});

	describe('bulkFlag', () => {
		it('POSTs the bulk flag change', async () => {
			const body = {
				asset_ids: [1, 2],
				flag_id: 3,
				action: 'clear' as const,
				reason: 'reconnected'
			};
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.bulkFlag(7, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/scope/assets/flags', body, {});
		});
	});

	describe('staging', () => {
		it('lists staged objects', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200, data: [] });

			await WarRoomScopeService.listStaging(7);

			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/scope/staging', {});
		});

		it('creates a staged object', async () => {
			const body = {
				object_type: 'ioc' as const,
				payload: { ioc_value: 'x.example', ioc_type_id: 1 },
				proposed_case_ids: [3],
				note: 'from chat'
			};
			mock('post').mockResolvedValueOnce({ ok: true, status: 201 });

			await WarRoomScopeService.createStaged(7, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/scope/staging', body, {});
		});

		it('PATCHes a staged object', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.updateStaged(7, 11, { note: null, proposed_case_ids: [] });

			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/7/scope/staging/11',
				{ note: null, proposed_case_ids: [] },
				{}
			);
		});

		it('DELETEs a staged object', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, status: 204 });

			await WarRoomScopeService.removeStaged(7, 11);

			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/7/scope/staging/11', {});
		});

		it('pushes with explicit targets', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.pushStaged(7, 11, [1, 2]);

			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/7/scope/staging/11/push',
				{ case_ids: [1, 2] },
				{}
			);
		});

		it('pushes with an empty body to use the proposed targets', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, status: 200 });

			await WarRoomScopeService.pushStaged(7, 11);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/scope/staging/11/push', {}, {});
		});
	});

	describe('listDecisionRefs', () => {
		it('GETs the room decisions', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, status: 200, data: [] });

			await WarRoomScopeService.listDecisionRefs(7);

			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/decisions', {});
		});
	});

	describe('exportIocsPath', () => {
		it('builds the export URL without include_red by default', () => {
			expect(WarRoomScopeService.exportIocsPath(7, 'txt')).toBe(
				'/api/v2/war-rooms/7/scope/iocs/export?format=txt'
			);
		});

		it('adds include_red=1 when asked', () => {
			expect(WarRoomScopeService.exportIocsPath(7, 'stix', true)).toBe(
				'/api/v2/war-rooms/7/scope/iocs/export?format=stix&include_red=1'
			);
		});
	});

	describe('exportIocs', () => {
		const mockFetch = vi.fn();

		beforeAll(() => {
			global.fetch = mockFetch;
		});

		beforeEach(() => {
			mockFetch.mockReset();
		});

		it('GETs the export with the bearer token and returns the file', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({
					'content-type': 'text/csv',
					'content-disposition': 'attachment; filename="wr-7-iocs.csv"'
				}),
				blob: async () => new Blob(['value,type\n'], { type: 'text/csv' })
			} as unknown as Response);

			const out = await WarRoomScopeService.exportIocs(7, 'csv');

			const [url, init] = mockFetch.mock.calls[0];
			expect(url).toBe('/api/v2/war-rooms/7/scope/iocs/export?format=csv');
			expect(init.method).toBe('GET');
			expect(init.headers.Authorization).toBe('Bearer token-abc');
			expect(out.ok).toBe(true);
			if (out.ok) expect(out.value.filename).toBe('wr-7-iocs.csv');
		});

		it('falls back to a per-format filename', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: new Headers({ 'content-type': 'text/plain' }),
				blob: async () => new Blob(['1.2.3.4\n'])
			} as unknown as Response);

			const out = await WarRoomScopeService.exportIocs(7, 'txt');

			expect(out.ok && out.value.filename).toBe('blocklist.txt');
		});

		it('reports the server message on failure', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				headers: new Headers({ 'content-type': 'application/json' }),
				json: async () => ({ message: 'Permission denied' })
			} as unknown as Response);

			const out = await WarRoomScopeService.exportIocs(7, 'csv');

			expect(out).toEqual({ ok: false, error: { message: 'Permission denied', status: 403 } });
		});

		it('reports a network failure when fetch rejects', async () => {
			mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

			const out = await WarRoomScopeService.exportIocs(7, 'csv');

			expect(out).toEqual({ ok: false, error: { message: 'Network request failed', status: 0 } });
		});
	});
});
