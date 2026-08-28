import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { BannersService } from '../banners.service';
import { ApiService } from '../api.service';

const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = ApiService.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = ApiService.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = ApiService.delete as unknown as ReturnType<typeof vi.fn>;

const fakeBanner = {
	id: 1,
	text: 'System maintenance at midnight',
	purpose: 'warning' as const,
	dismissable: true,
	start_at: '2024-01-01T00:00:00Z',
	end_at: '2024-01-02T00:00:00Z',
	created_at: '2023-12-31T12:00:00Z',
	updated_at: '2023-12-31T12:00:00Z'
};

describe('BannersService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockResolvedValue({ ok: true, data: null });
		mockPost.mockResolvedValue({ ok: true, data: null });
		mockPut.mockResolvedValue({ ok: true, data: null });
		mockDelete.mockResolvedValue({ ok: true, data: null });
	});

	describe('listActive', () => {
		it('calls get on /manage/banners/active', async () => {
			const response = { ok: true, data: [fakeBanner] };
			mockGet.mockResolvedValueOnce(response);
			const result = await BannersService.listActive();
			expect(ApiService.get).toHaveBeenCalledWith('/manage/banners/active', {});
			expect(result).toBe(response);
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await BannersService.listActive(opts);
			expect(ApiService.get).toHaveBeenCalledWith('/manage/banners/active', opts);
		});

		it('returns an empty array when no active banners exist', async () => {
			mockGet.mockResolvedValueOnce({ ok: true, data: [] });
			const result = await BannersService.listActive();
			expect(result).toEqual({ ok: true, data: [] });
		});
	});

	describe('list', () => {
		it('calls get on /manage/banners (full list)', async () => {
			const response = { ok: true, data: [fakeBanner] };
			mockGet.mockResolvedValueOnce(response);
			const result = await BannersService.list();
			expect(ApiService.get).toHaveBeenCalledWith('/manage/banners', {});
			expect(result).toBe(response);
		});

		it('does not call the active endpoint', async () => {
			await BannersService.list();
			const calls = mockGet.mock.calls;
			expect(calls[0][0]).toBe('/manage/banners');
			expect(calls[0][0]).not.toContain('active');
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await BannersService.list(opts);
			expect(ApiService.get).toHaveBeenCalledWith('/manage/banners', opts);
		});
	});

	describe('get', () => {
		it('calls get with the correct id path', async () => {
			const response = { ok: true, data: fakeBanner };
			mockGet.mockResolvedValueOnce(response);
			const result = await BannersService.get(1);
			expect(ApiService.get).toHaveBeenCalledWith('/manage/banners/1', {});
			expect(result).toBe(response);
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await BannersService.get(2, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/manage/banners/2', opts);
		});
	});

	describe('create', () => {
		it('posts to /manage/banners with the body', async () => {
			const body = { text: 'New banner', purpose: 'info' as const, dismissable: false };
			const response = { ok: true, data: { ...fakeBanner, ...body } };
			mockPost.mockResolvedValueOnce(response);
			const result = await BannersService.create(body);
			expect(ApiService.post).toHaveBeenCalledWith('/manage/banners', body, {});
			expect(result).toBe(response);
		});

		it('accepts a body with nullable date fields', async () => {
			const body = { text: 'Permanent banner', purpose: 'error' as const, start_at: null, end_at: null };
			await BannersService.create(body);
			expect(ApiService.post).toHaveBeenCalledWith('/manage/banners', body, {});
		});

		it('passes ApiOptions to post', async () => {
			const opts = { signal: new AbortController().signal };
			await BannersService.create({ text: 'x' }, opts);
			expect(ApiService.post).toHaveBeenCalledWith('/manage/banners', { text: 'x' }, opts);
		});
	});

	describe('update', () => {
		it('calls put (not patch) with the correct id path and body', async () => {
			const body = { text: 'Updated text' };
			const response = { ok: true, data: { ...fakeBanner, text: 'Updated text' } };
			mockPut.mockResolvedValueOnce(response);
			const result = await BannersService.update(1, body);
			expect(ApiService.put).toHaveBeenCalledWith('/manage/banners/1', body, {});
			expect(ApiService.patch).not.toHaveBeenCalled();
			expect(result).toBe(response);
		});

		it('passes ApiOptions to put', async () => {
			const opts = { signal: new AbortController().signal };
			await BannersService.update(1, {}, opts);
			expect(ApiService.put).toHaveBeenCalledWith('/manage/banners/1', {}, opts);
		});
	});

	describe('remove', () => {
		it('calls delete with the correct id path', async () => {
			const response = { ok: true, data: null };
			mockDelete.mockResolvedValueOnce(response);
			const result = await BannersService.remove(1);
			expect(ApiService.delete).toHaveBeenCalledWith('/manage/banners/1', {});
			expect(result).toBe(response);
		});

		it('passes ApiOptions to delete', async () => {
			const opts = { signal: new AbortController().signal };
			await BannersService.remove(2, opts);
			expect(ApiService.delete).toHaveBeenCalledWith('/manage/banners/2', opts);
		});
	});
});
