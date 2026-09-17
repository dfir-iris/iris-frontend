import { CaseService } from '$lib/services/case.service';
import type {
	CaseIdentifier,
	ListCasesParams,
	UpdateCaseBody,
	CreateCaseBody
} from '$lib/services/case.service';
import {
	CaseStatesService,
	findStateIdByName,
	type CaseState
} from '$lib/services/case-states.service';
import {
	CasesFiltersService,
	type CasesSavedFilter,
	type CreateCasesSavedFilterBody,
	type ListCasesSavedFiltersParams,
	type CasesFilterIdentifier
} from '$lib/services/cases-filters.service';
import type { ApiOptions, Paginated, RequestResponse } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { AppContext } from './app.context.svelte';

export const CASES_CTX = Symbol('cases');

type Status = 'idle' | 'loading' | 'error';

type FilterMsg = {
	total: number;
	cases: Case[];
	current_page?: number;
	last_page?: number;
	next_page?: number | null;
	draw?: number;
};

const isFilterMsg = (v: unknown): v is FilterMsg => {
	if (!v || typeof v !== 'object') return false;
	const o = v as Record<string, unknown>;
	return typeof o.total === 'number' && Array.isArray(o.cases);
};

export const createCasesContext = (getId: (c: Case) => number, app: AppContext) => {
	const byId = $state<Record<number, Case>>({});

	const list = $state<{
		params: ListCasesParams;
		ids: number[];
		status: Status;
		error: string | null;
	}>({
		params: {},
		ids: [],
		status: 'idle',
		error: null
	});

	// `closingNoteDialog` is driven from several places on the case detail
	// screen (topbar chip, overflow menu, state picker, the summary block), so
	// the mode lives here and the dialog itself is mounted once in the case
	// layout. `close` also flips the state; `edit` only rewrites the note.
	const ui = $state({
		showAddModal: false,
		showManageModal: false,
		closingNoteDialog: null as 'close' | 'edit' | null
	});

	const mutation = $state<{ error: string | null }>({ error: null });

	// Saved filter presets for the cases overview page. Loaded lazily
	// (the overview page calls `loadSavedFilters()` on mount); kept
	// here so the same list survives navigation between the overview
	// and any sub-page that wants to surface the user's presets.
	const savedFilters = $state<{
		params: ListCasesSavedFiltersParams;
		items: CasesSavedFilter[];
		status: Status;
		error: string | null;
	}>({
		params: { include_public: 1 },
		items: [],
		status: 'idle',
		error: null
	});

	const loadSavedFilters = async (
		params: ListCasesSavedFiltersParams = savedFilters.params,
		options: ApiOptions = {}
	) => {
		savedFilters.params = params;
		savedFilters.status = 'loading';
		savedFilters.error = null;

		const response = await CasesFiltersService.list(params, options);

		if (
			!response.ok ||
			response.error ||
			response.data === null ||
			typeof response.data === 'string' ||
			!Array.isArray(response.data)
		) {
			savedFilters.status = 'error';
			savedFilters.error = response.error?.message ?? 'Failed to load saved filters';
			savedFilters.items = [];
			return;
		}

		savedFilters.items = response.data;
		savedFilters.status = 'idle';
		savedFilters.error = null;
	};

	const getSavedFilter = async (
		id: CasesFilterIdentifier,
		options: ApiOptions = {}
	): Promise<CasesSavedFilter | null> => {
		const response = await CasesFiltersService.get(id, options);
		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			return response.data;
		}
		return null;
	};

	const createSavedFilter = async (
		body: CreateCasesSavedFilterBody,
		options: ApiOptions = {}
	): Promise<CasesSavedFilter | null> => {
		const response = await CasesFiltersService.create(body, options);
		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			await loadSavedFilters(savedFilters.params, options);
			return response.data;
		}
		return null;
	};

	const removeSavedFilter = async (
		id: CasesFilterIdentifier,
		options: ApiOptions = {}
	): Promise<boolean> => {
		mutation.error = null;

		const response = await CasesFiltersService.remove(id, options);
		if (response.ok && !response.error) {
			await loadSavedFilters(savedFilters.params, options);
			return true;
		}

		mutation.error = response.error?.message ?? null;
		return false;
	};

	const load = async (params: ListCasesParams = {}, options: ApiOptions = {}) => {
		list.params = params;
		list.status = 'loading';
		list.error = null;

		const res = await CaseService.list(params, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load cases';

			return;
		}

		const page: Paginated<Case> = res.data;

		for (const c of page.data) byId[getId(c)] = c;

		list.ids = page.data.map(getId);
		list.status = 'idle';
	};

	const listPaginated = async (params: ListCasesParams = {}, options: ApiOptions = {}) => {
		const p = CaseService.list(params, options) as Promise<RequestResponse<Paginated<Case>>>;

		const res = await p;

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') return;

		const page: Paginated<Case> = res.data;

		for (const c of page.data) byId[getId(c)] = c;

		list.params = params;
		list.ids = page.data.map(getId);
		list.status = 'idle';
		list.error = null;

		return p;
	};

	const filterPaginated = async (
		params: Record<string, unknown> = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Case>>> => {
		const res = await CaseService.filter(params, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			return res as unknown as RequestResponse<Paginated<Case>>;
		}

		const rawData: unknown = res.data;

		const wrapped: unknown =
			rawData && typeof rawData === 'object'
				? ((rawData as Record<string, unknown>).data ?? rawData)
				: rawData;

		const filterMessage = isFilterMsg(rawData) ? rawData : isFilterMsg(wrapped) ? wrapped : null;
		const per_page = Number(params.per_page);

		const pageData: Paginated<Case> = {
			data: filterMessage?.cases ?? [],
			total: filterMessage?.total ?? 0,
			current_page: filterMessage?.current_page ?? 1,
			last_page: filterMessage?.last_page ?? 1,
			next_page: filterMessage?.next_page ?? null,
			per_page
		} as Paginated<Case>;

		return {
			...res,
			data: pageData
		} as unknown as RequestResponse<Paginated<Case>>;
	};

	const refresh = async (options: ApiOptions = {}) => load(list.params, options);

	const get = async (id: CaseIdentifier, options: ApiOptions = {}): Promise<Case | null> => {
		const res = await CaseService.get(id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const c = res.data;
			byId[getId(c)] = c;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return c;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const create = async (body: CreateCaseBody, options: ApiOptions = {}): Promise<Case | null> => {
		const res = await CaseService.create(body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const c = res.data;
			byId[getId(c)] = c;

			const id = getId(c);
			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return c;
		}

		await refresh(options);
		return null;
	};

	const patch = async (
		id: CaseIdentifier,
		body: UpdateCaseBody,
		options: ApiOptions = {}
	): Promise<Case | null> => {
		const prev = byId[id];

		if (prev) byId[id] = { ...prev, ...(body as Partial<Case>) };

		const res = await CaseService.update(id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const c = res.data;
			byId[getId(c)] = c;
			return c;
		}

		await refresh(options);
		return await get(id, options);
	};

	const remove = async (id: CaseIdentifier, options: ApiOptions = {}): Promise<boolean> => {
		mutation.error = null;

		const prev = byId[id];

		if (prev) delete byId[id];
		if (list.ids.includes(id)) list.ids = list.ids.filter((x) => x !== id);

		const res = await CaseService.remove(id, options);

		if (res.ok && !res.error) return true;

		mutation.error = res.error?.message ?? null;

		if (prev) byId[id] = prev;
		if (!list.ids.includes(id)) list.ids = [id, ...list.ids];

		await refresh(options);
		return false;
	};

	// Case states are seeded server-side and don't change at runtime, so we
	// cache the list after first fetch. `close`/`reopen` resolve the target
	// state by name ('Closed' / 'Open') and route through the v2 update PUT.
	// Exposed via `states` so consumers (e.g. the topbar state picker) can
	// render the full state list without re-fetching it.
	const stateStore = $state<{ list: CaseState[] | null; loading: boolean }>({
		list: null,
		loading: false
	});

	const loadStates = async (options: ApiOptions = {}): Promise<CaseState[] | null> => {
		if (stateStore.list) return stateStore.list;
		if (stateStore.loading) return null;
		stateStore.loading = true;
		try {
			const res = await CaseStatesService.list(options);
			if (!res.ok || res.error) {
				console.error('[cases] failed to load case states', res);
				return null;
			}
			// Legacy /manage endpoints wrap the payload in { status, message, data }.
			// Unwrap if present; otherwise accept a raw array.
			const body = res.data as unknown;
			const list = Array.isArray(body)
				? (body as CaseState[])
				: ((body as { data?: CaseState[] })?.data ?? null);
			if (!Array.isArray(list)) {
				console.error('[cases] case-states response missing data array', res);
				return null;
			}
			stateStore.list = list;
			return list;
		} finally {
			stateStore.loading = false;
		}
	};

	const resolveStateId = async (name: string, options: ApiOptions): Promise<number | null> => {
		const list = await loadStates(options);
		if (!list) return null;
		const stateId = findStateIdByName(list, name);
		if (stateId == null) console.error(`[cases] state "${name}" not found in`, list);
		return stateId;
	};

	// `extra` is merged into the same PUT that flips the state, so a state
	// transition and the fields that explain it land in one request. Closing
	// a case with a note must not be two calls: a failed second write would
	// leave the case closed with no explanation.
	const setStateByName = async (
		id: CaseIdentifier,
		targetName: string,
		options: ApiOptions,
		extra?: UpdateCaseBody
	): Promise<Case | null> => {
		const stateId = await resolveStateId(targetName, options);
		if (stateId == null) {
			console.error(`[cases] cannot resolve state id for "${targetName}"; skipping update`);
			return await get(id, options);
		}
		return await patch(id, { state_id: stateId, ...extra }, options);
	};

	// `closingNote` is optional at every layer. Left undefined the body is
	// byte-identical to what this sent before closing notes existed, so
	// callers that don't collect one (and the API-driven e2e suite) are
	// unaffected. An empty/whitespace note is sent as `null` to clear the
	// column rather than persisting `''`.
	const close = async (
		id: CaseIdentifier,
		closingNote?: string | null,
		options: ApiOptions = {}
	): Promise<Case | null> =>
		setStateByName(
			id,
			'Closed',
			options,
			closingNote === undefined ? undefined : { closing_note: closingNote?.trim() || null }
		);

	// Reopening deliberately leaves `closing_note` alone: it's a record of
	// why the case was closed at the time, and reopening is reversible.
	const reopen = async (id: CaseIdentifier, options: ApiOptions = {}): Promise<Case | null> =>
		setStateByName(id, 'Open', options);

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		list.params = {};
		list.ids = [];
		list.status = 'idle';
		list.error = null;

		ui.showAddModal = false;
		ui.showManageModal = false;

		savedFilters.params = { include_public: 1 };
		savedFilters.items = [];
		savedFilters.status = 'idle';
		savedFilters.error = null;
	};

	const cases = $derived(() =>
		list.ids.map((id) => byId[id]).filter((c): c is Case => c !== undefined)
	);

	const currentCaseId = $derived(() => app.state.currentCaseID);

	const currentCase = $derived(() => {
		const id = app.state.currentCaseID;
		return byId[id] ?? null;
	});

	const ensureCurrentLoaded = async (options: ApiOptions = {}): Promise<Case | null> => {
		const id = app.state.currentCaseID;
		if (byId[id]) return byId[id];

		return await get(id, options);
	};

	return {
		byId,
		list,
		ui,
		mutation,
		cases,
		currentCaseId,
		currentCase,
		ensureCurrentLoaded,
		load,
		listPaginated,
		filterPaginated,
		refresh,
		get,
		create,
		patch,
		remove,
		close,
		reopen,
		reset,
		states: () => stateStore.list,
		loadStates,
		savedFilters,
		loadSavedFilters,
		getSavedFilter,
		createSavedFilter,
		removeSavedFilter
	};
};

export type CasesContext = ReturnType<typeof createCasesContext>;
