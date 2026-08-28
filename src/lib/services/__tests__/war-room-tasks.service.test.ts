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

import { WarRoomTasksService } from '../war-room-tasks.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

describe('WarRoomTasksService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ---- list() ------------------------------------------------------------

	describe('list()', () => {
		it('GETs /war-rooms/:warRoomId/tasks with no suffix when params is omitted', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const result = await WarRoomTasksService.list(7);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
			expect(result).toEqual({ ok: true, data: [] });
		});

		it('GETs /war-rooms/:warRoomId/tasks with no suffix when params is empty', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, {});
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		it('strips page and per_page — they must never appear in the flat call', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { page: 3, per_page: 50 });
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).not.toContain('page=');
			expect(calledWith).not.toContain('per_page=');
		});

		it('appends q= for the free-text filter', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { q: 'deploy' });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks?q=deploy', {});
		});

		it('forwards ApiOptions', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const opts = { signal: new AbortController().signal };
			await WarRoomTasksService.list(7, {}, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', opts);
		});
	});

	// ---- listPaginated() ---------------------------------------------------

	describe('listPaginated()', () => {
		it('GETs /war-rooms/:warRoomId/tasks with page and per_page in the query string', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { items: [], total: 0 } });
			await WarRoomTasksService.listPaginated(7, { page: 2, per_page: 25 });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?page=2&per_page=25',
				{}
			);
		});

		it('includes page with no per_page when per_page is omitted', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { items: [], total: 0 } });
			await WarRoomTasksService.listPaginated(7, { page: 1 });
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('page=1');
			expect(calledWith).not.toContain('per_page=');
		});

		it('includes all filters together with pagination', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { items: [], total: 0 } });
			await WarRoomTasksService.listPaginated(7, {
				page: 1,
				per_page: 10,
				status_id: [2],
				include_closed: false
			});
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('page=1');
			expect(calledWith).toContain('per_page=10');
			expect(calledWith).toContain('status_id=2');
			expect(calledWith).toContain('include_closed=false');
		});
	});

	// ---- buildListQuery filter coverage ------------------------------------

	describe('buildListQuery — filter combinations (exercised via list())', () => {
		// status_id — multi-value
		it('repeats status_id= for each element', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { status_id: [1, 2, 3] });
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('status_id=1');
			expect(calledWith).toContain('status_id=2');
			expect(calledWith).toContain('status_id=3');
		});

		it('omits status_id entirely when the array is empty', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { status_id: [] });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		// tag — multi-value
		it('repeats tag= for each element', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { tag: ['critical', 'network'] });
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('tag=critical');
			expect(calledWith).toContain('tag=network');
		});

		it('omits tag entirely when the array is empty', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { tag: [] });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		// assignee_id — multi-value, supports 'unassigned'
		it('repeats assignee_id= for numeric entries', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { assignee_id: [10, 20] });
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('assignee_id=10');
			expect(calledWith).toContain('assignee_id=20');
		});

		it('passes "unassigned" as a literal string for assignee_id', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { assignee_id: ['unassigned'] });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?assignee_id=unassigned',
				{}
			);
		});

		it('omits assignee_id entirely when the array is empty', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { assignee_id: [] });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		// parent_task_id
		it('sets parent_task_id=top when parent_task_id is null', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { parent_task_id: null });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?parent_task_id=top',
				{}
			);
		});

		it('sets parent_task_id=top when parent_task_id is "top"', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { parent_task_id: 'top' });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?parent_task_id=top',
				{}
			);
		});

		it('sets parent_task_id=<n> when parent_task_id is a number', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { parent_task_id: 55 });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?parent_task_id=55',
				{}
			);
		});

		it('omits parent_task_id entirely when the key is absent', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, {});
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		// include_closed
		it('sets include_closed=false when explicitly false', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { include_closed: false });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?include_closed=false',
				{}
			);
		});

		it('omits include_closed when it is true', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { include_closed: true });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		// due_from / due_to
		it('appends due_from= and due_to= when provided', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, {
				due_from: '2024-01-01',
				due_to: '2024-01-31'
			});
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('due_from=2024-01-01');
			expect(calledWith).toContain('due_to=2024-01-31');
		});

		it('omits due_from and due_to when not provided', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, {});
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).not.toContain('due_from');
			expect(calledWith).not.toContain('due_to');
		});

		// include_no_due
		it('sets include_no_due=false when explicitly false', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { include_no_due: false });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/7/tasks?include_no_due=false',
				{}
			);
		});

		it('omits include_no_due when it is true', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, { include_no_due: true });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks', {});
		});

		// combined real-world scenario
		it('combines multiple filters correctly', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomTasksService.list(7, {
				status_id: [1, 3],
				tag: ['urgent'],
				assignee_id: [5, 'unassigned'],
				parent_task_id: null,
				include_closed: false,
				due_from: '2024-06-01',
				due_to: '2024-06-30'
			});
			const calledWith: string = (ApiService.get as unknown as ReturnType<typeof vi.fn>).mock
				.calls[0][0];
			expect(calledWith).toContain('status_id=1');
			expect(calledWith).toContain('status_id=3');
			expect(calledWith).toContain('tag=urgent');
			expect(calledWith).toContain('assignee_id=5');
			expect(calledWith).toContain('assignee_id=unassigned');
			expect(calledWith).toContain('parent_task_id=top');
			expect(calledWith).toContain('include_closed=false');
			expect(calledWith).toContain('due_from=2024-06-01');
			expect(calledWith).toContain('due_to=2024-06-30');
		});
	});

	// ---- listUsedTags() ----------------------------------------------------

	describe('listUsedTags()', () => {
		it('GETs /war-rooms/:warRoomId/tasks/tags', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: ['critical', 'network'] });
			const result = await WarRoomTasksService.listUsedTags(7);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/tasks/tags', {});
			expect(result).toEqual({ ok: true, data: ['critical', 'network'] });
		});
	});

	// ---- create() ----------------------------------------------------------

	describe('create()', () => {
		it('POSTs to /war-rooms/:warRoomId/tasks with the supplied body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { task_id: 1 } });
			const body = { title: 'Investigate logs', assignee_id: 5 };
			const result = await WarRoomTasksService.create(7, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/tasks', body, {});
			expect(result).toEqual({ ok: true, data: { task_id: 1 } });
		});

		it('accepts a minimal body with only a title', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { task_id: 2 } });
			await WarRoomTasksService.create(7, { title: 'Quick task' });
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/7/tasks',
				{ title: 'Quick task' },
				{}
			);
		});
	});

	// ---- update() uses PATCH -----------------------------------------------

	describe('update()', () => {
		it('PATCHes /war-rooms/:warRoomId/tasks/:taskId with the supplied body', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: { task_id: 1 } });
			const body = { title: 'Renamed', status_id: 2 };
			const result = await WarRoomTasksService.update(7, 1, body);
			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/7/tasks/1', body, {});
			expect(result).toEqual({ ok: true, data: { task_id: 1 } });
		});

		it('does NOT call ApiService.put', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomTasksService.update(7, 1, { title: 'x' });
			expect(ApiService.put).not.toHaveBeenCalled();
		});
	});

	// ---- close() -----------------------------------------------------------

	describe('close()', () => {
		it('POSTs to /war-rooms/:warRoomId/tasks/:taskId/close with an empty body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { task_id: 1, closed_at: 'now' } });
			const result = await WarRoomTasksService.close(7, 1);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/tasks/1/close', {}, {});
			expect(result).toEqual({ ok: true, data: { task_id: 1, closed_at: 'now' } });
		});
	});

	// ---- reopen() ----------------------------------------------------------

	describe('reopen()', () => {
		it('POSTs to /war-rooms/:warRoomId/tasks/:taskId/reopen with an empty body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { task_id: 1, closed_at: null } });
			const result = await WarRoomTasksService.reopen(7, 1);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/tasks/1/reopen', {}, {});
			expect(result).toEqual({ ok: true, data: { task_id: 1, closed_at: null } });
		});
	});

	// ---- remove() ----------------------------------------------------------

	describe('remove()', () => {
		it('DELETEs /war-rooms/:warRoomId/tasks/:taskId', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			const result = await WarRoomTasksService.remove(7, 1);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/7/tasks/1', {});
			expect(result).toEqual({ ok: true, data: null });
		});
	});
});
