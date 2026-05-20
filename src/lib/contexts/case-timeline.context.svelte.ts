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

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedEventId?: number;
};

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
	}>({
		eventIds: [],
		status: 'idle',
		error: null,
		state: null
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

	const loadEvents = async (query: CaseTimelineFilterQuery = {}, options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return;

		list.status = 'loading';
		list.error = null;

		const res = await CaseTimelineService.listEvents(caseId, query, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load timeline';
			return;
		}

		replaceEventsState(res.data.timeline ?? res.data.tim ?? []);
		list.state = res.data.state ?? null;
		list.status = 'idle';
	};

	const refresh = async (query: CaseTimelineFilterQuery = {}, options: ApiOptions = {}) => {
		await loadEvents(query, options);
	};

	const getEvent = async (
		id: CaseTimelineEventIdentifier,
		options: ApiOptions = {}
	): Promise<CaseTimelineEvent | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const res = await CaseTimelineService.getEvent(caseId, id, options);

		if (!res.ok || !res.data || typeof res.data === 'string') return null;

		const event = res.data;
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

		await refresh({}, options);
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

		const event = res.data;
		byId[getEventId(event)] = event;

		await refresh({}, options);
		return byId[id] ?? event;
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

		await refresh({}, options);
		return true;
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
		refresh,
		getEvent,
		createEvent,
		patchEvent,
		removeEvent,
		selectEvent,
		reset
	};
};

export type CaseTimelineContext = ReturnType<typeof createCaseTimelineContext>;
