import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ApiService before importing the service under test.
vi.mock('../api.service', () => ({
	ApiService: {
		baseUrl: '',
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

// Stub SvelteKit module — the service imports it at the top-level.
vi.mock('$app/environment', () => ({ browser: false }));

// Stub the auth store to avoid SvelteKit store machinery.
vi.mock('$lib/stores/auth.store', () => ({
	auth: {
		isTokenExpired: vi.fn().mockReturnValue(false),
		isRefreshTokenExpired: vi.fn().mockReturnValue(false),
		getAccessToken: vi.fn().mockReturnValue('test-token')
	}
}));

import { CaseDatastoreService } from '../case-datastore.service';
import { ApiService } from '../api.service';

describe('CaseDatastoreService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// -----------------------------------------------------------------------
	// Tree
	// -----------------------------------------------------------------------

	describe('getTree()', () => {
		it('calls GET /api/v2/cases/{caseId}/datastore/tree', async () => {
			const mock = { ok: true, status: 200, data: { nodes: [] } };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.getTree(42);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/42/datastore/tree', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await CaseDatastoreService.getTree(42, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// Folders
	// -----------------------------------------------------------------------

	describe('listFolders()', () => {
		it('calls GET /api/v2/cases/{caseId}/datastore/folders', async () => {
			const mock = { ok: true, status: 200, data: [] };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.listFolders(42);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/42/datastore/folders', {});
			expect(res).toBe(mock);
		});
	});

	describe('createFolder()', () => {
		it('calls POST /api/v2/cases/{caseId}/datastore/folders with body', async () => {
			const body = { parent_node: 0, folder_name: 'Evidence' };
			const mock = { ok: true, status: 201, data: {} };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.createFolder(42, body);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/42/datastore/folders', body, {});
			expect(res).toBe(mock);
		});
	});

	describe('renameFolder()', () => {
		it('calls POST /api/v2/cases/{caseId}/datastore/folders/{folderId}/rename', async () => {
			const body = { folder_name: 'Renamed' };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.renameFolder(42, 5, body);

			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/cases/42/datastore/folders/5/rename',
				body,
				{}
			);
			expect(res).toBe(mock);
		});
	});

	describe('moveFolder()', () => {
		it('calls POST /api/v2/cases/{caseId}/datastore/folders/{folderId}/move', async () => {
			const body = { destination_node: 10 };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.moveFolder(42, 5, body);

			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/cases/42/datastore/folders/5/move',
				body,
				{}
			);
			expect(res).toBe(mock);
		});
	});

	describe('deleteFolder()', () => {
		it('calls DELETE /api/v2/cases/{caseId}/datastore/folders/{folderId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.deleteFolder(42, 5);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/42/datastore/folders/5', {});
			expect(res).toBe(mock);
		});
	});

	// -----------------------------------------------------------------------
	// Files — CRUD
	// -----------------------------------------------------------------------

	describe('listFiles()', () => {
		it('calls GET /api/v2/cases/{caseId}/datastore/files without params', async () => {
			const mock = {
				ok: true,
				status: 200,
				data: { total: 0, data: [], last_page: null, current_page: 1, next_page: null }
			};
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.listFiles(42);

			expect(ApiService.get).toHaveBeenCalledOnce();
			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/api/v2/cases/42/datastore/files');
			expect(res).toBe(mock);
		});

		it('passes pagination params via ApiService.withQuery', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await CaseDatastoreService.listFiles(42, { page: 2, per_page: 50 });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('page=2');
			expect(url).toContain('per_page=50');
		});

		it('passes order_by and sort_dir params', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await CaseDatastoreService.listFiles(42, { order_by: 'file_original_name', sort_dir: 'asc' });

			const [url] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('order_by=file_original_name');
			expect(url).toContain('sort_dir=asc');
		});

		it('forwards options to ApiService.get', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await CaseDatastoreService.listFiles(42, {}, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	describe('getFileInfo()', () => {
		it('calls GET /api/v2/cases/{caseId}/datastore/files/{fileId}/info', async () => {
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.getFileInfo(42, 7);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/42/datastore/files/7/info', {});
			expect(res).toBe(mock);
		});
	});

	describe('moveFile()', () => {
		it('calls POST /api/v2/cases/{caseId}/datastore/files/{fileId}/move', async () => {
			const body = { destination_node: 3 };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.moveFile(42, 7, body);

			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/cases/42/datastore/files/7/move',
				body,
				{}
			);
			expect(res).toBe(mock);
		});
	});

	describe('deleteFile()', () => {
		it('calls DELETE /api/v2/cases/{caseId}/datastore/files/{fileId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await CaseDatastoreService.deleteFile(42, 7);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/42/datastore/files/7', {});
			expect(res).toBe(mock);
		});
	});

	// -----------------------------------------------------------------------
	// getViewUrl() — pure URL construction
	// -----------------------------------------------------------------------

	describe('getViewUrl()', () => {
		it('returns the canonical path when there is no baseUrl (SSR)', () => {
			// window is undefined in this test environment (vitest / node)
			const url = CaseDatastoreService.getViewUrl(42, 7);
			expect(url).toBe('/api/v2/cases/42/datastore/files/7');
		});

		it('uses ApiService.baseUrl when it is set and window is defined', () => {
			// Simulate a browser context by patching window, then restoring.
			const origWindow = global.window;
			// @ts-expect-error – patching global.window
			global.window = {};

			(ApiService as { baseUrl: string }).baseUrl = 'https://iris.example.com';

			const url = CaseDatastoreService.getViewUrl(42, 7);
			expect(url).toBe('https://iris.example.com/api/v2/cases/42/datastore/files/7');

			// Restore
			(ApiService as { baseUrl: string }).baseUrl = '';
			global.window = origWindow;
		});

		it('strips trailing slash from baseUrl', () => {
			const origWindow = global.window;
			// @ts-expect-error -- assigning a partial window stub for SSR path testing
			global.window = {};
			(ApiService as { baseUrl: string }).baseUrl = 'https://iris.example.com/';

			const url = CaseDatastoreService.getViewUrl(42, 7);
			expect(url).toBe('https://iris.example.com/api/v2/cases/42/datastore/files/7');

			(ApiService as { baseUrl: string }).baseUrl = '';
			global.window = origWindow;
		});
	});

	// -----------------------------------------------------------------------
	// getMarkdownLink() — pure string construction
	// -----------------------------------------------------------------------

	describe('getMarkdownLink()', () => {
		it('produces a markdown link with the file label and canonical path', () => {
			const link = CaseDatastoreService.getMarkdownLink(42, 7, 'report.pdf');
			expect(link).toBe('[report.pdf](/api/v2/cases/42/datastore/files/7)');
		});

		it('strips square brackets from the label to prevent broken markdown', () => {
			const link = CaseDatastoreService.getMarkdownLink(42, 7, 'my [label]');
			expect(link).not.toContain('[label]');
			// After stripping [] the label becomes "my label"
			expect(link).toContain('my label');
		});

		it('handles empty label gracefully', () => {
			const link = CaseDatastoreService.getMarkdownLink(42, 7, '');
			expect(link).toBe('[](/api/v2/cases/42/datastore/files/7)');
		});
	});

	// -----------------------------------------------------------------------
	// uploadFile() / updateFile() — multipart, mocked via global.fetch
	// -----------------------------------------------------------------------

	describe('uploadFile()', () => {
		it('POSTs to the folder upload endpoint with FormData and returns RequestResponse', async () => {
			const mockHeaders = new Headers({ 'content-type': 'application/json' });
			const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });

			// Dynamic imports inside multipart() need the same mocks.
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

			const responseBody = { file_id: 99, file_original_name: 'test.txt' };
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				status: 201,
				headers: mockHeaders,
				json: vi.fn().mockResolvedValueOnce(responseBody)
			} as unknown as Response);

			const res = await CaseDatastoreService.uploadFile(
				42,
				3,
				{ file_original_name: 'test.txt', file_description: 'A test file' },
				mockFile
			);

			expect(global.fetch).toHaveBeenCalledOnce();
			const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('/api/v2/cases/42/datastore/folders/3/files');
			expect((init as RequestInit).method).toBe('POST');
			expect((init as RequestInit).body).toBeInstanceOf(FormData);
			expect(res.ok).toBe(true);
			expect(res.status).toBe(201);
		});
	});

	describe('updateFile()', () => {
		it('POSTs to the file update endpoint with FormData', async () => {
			const mockHeaders = new Headers({ 'content-type': 'application/json' });

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

			const responseBody = { file_id: 7, file_description: 'Updated desc' };
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				status: 200,
				headers: mockHeaders,
				json: vi.fn().mockResolvedValueOnce(responseBody)
			} as unknown as Response);

			const res = await CaseDatastoreService.updateFile(42, 7, {
				file_description: 'Updated desc'
			});

			expect(global.fetch).toHaveBeenCalledOnce();
			const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('/api/v2/cases/42/datastore/files/7');
			expect((init as RequestInit).method).toBe('POST');
			expect(res.ok).toBe(true);
		});

		it('appends boolean fields as strings', async () => {
			const mockHeaders = new Headers({ 'content-type': 'application/json' });

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
				headers: mockHeaders,
				json: vi.fn().mockResolvedValueOnce({})
			} as unknown as Response);

			await CaseDatastoreService.updateFile(42, 7, {
				file_is_ioc: true,
				file_is_evidence: false
			});

			const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const fd = (init as RequestInit).body as FormData;
			expect(fd.get('file_is_ioc')).toBe('true');
			expect(fd.get('file_is_evidence')).toBe('false');
		});
	});
});
