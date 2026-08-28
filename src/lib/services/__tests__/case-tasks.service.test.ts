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

import { CaseTasksService } from '../case-tasks.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type { Task } from '$lib/types/resources/task';
import type {
	CreateCaseTaskBody,
	UpdateCaseTaskBody,
	ListCaseTasksParams
} from '../case-tasks.service';

const mockTask: Task = {
	id: 42,
	task_uuid: 'eb626d0e-ab81-4137-a8ee-33cfd452df21',
	task_title: 'Investigate endpoint',
	task_description: 'Check the logs',
	task_open_date: '2024-01-07T13:57:05.588940',
	task_tags: 'forensics,endpoint',
	task_status_id: 1,
	status: null,
	task_assignees: null,
	task_assignees_id: null,
	case: null,
	custom_attributes: null,
	modification_history: null
};

describe('CaseTasksService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and call ApiService.get with built path + options', async () => {
		const params: ListCaseTasksParams = {
			page: 2,
			per_page: 25,
			order_by: 'task_title',
			sort_dir: 'asc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };
		const builtPath = '/api/v2/cases/73/tasks?page=2&per_page=25&order_by=task_title&sort_dir=asc';

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: [mockTask],
				last_page: 1,
				current_page: 2,
				next_page: null
			} satisfies Paginated<Task>
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.list(73, params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/73/tasks', params);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/cases/{caseId}/tasks/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: mockTask
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.get(73, 42, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/tasks/42', options);
		expect(res).toBe(mockResponse);
	});

	it('getById() should call ApiService.get with /api/v2/tasks/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: mockTask
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.getById(42, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/tasks/42', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/cases/{caseId}/tasks, body, options', async () => {
		const body: CreateCaseTaskBody = {
			task_title: 'Investigate endpoint',
			task_status_id: 1,
			task_assignees_id: [3, 5],
			task_description: 'Check the logs',
			task_tags: 'forensics,endpoint'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: { ...mockTask, ...body }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.create(73, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/73/tasks', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/cases/{caseId}/tasks/{id}, body, options', async () => {
		const body: UpdateCaseTaskBody = {
			task_title: 'Updated task',
			task_status_id: 4,
			task_assignees_id: [3],
			task_description: 'Updated description',
			task_tags: 'forensics'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { ...mockTask, ...body }
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.update(73, 42, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/73/tasks/42', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.delete with /api/v2/cases/{caseId}/tasks/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.remove(73, 42, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73/tasks/42', options);
		expect(res).toBe(mockResponse);
	});

	it('removeById() should call ApiService.delete with /api/v2/tasks/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTasksService.removeById(42, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/tasks/42', options);
		expect(res).toBe(mockResponse);
	});
});
