import { CaseService } from '$lib/services/case.service';
import type {
	CaseIdentifier,
	ListCasesParams,
	UpdateCaseBody,
	CreateCaseBody
} from '$lib/services/case.service';
import type { ApiOptions, Paginated, RequestResponse } from '$lib/services/api.service';
import type { Case } from '$lib/types/resources/case';
import type { AppContext } from './app.context.svelte';

export const CASES_CTX = Symbol('cases');

type Status = 'idle' | 'loading' | 'error';

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

	const ui = $state({
		showAddModal: false
	});

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

	// IMPORTANT: always creates a fresh request/promise
	const listPaginated = (params: ListCasesParams = {}, options: ApiOptions = {}) => {
		const p = CaseService.list(params, options) as Promise<RequestResponse<Paginated<Case>>>;

		// optionally hydrate cache in the background when it resolves
		void (async () => {
			const res = await p;

			if (!res.ok || res.error || res.data === null || typeof res.data === 'string') return;

			const page: Paginated<Case> = res.data;

			for (const c of page.data) byId[getId(c)] = c;

			// keep list state consistent with latest request
			list.params = params;
			list.ids = page.data.map(getId);
			list.status = 'idle';
			list.error = null;
		})();

		return p;
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
		const prev = byId[id];

		if (prev) delete byId[id];
		if (list.ids.includes(id)) list.ids = list.ids.filter((x) => x !== id);

		const res = await CaseService.remove(id, options);

		if (res.ok && !res.error) return true;

		if (prev) byId[id] = prev;
		if (!list.ids.includes(id)) list.ids = [id, ...list.ids];

		await refresh(options);
		return false;
	};

	const close = async (id: CaseIdentifier, options: ApiOptions = {}): Promise<Case | null> => {
		const prev = byId[id];
		if (prev) byId[id] = { ...prev, close_date: new Date().toISOString() };

		const res = await CaseService.close(id, options);

		if (!res.ok || res.error) {
			return await get(id, options);
		}

		return await get(id, options);
	};

	const reopen = async (id: CaseIdentifier, options: ApiOptions = {}): Promise<Case | null> => {
		const prev = byId[id];
		if (prev) byId[id] = { ...prev, close_date: null };

		const res = await CaseService.reopen(id, options);

		if (!res.ok || res.error) {
			return await get(id, options);
		}

		return await get(id, options);
	};

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		list.params = {};
		list.ids = [];
		list.status = 'idle';
		list.error = null;

		ui.showAddModal = false;
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
		cases,
		currentCaseId,
		currentCase,
		ensureCurrentLoaded,
		load,
		listPaginated,
		refresh,
		get,
		create,
		patch,
		remove,
		close,
		reopen,
		reset
	};
};

export type CasesContext = ReturnType<typeof createCasesContext>;
