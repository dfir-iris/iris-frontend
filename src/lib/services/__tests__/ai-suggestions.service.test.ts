import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn()
	}
}));

import { AiSuggestionsService, aiSuggestionsUnwrapList } from '../ai-suggestions.service';
import { ApiService } from '../api.service';

const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = ApiService.post as unknown as ReturnType<typeof vi.fn>;
const mockWithQuery = ApiService.withQuery as unknown as ReturnType<typeof vi.fn>;

describe('AiSuggestionsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockResolvedValue({ ok: true, status: 200, data: [] });
		mockPost.mockResolvedValue({ ok: true, status: 200, data: null });
		mockWithQuery.mockImplementation((path: string, params: Record<string, string>) => {
			const qs = new URLSearchParams(params).toString();
			return qs ? `${path}?${qs}` : path;
		});
	});

	it('lists by entity and status', async () => {
		await AiSuggestionsService.list({ entity_type: 'alert', entity_id: 7, status: 'all' });
		expect(mockWithQuery).toHaveBeenCalledWith('/ai-suggestions', {
			entity_type: 'alert',
			entity_id: 7,
			status: 'all'
		});
		expect(mockGet).toHaveBeenCalledWith(
			'/ai-suggestions?entity_type=alert&entity_id=7&status=all',
			{}
		);
	});

	it('lists without filters and by run', async () => {
		await AiSuggestionsService.list();
		expect(mockGet).toHaveBeenCalledWith('/ai-suggestions', {});
		await AiSuggestionsService.list({ run_uuid: 'abc' });
		expect(mockGet).toHaveBeenCalledWith('/ai-suggestions?run_uuid=abc', {});
	});

	it('flattens a paginated list', async () => {
		mockGet.mockResolvedValueOnce({ ok: true, status: 200, data: { data: [{ id: 1 }], total: 1 } });
		const res = await AiSuggestionsService.list();
		expect(res.data).toEqual([{ id: 1 }]);
	});

	it('passes errors through', async () => {
		mockGet.mockResolvedValueOnce({ ok: false, status: 403, data: { message: 'no' } });
		const res = await AiSuggestionsService.list();
		expect(res.ok).toBe(false);
		expect(res.status).toBe(403);
	});

	it('counts per entity id', async () => {
		await AiSuggestionsService.counts('case', [1, 2, 3]);
		expect(mockWithQuery).toHaveBeenCalledWith('/ai-suggestions/counts', {
			entity_type: 'case',
			entity_ids: '1,2,3'
		});
		expect(mockGet).toHaveBeenCalledWith(
			'/ai-suggestions/counts?entity_type=case&entity_ids=1%2C2%2C3',
			{}
		);
	});

	it('gets one', async () => {
		await AiSuggestionsService.get(5);
		expect(mockGet).toHaveBeenCalledWith('/ai-suggestions/5', {});
	});

	it('accepts and dismisses with an optional note', async () => {
		await AiSuggestionsService.accept(5);
		expect(mockPost).toHaveBeenCalledWith('/ai-suggestions/5/accept', {}, {});
		await AiSuggestionsService.accept(5, 'ok');
		expect(mockPost).toHaveBeenCalledWith('/ai-suggestions/5/accept', { note: 'ok' }, {});
		await AiSuggestionsService.dismiss(6, 'noise');
		expect(mockPost).toHaveBeenCalledWith('/ai-suggestions/6/dismiss', { note: 'noise' }, {});
		await AiSuggestionsService.dismiss(6);
		expect(mockPost).toHaveBeenCalledWith('/ai-suggestions/6/dismiss', {}, {});
	});

	it('answers an info request', async () => {
		await AiSuggestionsService.answer(9, { host: 'dc01', isolate: true });
		expect(mockPost).toHaveBeenCalledWith(
			'/ai-suggestions/9/answer',
			{ answer: { host: 'dc01', isolate: true } },
			{}
		);
		await AiSuggestionsService.answer(9, {}, 'see ticket');
		expect(mockPost).toHaveBeenCalledWith(
			'/ai-suggestions/9/answer',
			{ answer: {}, note: 'see ticket' },
			{}
		);
	});

	it('unwraps lists defensively', () => {
		expect(aiSuggestionsUnwrapList([{ id: 1 }])).toHaveLength(1);
		expect(aiSuggestionsUnwrapList({ data: [{ id: 2 }] })).toHaveLength(1);
		expect(aiSuggestionsUnwrapList(null)).toEqual([]);
		expect(aiSuggestionsUnwrapList('oops')).toEqual([]);
	});
});
