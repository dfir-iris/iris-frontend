import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// SvelteKit environment stubs — must be declared before importing the service
vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('$lib/stores/auth.store', () => ({
	auth: {
		isTokenExpired: vi.fn(),
		isRefreshTokenExpired: vi.fn(),
		getAccessToken: vi.fn()
	}
}));

vi.mock('./auth.service', () => ({
	AuthService: { refreshToken: vi.fn() }
}));

// ApiService is used only by apply() and discard() — mock with standard shape
vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
		baseUrl: 'http://localhost:8080'
	}
}));

vi.mock('../auth.service', () => ({
	AuthService: { refreshToken: vi.fn() }
}));

import { CaseTransferService } from '../case-transfer.service';
import { ApiService } from '../api.service';
import { auth } from '$lib/stores/auth.store';
import { AuthService } from '../auth.service';

import type { ApiOptions } from '../api.service';
import type { ApplyImportBody, BundleInspection, ImportedCase } from '$lib/types/resources/case-transfer';

// ---- fetch mock helpers -----------------------------------------------------

function mockFetchResponse(opts: {
	ok: boolean;
	status?: number;
	blob?: Blob;
	json?: unknown;
	headers?: Record<string, string>;
}): Response {
	const headers = new Headers(opts.headers ?? {});
	return {
		ok: opts.ok,
		status: opts.status ?? (opts.ok ? 200 : 500),
		headers,
		blob: vi.fn().mockResolvedValue(opts.blob ?? new Blob()),
		json: vi.fn().mockResolvedValue(opts.json ?? {})
	} as unknown as Response;
}

