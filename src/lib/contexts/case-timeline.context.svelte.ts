import { CaseTimelineService } from '$lib/services/case-timeline.service';
import type {
	CaseTimelineEvent,
	CaseTimelineEventIdentifier,
	CaseTimelineFilterQuery,
	CaseTimelineState,
	CreateCaseTimelineEventBody,
	UpdateCaseTimelineEventBody
} from '$lib/services/case-timeline.service';
import type { ApiOptions } from '$lib/services/api.service';

export const CASE_TIMELINE_CTX = Symbol('case-timeline');

type Status = 'idle' | 'loading' | 'loading_more' | 'loading_all' | 'error';

type UIState = {
	selectedEventId?: number;
};

const DEFAULT_PER_PAGE = 30;

const getEventId = (event: CaseTimelineEvent): number => event.event_id;

const sortEvents = (events: CaseTimelineEvent[]) =>
	[...events].sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

export const createCaseTimelineContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, CaseTimelineEvent>>({});

	const list = $state<{
		eventIds: number[];
		status: Status;
		error: string | null;
		state: CaseTimelineState | null;
		query: CaseTimelineFilterQuery;
		currentPage: number;
		lastPage: number;
		nextPage: number | null;
		perPage: number;
		total: number;
		allLoaded: boolean;
	}>({
		eventIds: [],
		status: 'idle',
		error: null,
		state: null,
		query: {},
		currentPage: 1,
		lastPage: 1,
		nextPage: null,
		perPage: DEFAULT_PER_PAGE,
		total: 0,
		allLoaded: false
	});

	const ui = $state<UIState>({
		selectedEventId: undefined
	});

	const currentCaseId = $derived(() => getCaseId());

	const currentEvent = $derived(() =>
		ui.selectedEventId !== undefined ? byId[ui.selectedEventId] : undefined
	);

	const events = $derived(() =>
		list.eventIds.map((id) => byId[id]).filter((event): event is CaseTimelineEvent => !!event)
	);

	const replaceEventsState = (events: CaseTimelineEvent[]) => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		const ordered = sortEvents(events);

		for (const event of ordered) {
			byId[getEventId(event)] = event;
		}

		list.eventIds = ordered.map(getEventId);
	};

	const appendEventsState = (events: CaseTimelineEvent[]) => {
		const existingIds = new Set(list.eventIds);

		for (const event of events) {
			byId[getEventId(event)] = event;
		}

		const incomingIds = events.map(getEventId).filter((id) => !existingIds.has(id));
		const merged = [...list.eventIds, ...incomingIds];

		const ordered = merged
			.map((id) => byId[id])
			.filter((event): event is CaseTimelineEvent => !!event);

		list.eventIds = sortEvents(ordered).map(getEventId);
	};

	const loadEvents = async (query: CaseTimelineFilterQuery = {}, options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return;

		list.status = 'loading';
		list.error = null;
		list.query = query;
		list.allLoaded = false;

		const res = await CaseTimelineService.listEvents(caseId, query, options, {
			page: 1,
			per_page: list.perPage
		});

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load timeline';
			return;
		}

		replaceEventsState(res.data.timeline ?? res.data.tim ?? []);
		list.state = res.data.state ?? null;

		const pagination = res.data.pagination;
		if (pagination) {
			list.currentPage = pagination.current_page;
			list.lastPage = pagination.last_page;
			list.nextPage = pagination.next_page;
			list.total = pagination.total;
		} else {
			list.currentPage = 1;
			list.lastPage = 1;
			list.nextPage = null;
			list.total = list.eventIds.length;
		}
		if (list.nextPage === null) list.allLoaded = true;

		list.status = 'idle';
	};

	const loadMore = async (options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return;
		if (list.nextPage === null) return;
		if (list.status === 'loading' || list.status === 'loading_more') return;

		list.status = 'loading_more';

		const nextPage = list.nextPage;

		const res = await CaseTimelineService.listEvents(caseId, list.query, options, {
			page: nextPage,
			per_page: list.perPage
		});

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load more timeline events';
			return;
		}

		appendEventsState(res.data.timeline ?? res.data.tim ?? []);

		const pagination = res.data.pagination;
		if (pagination) {
			list.currentPage = pagination.current_page;
			list.lastPage = pagination.last_page;
			list.nextPage = pagination.next_page;
			list.total = pagination.total;
		} else {
			list.nextPage = null;
		}
		if (list.nextPage === null) list.allLoaded = true;

		list.status = 'idle';
	};

	const refresh = async (query: CaseTimelineFilterQuery = {}, options: ApiOptions = {}) => {
		await loadEvents(query, options);
	};

	// Pulls every remaining page in sequence and appends them. Used by the
	// quick-search bar: we want substring matching to work across the entire
	// timeline, not just the pages the user has already scrolled past. Bails
	// out early if there's nothing more to load. `allLoaded` flips to true
	// only when the response confirms there is no next page, so a later
	// filter change correctly resets and pulls again.
	const loadAll = async (options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return;
		if (list.nextPage === null) {
			list.allLoaded = true;
			return;
		}
		if (list.status === 'loading_all') return;

		list.status = 'loading_all';

		try {
			while (list.nextPage !== null) {
				const nextPage = list.nextPage;
				const res = await CaseTimelineService.listEvents(caseId, list.query, options, {
					page: nextPage,
					per_page: list.perPage
				});

				if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
					list.error = res.error?.message ?? 'Failed to load timeline events';
					list.status = 'error';
					return;
				}

				appendEventsState(res.data.timeline ?? res.data.tim ?? []);

				const pagination = res.data.pagination;
				if (pagination) {
					list.currentPage = pagination.current_page;
					list.lastPage = pagination.last_page;
					list.nextPage = pagination.next_page;
					list.total = pagination.total;
				} else {
					list.nextPage = null;
				}
			}
			list.allLoaded = true;
		} finally {
			if (list.status === 'loading_all') list.status = 'idle';
		}
	};

	const getEvent = async (
		id: CaseTimelineEventIdentifier,
		options: ApiOptions = {}
	): Promise<CaseTimelineEvent | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const cached = byId[id];
		const res = await CaseTimelineService.getEvent(caseId, id, options);

		if (!res.ok || !res.data || typeof res.data === 'string') return null;

		const event: CaseTimelineEvent = {
			...res.data,
			event_assets: res.data.event_assets ?? cached?.event_assets,
			event_iocs: res.data.event_iocs ?? cached?.event_iocs
		};

		byId[getEventId(event)] = event;

		if (!list.eventIds.includes(id)) {
			list.eventIds = [...list.eventIds, id];
		}

		return event;
	};

	const createEvent = async (
		body: CreateCaseTimelineEventBody,
		options: ApiOptions = {}
	): Promise<CaseTimelineEvent | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const res = await CaseTimelineService.createEvent(caseId, body, options);

		if (!res.ok || !res.data || typeof res.data === 'string') return null;

		const event = res.data;
		byId[getEventId(event)] = event;
		ui.selectedEventId = getEventId(event);

		await refresh(list.query, options);
		return byId[event.event_id] ?? event;
	};

	const patchEvent = async (
		id: CaseTimelineEventIdentifier,
		body: UpdateCaseTimelineEventBody,
		options: ApiOptions = {}
	): Promise<CaseTimelineEvent | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const res = await CaseTimelineService.updateEvent(caseId, id, body, options);

		if (!res.ok || !res.data || typeof res.data === 'string') return null;

		const savedEvent = res.data;
		byId[getEventId(savedEvent)] = savedEvent;

		await refresh(list.query, options);

		if (byId[id]) {
			byId[id] = {
				...byId[id],
				event_assets: savedEvent.event_assets ?? byId[id].event_assets,
				event_iocs: savedEvent.event_iocs ?? byId[id].event_iocs
			};
		}

		return byId[id] ?? savedEvent;
	};

	const removeEvent = async (
		id: CaseTimelineEventIdentifier,
		options: ApiOptions = {}
	): Promise<boolean> => {
		const caseId = getCaseId();
		if (caseId === null) return false;

		const res = await CaseTimelineService.removeEvent(caseId, id, options);

		if (!res.ok) return false;

		delete byId[id];
		list.eventIds = list.eventIds.filter((eventId) => eventId !== id);

		if (ui.selectedEventId === id) {
			ui.selectedEventId = undefined;
		}

		await refresh(list.query, options);
		return true;
	};

	const removeEvents = async (
		ids: CaseTimelineEventIdentifier[],
		options: ApiOptions = {}
	): Promise<{ removed: CaseTimelineEventIdentifier[]; failed: CaseTimelineEventIdentifier[] }> => {
		const caseId = getCaseId();
		if (caseId === null) return { removed: [], failed: [...ids] };

		const outcomes = await Promise.allSettled(
			ids.map((id) => CaseTimelineService.removeEvent(caseId, id, options))
		);

		const removed: CaseTimelineEventIdentifier[] = [];
		const failed: CaseTimelineEventIdentifier[] = [];

		outcomes.forEach((outcome, index) => {
			const id = ids[index];
			if (outcome.status === 'fulfilled' && outcome.value.ok) {
				removed.push(id);
			} else {
				failed.push(id);
			}
		});

		for (const id of removed) {
			delete byId[id];
			if (ui.selectedEventId === id) ui.selectedEventId = undefined;
		}

		if (removed.length > 0) {
			list.eventIds = list.eventIds.filter((eventId) => !removed.includes(eventId));
			await refresh(list.query, options);
		}

		return { removed, failed };
	};

	const selectEvent = (id?: number) => {
		ui.selectedEventId = id;
	};

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		list.eventIds = [];
		list.status = 'idle';
		list.error = null;
		list.state = null;
		list.query = {};
		list.currentPage = 1;
		list.lastPage = 1;
		list.nextPage = null;
		list.total = 0;
		list.allLoaded = false;

		ui.selectedEventId = undefined;
	};

	return {
		byId,
		list,
		ui,
		currentCaseId,
		currentEvent,
		events,
		loadEvents,
		loadMore,
		loadAll,
		refresh,
		getEvent,
		createEvent,
		patchEvent,
		removeEvent,
		removeEvents,
		selectEvent,
		reset
	};
};

export type CaseTimelineContext = ReturnType<typeof createCaseTimelineContext>;
