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

	it('list() hits the v2 case-objects case-states endpoint', async () => {
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

		const urlWithQuery = '/manage/case-objects/case-states?per_page=10000';
		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			urlWithQuery
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.list(options);

		// per_page=10000 sidesteps the v2 default of 10 so dropdowns
		// surface every case state on the deployment.
		expect(ApiService.withQuery).toHaveBeenCalledWith(
			'/manage/case-objects/case-states',
			{ per_page: 10000 }
		);
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(urlWithQuery, options);
		expect(res).toBe(mockResponse);
	});

	it('get() hits the v2 by-id endpoint', async () => {
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
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-objects/case-states/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() POSTs to the v2 collection', async () => {
		const body: CaseStateBody = {
			state_name: 'In review',
			state_description: 'Case is being reviewed'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
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
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/case-objects/case-states',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to the v2 by-id endpoint', async () => {
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

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseStatesService.update(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/case-objects/case-states/7',
			body,
			options
		);
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

		const res = await CaseStatesService.remove(7, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith(
			'/manage/case-objects/case-states/7',
			options
		);
		expect(res).toBe(mockResponse);
	});
});
