import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
		// Mirrors the real implementation closely enough for URL assertions:
		// the service builds its list path through `withQuery`.
		withQuery: vi.fn((path: string, params?: Record<string, unknown>) => {
			if (!params) return path;
			const search = new URLSearchParams();
			for (const [k, v] of Object.entries(params)) {
				if (v != null) search.append(k, String(v));
			}
			const qs = search.toString();
			return qs ? `${path}?${qs}` : path;
		})
	}
}));

import { CaseTemplatesService } from '../case-templates.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { CaseTemplate, CaseTemplateBody } from '../case-templates.service';

describe('CaseTemplatesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() unwraps the v2 paginated envelope', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const env = {
			total: 1,
			current_page: 1,
			last_page: 1,
			next_page: null,
			data: [
				{
					id: 1,
					name: 'phishing',
					display_name: 'Phishing',
					description: 'Phishing investigation template'
				}
			] satisfies CaseTemplate[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: env
		});

		const res = await CaseTemplatesService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		// `per_page` is pinned well above the server-side default of 10 so
		// template pickers aren't silently truncated to the first ten rows.
		expect(ApiService.get).toHaveBeenCalledWith(
			'/manage/case-templates?per_page=200&order_by=name&sort_dir=asc',
			options
		);
		// The service flattens the paginated `data: T[]` so consumers
		// see a plain array, matching the legacy `for (template of
		// res.data)` loop in the context store.
		expect(res.data).toEqual(env.data);
	});

	it('get() hits the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 7,
				name: 'malware',
				display_name: 'Malware',
				description: 'Malware investigation template'
			} satisfies CaseTemplate
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-templates/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() POSTs to the v2 collection', async () => {
		const body: CaseTemplateBody = {
			name: 'ransomware',
			display_name: 'Ransomware',
			description: 'Ransomware response template'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				id: 101,
				...body
			} satisfies CaseTemplate
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-templates', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to the v2 by-id endpoint', async () => {
		const body: Partial<CaseTemplateBody> = {
			description: 'Updated template description'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 7,
				name: 'malware',
				display_name: 'Malware',
				description: 'Updated template description'
			} satisfies CaseTemplate
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.update(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/manage/case-templates/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() DELETEs the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.remove(7, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/manage/case-templates/7', options);
		expect(res).toBe(mockResponse);
	});
});
