import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/case-timeline.service', () => ({
	CaseTimelineService: {
		listEvents: vi.fn(),
		getEvent: vi.fn(),
		createEvent: vi.fn(),
		updateEvent: vi.fn(),
		removeEvent: vi.fn()
	}
}));

const { CaseTimelineService } = await import('$lib/services/case-timeline.service');
const { createCaseTimelineContext } = await import('../case-timeline.context.svelte');

const removeEvent = vi.mocked(CaseTimelineService.removeEvent);
const listEvents = vi.mocked(CaseTimelineService.listEvents);

const eventFixture = (id: number) => ({ event_id: id, event_title: `Event ${id}` });

const listResponse = (ids: number[]) => ({
	ok: true,
	error: undefined,
	data: {
		timeline: ids.map(eventFixture),
		state: null,
		pagination: { current_page: 1, last_page: 1, next_page: null, total: ids.length }
	}
});

const seeded = async (ids: number[]) => {
	listEvents.mockResolvedValue(listResponse(ids) as never);

	const timeline = createCaseTimelineContext(() => 1);
	await timeline.loadEvents();

	listEvents.mockClear();

	return timeline;
};

beforeEach(() => {
	vi.clearAllMocks();
	removeEvent.mockResolvedValue({ ok: true } as never);
});

describe('removeEvents', () => {
	it('reports every id as removed when all deletions succeed', async () => {
		const timeline = await seeded([1, 2, 3]);
		listEvents.mockResolvedValue(listResponse([]) as never);

		const result = await timeline.removeEvents([1, 2, 3]);

		expect(result).toEqual({ removed: [1, 2, 3], failed: [] });
		expect(removeEvent).toHaveBeenCalledTimes(3);
	});

	it('refreshes once for the whole batch rather than once per event', async () => {
		const timeline = await seeded([1, 2, 3]);
		listEvents.mockResolvedValue(listResponse([]) as never);

		await timeline.removeEvents([1, 2, 3]);

		expect(listEvents).toHaveBeenCalledTimes(1);
	});

	it('separates the ids that failed from the ones that were removed', async () => {
		const timeline = await seeded([1, 2, 3]);
		removeEvent.mockImplementation(
			async (_caseId, id) => ({ ok: id !== 2 }) as Awaited<ReturnType<typeof removeEvent>>
		);
		listEvents.mockResolvedValue(listResponse([2]) as never);

		const result = await timeline.removeEvents([1, 2, 3]);

		expect(result.removed).toEqual([1, 3]);
		expect(result.failed).toEqual([2]);
	});

	it('treats a rejected request as a failed deletion', async () => {
		const timeline = await seeded([1, 2]);
		removeEvent.mockRejectedValueOnce(new Error('network down'));
		listEvents.mockResolvedValue(listResponse([1]) as never);

		const result = await timeline.removeEvents([1, 2]);

		expect(result.removed).toEqual([2]);
		expect(result.failed).toEqual([1]);
	});

	it('drops removed events from the local list', async () => {
		const timeline = await seeded([1, 2, 3]);
		listEvents.mockResolvedValue(listResponse([2]) as never);

		await timeline.removeEvents([1, 3]);

		expect(timeline.byId[1]).toBeUndefined();
		expect(timeline.byId[3]).toBeUndefined();
		expect(timeline.byId[2]).toBeDefined();
	});

	it('clears the selection when the selected event is removed', async () => {
		const timeline = await seeded([1, 2]);
		timeline.selectEvent(1);
		listEvents.mockResolvedValue(listResponse([2]) as never);

		await timeline.removeEvents([1]);

		expect(timeline.ui.selectedEventId).toBeUndefined();
	});

	it('does not refresh when nothing was removed', async () => {
		const timeline = await seeded([1, 2]);
		removeEvent.mockResolvedValue({ ok: false } as never);

		const result = await timeline.removeEvents([1, 2]);

		expect(result.removed).toEqual([]);
		expect(result.failed).toEqual([1, 2]);
		expect(listEvents).not.toHaveBeenCalled();
	});

	it('fails every id without calling the service when there is no case id', async () => {
		const timeline = createCaseTimelineContext(() => null);

		const result = await timeline.removeEvents([1, 2]);

		expect(result).toEqual({ removed: [], failed: [1, 2] });
		expect(removeEvent).not.toHaveBeenCalled();
	});
});

describe('mutation.error', () => {
	it('starts out unset', async () => {
		const timeline = await seeded([1]);

		expect(timeline.mutation.error).toBeNull();
	});

	it('carries the backend message when a single delete fails', async () => {
		const timeline = await seeded([1]);
		removeEvent.mockResolvedValue({
			ok: false,
			error: { message: 'Insufficient permissions', type: 'forbidden', status: 403 }
		} as never);

		await timeline.removeEvent(1);

		expect(timeline.mutation.error).toBe('Insufficient permissions');
	});

	it('is cleared by the next successful delete', async () => {
		const timeline = await seeded([1, 2]);
		removeEvent.mockResolvedValueOnce({
			ok: false,
			error: { message: 'Insufficient permissions', type: 'forbidden', status: 403 }
		} as never);

		await timeline.removeEvent(1);
		expect(timeline.mutation.error).toBe('Insufficient permissions');

		listEvents.mockResolvedValue(listResponse([1]) as never);
		await timeline.removeEvent(2);

		expect(timeline.mutation.error).toBeNull();
	});

	it('is null when the backend sends no message', async () => {
		const timeline = await seeded([1]);
		removeEvent.mockResolvedValue({ ok: false } as never);

		await timeline.removeEvent(1);

		expect(timeline.mutation.error).toBeNull();
	});
});
