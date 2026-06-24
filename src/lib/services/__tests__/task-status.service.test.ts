import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn()
	}
}));

import { TaskStatusService } from '../task-status.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { TaskStatus } from '$lib/types/resources/task';

const mockStatus: TaskStatus = {
	id: 1,
	status_name: 'To do',
	status_description: 'Task not started',
	status_bscolor: 'warning'
};

describe('TaskStatusService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get and unwrap data envelope', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { data: [mockStatus] }
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await TaskStatusService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/task-statuses', options);
		expect(res.data).toEqual([mockStatus]);
	});

	it('list() should return empty array on error response', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 500,
			data: null,
			error: { message: 'Server error' }
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await TaskStatusService.list(options);

		expect(res.data).toEqual([]);
	});

	it('get() falls back to filtering the full list (no v2 by-id endpoint)', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: [mockStatus] }
		});

		const res = await TaskStatusService.get(1, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		// `get()` falls back to a list fetch + local filter — v2
		// doesn't expose a bare /<id> for task statuses (small
		// seeded table).
		expect(ApiService.get).toHaveBeenCalledWith('/manage/task-statuses', options);
		expect(res.data).toEqual(mockStatus);
	});

	it('get() returns null when the row is missing', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 500,
			data: null
		});

		const res = await TaskStatusService.get(999, options);

		expect(res.data).toBeNull();
	});
});
