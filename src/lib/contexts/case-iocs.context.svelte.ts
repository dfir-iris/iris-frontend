import { CaseIocsService } from '$lib/services/case-iocs.service';
import type {
	CaseIocIdentifier,
	CreateCaseIocBody,
	ListCaseIocsParams,
	UpdateCaseIocBody
} from '$lib/services/case-iocs.service';
import type { ApiOptions } from '$lib/services/api.service';
import type { Ioc } from '$lib/types/resources/ioc';

export const CASE_IOCS_CTX = Symbol('case-iocs');

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedIocId?: number;
	showAddModal: boolean;
};

const getIocId = (ioc: Ioc): number => ioc.ioc_id;

const normalizeListParams = (
	params: ListCaseIocsParams
): Required<Omit<ListCaseIocsParams, 'custom_conditions'>> &
	Pick<ListCaseIocsParams, 'custom_conditions'> => ({
	page: params.page ?? 1,
	per_page: params.per_page ?? 10,
	order_by: params.order_by ?? 'ioc_id',
	sort_dir: params.sort_dir ?? 'desc',
	custom_conditions: params.custom_conditions
});

export const createCaseIocsContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, Ioc>>({});

	const list = $state<{
		ids: number[];
		params: Required<Omit<ListCaseIocsParams, 'custom_conditions'>> &
			Pick<ListCaseIocsParams, 'custom_conditions'>;
		total: number;
		currentPage: number;
		nextPage: number | null;
		lastPage: number | null;
		status: Status;
		error: string | null;
	}>({
		ids: [],
		params: normalizeListParams({}),
		total: 0,
		currentPage: 1,
		nextPage: null,
		lastPage: null,
		status: 'idle',
		error: null
	});

	const ui = $state<UIState>({
		selectedIocId: undefined,
		showAddModal: false
	});

	const currentCaseId = $derived(() => getCaseId());

	const currentIoc = $derived(() =>
		ui.selectedIocId !== undefined ? byId[ui.selectedIocId] : undefined
	);

	const iocs = $derived(() => list.ids.map((id) => byId[id]).filter((ioc): ioc is Ioc => !!ioc));

	const replaceListState = (items: Ioc[]) => {
		const nextIds: number[] = [];

		for (const ioc of items) {
			const id = getIocId(ioc);
			byId[id] = ioc;
			nextIds.push(id);
		}

		list.ids = nextIds;
	};

	const listPaginated = async (
		params: ListCaseIocsParams = {},
		options: ApiOptions = {}
	): Promise<Ioc[]> => {
		const caseId = getCaseId();

		if (caseId === null) {
			list.status = 'error';
			list.error = 'Missing case id';
			return [];
		}

		const nextParams = normalizeListParams({
			...list.params,
			...params
		});

		list.status = 'loading';
		list.error = null;

		const res = await CaseIocsService.list(caseId, nextParams, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load IOCs';
			return [];
		}

		const items = res.data.data;

		replaceListState(items);
		list.params = nextParams;
		list.total = res.data.total;
		list.currentPage = res.data.current_page;
		list.nextPage = res.data.next_page;
		list.lastPage = res.data.last_page;
		list.status = 'idle';

		return items;
	};

	const refresh = async (options: ApiOptions = {}) => {
		return await listPaginated(list.params, options);
	};

	const getIoc = async (id: CaseIocIdentifier, options: ApiOptions = {}): Promise<Ioc | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const cached = byId[id];
		if (cached) return cached;

		const res = await CaseIocsService.get(caseId, id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const ioc = res.data;
			byId[id] = ioc;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return ioc;
		}

		return null;
	};

	const createIoc = async (
		body: CreateCaseIocBody,
		options: ApiOptions = {}
	): Promise<Ioc | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseIocsService.create(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const ioc = res.data;
			const id = getIocId(ioc);

			byId[id] = ioc;
			ui.selectedIocId = id;

			await refresh(options);
			return byId[id] ?? ioc;
		}

		await refresh(options);
		return null;
	};

	const patchIoc = async (
		id: CaseIocIdentifier,
		body: UpdateCaseIocBody,
		options: ApiOptions = {}
	): Promise<Ioc | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = byId[id];
		if (prev) {
			const merged: Ioc = { ...prev, ...(body as Partial<Ioc>) };

			if (body.ioc_type_id !== undefined && body.ioc_type_id !== prev.ioc_type_id) {
				merged.ioc_type = undefined;
			}
			if (body.ioc_tlp_id !== undefined && body.ioc_tlp_id !== prev.ioc_tlp_id) {
				merged.tlp = undefined;
			}

			byId[id] = merged;
		}

		const res = await CaseIocsService.update(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			byId[id] = res.data;
			return res.data;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const removeIoc = async (id: CaseIocIdentifier, options: ApiOptions = {}): Promise<boolean> => {
		const caseId = getCaseId();

		if (caseId === null) return false;

		const prev = byId[id];
		const prevIds = [...list.ids];
		const prevSelected = ui.selectedIocId;

		if (prev) delete byId[id];
		list.ids = list.ids.filter((x) => x !== id);

		if (ui.selectedIocId === id) {
			ui.selectedIocId = undefined;
		}

		const res = await CaseIocsService.remove(caseId, id, options);

		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		if (prev) {
			byId[id] = prev;
		}

		list.ids = prevIds;
		ui.selectedIocId = prevSelected;

		await refresh(options);
		return false;
	};

	const selectIoc = (id?: number) => {
		ui.selectedIocId = id;
	};

	const reset = () => {
		for (const key of Object.keys(byId)) {
			delete byId[Number(key)];
		}

		list.ids = [];
		list.params = normalizeListParams({});
		list.total = 0;
		list.currentPage = 1;
		list.nextPage = null;
		list.lastPage = null;
		list.status = 'idle';
		list.error = null;

		ui.selectedIocId = undefined;
		ui.showAddModal = false;
	};

	return {
		byId,
		list,
		ui,
		currentCaseId,
		currentIoc,
		iocs,
		listPaginated,
		refresh,
		getIoc,
		createIoc,
		patchIoc,
		removeIoc,
		selectIoc,
		reset
	};
};

export type CaseIocsContext = ReturnType<typeof createCaseIocsContext>;
