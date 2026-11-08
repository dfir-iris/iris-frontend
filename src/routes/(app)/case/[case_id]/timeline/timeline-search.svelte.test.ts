import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/case-timeline.service', () => ({
	CaseTimelineService: {
		searchEvents: vi.fn(),
		eventsHistogram: vi.fn(),
		eventsFields: vi.fn()
	}
}));

import { CaseTimelineService } from '$lib/services/case-timeline.service';
import { TimelineSearch } from './timeline-search.svelte';

const event = (id: number) => ({ event_id: id, event_title: `Event ${id}` });

const page = (ids: number[], nextCursor: string | null) => ({
	ok: true,
	data: { events: ids.map(event), next_cursor: nextCursor, has_more: nextCursor !== null, total: 5 }
});

describe('TimelineSearch.exportEvents', () => {
	const searchEvents = vi.mocked(CaseTimelineService.searchEvents);

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.mocked(CaseTimelineService.eventsHistogram).mockResolvedValue({ ok: false } as never);
		vi.mocked(CaseTimelineService.eventsFields).mockResolvedValue({ ok: false } as never);
	});

	const loaded = async () => {
		const search = new TimelineSearch(() => 7);
		search.query = 'asset:DC01';
		searchEvents.mockResolvedValueOnce(page([1, 2], 'c1') as never);
		await search.run();
		searchEvents.mockClear();
		return search;
	};

	it('pages through every match with the whole text, in the scope of the loaded search', async () => {
		const search = await loaded();
		// Typed but not run: the export follows what is shown.
		search.query = 'something else';
		searchEvents
			.mockResolvedValueOnce(page([1, 2, 3], 'c2') as never)
			.mockResolvedValueOnce(page([4, 5], null) as never);

		const events = await search.exportEvents();

		expect(events?.map((e) => e.event_id)).toEqual([1, 2, 3, 4, 5]);
		expect(searchEvents).toHaveBeenCalledTimes(2);
		const [caseId, scope, paging] = searchEvents.mock.calls[1];
		expect(caseId).toBe(7);
		expect(scope.query).toBe('asset:DC01');
		expect(paging).toMatchObject({ cursor: 'c2', full: true, order: 'asc' });
	});

	it('stops at the requested count', async () => {
		const search = await loaded();
		searchEvents.mockResolvedValueOnce(page([1, 2], 'c2') as never);

		const events = await search.exportEvents(2);

		expect(events?.map((e) => e.event_id)).toEqual([1, 2]);
		expect(searchEvents).toHaveBeenCalledTimes(1);
		expect(searchEvents.mock.calls[0][2]).toMatchObject({ limit: 2, cursor: null });
	});

	it('gives null when a page cannot be read', async () => {
		const search = await loaded();
		searchEvents
			.mockResolvedValueOnce(page([1], 'c2') as never)
			.mockResolvedValueOnce({ ok: false } as never);

		expect(await search.exportEvents()).toBeNull();
	});
});