describe('CaseTransferService', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Default auth state: token valid, no refresh needed
		(auth.isTokenExpired as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(auth.isRefreshTokenExpired as ReturnType<typeof vi.fn>).mockReturnValue(false);
		(auth.getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('access-token');

		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ---- exportCase() --------------------------------------------------------

	describe('exportCase()', () => {
		it('should POST to /api/v2/cases/{caseId}/export with JSON body', async () => {
			const blob = new Blob(['archive-content'], { type: 'application/octet-stream' });
			const mockResponse = mockFetchResponse({
				ok: true,
				blob,
				headers: { 'Content-Disposition': 'attachment; filename="case-42.iris"' }
			});
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			await CaseTransferService.exportCase(42, {});

			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
			const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('/api/v2/cases/42/export');
			expect(init.method).toBe('POST');
			expect(init.headers['Content-Type']).toBe('application/json');
			expect(init.headers.Accept).toBe('*/*');
		});

		it('should attach the Bearer token to the request', async () => {
			(auth.getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('my-token');
			const blob = new Blob();
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, blob })
			);

			await CaseTransferService.exportCase(1, {});

			const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(init.headers.Authorization).toBe('Bearer my-token');
		});

		it('should refresh the token before the request when it is expired but the refresh token is still valid', async () => {
			(auth.isTokenExpired as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(auth.isRefreshTokenExpired as ReturnType<typeof vi.fn>).mockReturnValue(false);
			(AuthService.refreshToken as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, blob: new Blob() })
			);

			await CaseTransferService.exportCase(1, {});

			expect(AuthService.refreshToken).toHaveBeenCalledTimes(1);
			// fetch must come after the refresh
			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		});

		it('should NOT refresh the token when both tokens are expired', async () => {
			(auth.isTokenExpired as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(auth.isRefreshTokenExpired as ReturnType<typeof vi.fn>).mockReturnValue(true);
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, blob: new Blob() })
			);

			await CaseTransferService.exportCase(1, {});

			expect(AuthService.refreshToken).not.toHaveBeenCalled();
		});

		it('should return ok:true with the blob and filename from Content-Disposition', async () => {
			const blob = new Blob(['data']);
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({
					ok: true,
					blob,
					headers: { 'Content-Disposition': 'attachment; filename="case-export.iris"' }
				})
			);

			const result = await CaseTransferService.exportCase(42, {});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.blob).toBe(blob);
				expect(result.value.filename).toBe('case-export.iris');
			}
		});

		it('should decode a percent-encoded filename* in Content-Disposition', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({
					ok: true,
					blob: new Blob(),
					headers: { 'Content-Disposition': "attachment; filename*=UTF-8''case%20export.iris" }
				})
			);

			const result = await CaseTransferService.exportCase(1, {});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.filename).toBe('case export.iris');
			}
		});

		it('should fall back to "case-export.iris" when no Content-Disposition header is present', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, blob: new Blob() })
			);

			const result = await CaseTransferService.exportCase(1, {});

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.filename).toBe('case-export.iris');
			}
		});

		it('should serialize the body as JSON in the request', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, blob: new Blob() })
			);

			await CaseTransferService.exportCase(5, { passphrase: 'secret' } as never);

			const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(JSON.parse(init.body as string)).toEqual({ passphrase: 'secret' });
		});

		it('should return ok:false with status and message when the server responds with an error', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({
					ok: false,
					status: 403,
					json: { message: 'Forbidden' },
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const result = await CaseTransferService.exportCase(1, {});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.status).toBe(403);
				expect(result.error.message).toBe('Forbidden');
			}
		});

		it('should return a generic message when the error body cannot be parsed', async () => {
			const badResponse = {
				ok: false,
				status: 500,
				headers: new Headers({ 'Content-Type': 'application/json' }),
				blob: vi.fn().mockResolvedValue(new Blob()),
				json: vi.fn().mockRejectedValue(new SyntaxError('bad json'))
			} as unknown as Response;
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(badResponse);

			const result = await CaseTransferService.exportCase(1, {});

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toMatch(/Request failed \(HTTP 500\)/);
			}
		});
	});

	// ---- inspect() -----------------------------------------------------------

	describe('inspect()', () => {
		it('should POST to /api/v2/cases/import/inspect with multipart FormData containing the archive', async () => {
			const inspection = { staging_token: 'tok-1', cases: [] } as unknown as BundleInspection;
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, json: inspection })
			);

			const file = new File(['zip'], 'bundle.iris', { type: 'application/zip' });
			await CaseTransferService.inspect(file);

			expect(globalThis.fetch).toHaveBeenCalledTimes(1);
			const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toContain('/api/v2/cases/import/inspect');
			expect(init.method).toBe('POST');
			// Content-Type should NOT be set — browser sets multipart boundary
			expect(init.headers['Content-Type']).toBeUndefined();
			expect(init.headers.Accept).toBe('application/json');
			expect(init.body).toBeInstanceOf(FormData);
		});

		it('should append the passphrase to FormData when provided', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, json: { staging_token: 'tok', cases: [] } })
			);

			const file = new File(['zip'], 'bundle.iris');
			await CaseTransferService.inspect(file, 'mypassphrase');

			const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const form = init.body as FormData;
			expect(form.get('passphrase')).toBe('mypassphrase');
		});

		it('should NOT append passphrase when it is undefined', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, json: { staging_token: 'tok', cases: [] } })
			);

			const file = new File(['zip'], 'bundle.iris');
			await CaseTransferService.inspect(file);

			const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			const form = init.body as FormData;
			expect(form.get('passphrase')).toBeNull();
		});

		it('should return ok:true with parsed BundleInspection on success', async () => {
			const inspection = { staging_token: 'tok-abc', cases: [{ case_name: 'Alpha' }] } as unknown as BundleInspection;
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, json: inspection })
			);

			const file = new File(['zip'], 'bundle.iris');
			const result = await CaseTransferService.inspect(file);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual(inspection);
			}
		});

		it('should return ok:false with encrypted:true when the server signals encryption required', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({
					ok: false,
					status: 422,
					json: { message: 'Passphrase required', data: { encrypted: true } },
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const file = new File(['zip'], 'bundle.iris');
			const result = await CaseTransferService.inspect(file);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.encrypted).toBe(true);
				expect(result.error.status).toBe(422);
			}
		});

		it('should return ok:false without encrypted flag when the archive is not encrypted', async () => {
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({
					ok: false,
					status: 400,
					json: { message: 'Invalid archive' },
					headers: { 'Content-Type': 'application/json' }
				})
			);

			const file = new File(['zip'], 'bundle.iris');
			const result = await CaseTransferService.inspect(file);

			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.encrypted).toBeUndefined();
			}
		});

		it('should attach the Bearer token to the inspect request', async () => {
			(auth.getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('token-xyz');
			(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
				mockFetchResponse({ ok: true, json: { staging_token: 't', cases: [] } })
			);

			await CaseTransferService.inspect(new File(['z'], 'f.iris'));

			const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(init.headers.Authorization).toBe('Bearer token-xyz');
		});
	});

	// ---- apply() -------------------------------------------------------------

	describe('apply()', () => {
		it('should delegate to ApiService.post at /api/v2/cases/import with body and default options', async () => {
			const body: ApplyImportBody = { staging_token: 'tok-1' };
			const mockImported = { case_id: 99, case_name: 'Imported Case' } as unknown as ImportedCase;
			const mockResponse = { ok: true, status: 201, data: mockImported };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseTransferService.apply(body);

			expect(ApiService.post).toHaveBeenCalledTimes(1);
			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/import', body, {});
			expect(res).toBe(mockResponse);
		});

		it('should forward custom ApiOptions to ApiService.post', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const body: ApplyImportBody = { staging_token: 'tok-2' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, data: {} });

			await CaseTransferService.apply(body, options);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/import', body, options);
		});
	});

	// ---- discard() -----------------------------------------------------------

	describe('discard()', () => {
		it('should delegate to ApiService.delete at /api/v2/cases/import/{token} with default options', async () => {
			const mockResponse = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseTransferService.discard('tok-abc');

			expect(ApiService.delete).toHaveBeenCalledTimes(1);
			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/import/tok-abc', {});
			expect(res).toBe(mockResponse);
		});

		it('should embed the token string correctly in the URL path', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await CaseTransferService.discard('staging-token-xyz');

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/import/staging-token-xyz', {});
		});

		it('should forward custom ApiOptions to ApiService.delete', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await CaseTransferService.discard('tok', options);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/import/tok', options);
		});
	});

	// ---- saveArchive() -------------------------------------------------------

	describe('saveArchive()', () => {
		it('should create an anchor, set href+download, click it, and revoke the object URL', () => {
			const blob = new Blob(['data']);
			const fakeUrl = 'blob:http://localhost/fake-uuid';

			// jsdom doesn't implement URL.createObjectURL / revokeObjectURL — stub them
			if (!URL.createObjectURL) {
				URL.createObjectURL = () => fakeUrl;
			}
			if (!URL.revokeObjectURL) {
				URL.revokeObjectURL = () => undefined;
			}

			const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(fakeUrl);
			const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

			const anchor = document.createElement('a');
			const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
			const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => anchor);
			const removeSpy = vi.spyOn(anchor, 'remove').mockImplementation(() => undefined);
			vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);

			CaseTransferService.saveArchive({ blob, filename: 'my-case.iris' });

			expect(createSpy).toHaveBeenCalledWith(blob);
			expect(anchor.href).toContain(fakeUrl);
			expect(anchor.download).toBe('my-case.iris');
			expect(appendSpy).toHaveBeenCalledWith(anchor);
			expect(clickSpy).toHaveBeenCalledTimes(1);
			expect(removeSpy).toHaveBeenCalledTimes(1);
			expect(revokeSpy).toHaveBeenCalledWith(fakeUrl);
		});
	});
});
