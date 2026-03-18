import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn()
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

	it('list() should call ApiService.get with /manage/case-templates/list + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					template_id: 1,
					template_name: 'Phishing',
					template_description: 'Phishing investigation template'
				}
			] satisfies CaseTemplate[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-templates/list', options);
		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /manage/case-templates/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				template_id: 7,
				template_name: 'Malware',
				template_description: 'Malware investigation template'
			} satisfies CaseTemplate
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-templates/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /manage/case-templates/add, body, options', async () => {
		const body: CaseTemplateBody = {
			template_name: 'Ransomware',
			template_description: 'Ransomware response template',
			case_name: 'Ransomware incident',
			case_description: 'Initial ransomware triage'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				template_id: 101,
				...body
			} satisfies CaseTemplate
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-templates/add', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.post with /manage/case-templates/update/{id}, body, options', async () => {
		const body: Partial<CaseTemplateBody> = {
			template_description: 'Updated template description'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				template_id: 7,
				template_name: 'Malware',
				template_description: 'Updated template description'
			} satisfies CaseTemplate
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.update(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-templates/update/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.post with /manage/case-templates/delete/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTemplatesService.remove(7, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-templates/delete/7', {}, options);
		expect(res).toBe(mockResponse);
	});
});
