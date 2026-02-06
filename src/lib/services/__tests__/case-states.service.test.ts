import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseStatesService } from '../case-states.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { CaseState, CaseStateBody } from '../case-states.service';

describe('CaseStatesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get with /manage/case-states/list + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					state_id: 1,
					state_name: 'Open',
					state_description: 'Case is open',
					protected: '0'
				}
			] satisfies CaseState[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-states/list', options);
		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /manage/case-states/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				state_id: 7,
				state_name: 'Closed',
				state_description: 'Case is closed',
				protected: '1'
			} satisfies CaseState
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-states/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /manage/case-states/add, body, options', async () => {
		const body: CaseStateBody = {
			state_name: 'In review',
			state_description: 'Case is being reviewed'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				state_id: 101,
				state_name: 'In review',
				state_description: 'Case is being reviewed',
				protected: '0'
			} satisfies CaseState
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-states/add', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.post with /manage/case-states/update/{id}, body, options', async () => {
		const body: CaseStateBody = {
			state_description: 'Updated description'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				state_id: 7,
				state_name: 'Closed',
				state_description: 'Updated description',
				protected: '1'
			} satisfies CaseState
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.update(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-states/update/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.post with /manage/case-states/delete/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.remove(7, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-states/delete/7', {}, options);
		expect(res).toBe(mockResponse);
	});
});
