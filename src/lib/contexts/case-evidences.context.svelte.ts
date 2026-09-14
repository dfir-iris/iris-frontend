import type { Evidence } from '$lib/types/resources/evidence';
import type { ApiOptions } from '$lib/services/api.service';
import { CaseEvidencesService } from '$lib/services/case-evidences.service';
import type {
	CaseEvidenceIdentifier,
	CreateCaseEvidenceBody,
	ListCaseEvidencesParams,
	UpdateCaseEvidenceBody
} from '$lib/services/case-evidences.service';

export const CASE_EVIDENCES_CTX = Symbol('case-evidences');

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedEvidenceId?: number;
	showAddModal: boolean;
};

const getEvidenceId = (evidence: Evidence): number => evidence.id;

const normalizeListParams = (
	params: ListCaseEvidencesParams
): Required<Omit<ListCaseEvidencesParams, 'custom_conditions'>> &
	Pick<ListCaseEvidencesParams, 'custom_conditions'> => ({
	page: params.page ?? 1,
	per_page: params.per_page ?? 20,
	order_by: params.order_by ?? 'date_added',
	sort_dir: params.sort_dir ?? 'desc',
	custom_conditions: params.custom_conditions
});

export const createCaseEvidencesContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, Evidence>>({});

	const list = $state<{
		ids: number[];
		params: Required<Omit<ListCaseEvidencesParams, 'custom_conditions'>> &
			Pick<ListCaseEvidencesParams, 'custom_conditions'>;
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
		selectedEvidenceId: undefined,
		showAddModal: false
	});

	const mutation = $state<{ error: string | null }>({ error: null });

	const currentCaseId = $derived(() => getCaseId());

	const currentEvidence = $derived(() =>
		ui.selectedEvidenceId !== undefined ? byId[ui.selectedEvidenceId] : undefined
	);

	const evidences = $derived(() =>
		list.ids.map((id) => byId[id]).filter((evidence): evidence is Evidence => !!evidence)
	);

	const replaceListState = (items: Evidence[]) => {
		const nextIds: number[] = [];

		for (const evidence of items) {
			const id = getEvidenceId(evidence);
			byId[id] = evidence;
			nextIds.push(id);
		}

		list.ids = nextIds;
	};

	const listPaginated = async (
		params: ListCaseEvidencesParams = {},
		options: ApiOptions = {}
	): Promise<Evidence[]> => {
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

		const res = await CaseEvidencesService.list(caseId, nextParams, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load evidences';
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

	const getEvidence = async (
		id: CaseEvidenceIdentifier,
		options: ApiOptions = {}
	): Promise<Evidence | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const cached = byId[id];
		if (cached) return cached;

		const res = await CaseEvidencesService.get(caseId, id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const evidence = res.data;
			byId[id] = evidence;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return evidence;
		}

		return null;
	};

	const createEvidence = async (
		body: CreateCaseEvidenceBody,
		options: ApiOptions = {}
	): Promise<Evidence | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseEvidencesService.create(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const evidence = res.data;
			const id = getEvidenceId(evidence);

			byId[id] = evidence;
			ui.selectedEvidenceId = id;

			await refresh(options);
			return byId[id] ?? evidence;
		}

		await refresh(options);
		return null;
	};

	const patchEvidence = async (
		id: CaseEvidenceIdentifier,
		body: UpdateCaseEvidenceBody,
		options: ApiOptions = {}
	): Promise<Evidence | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = byId[id];
		if (prev) {
			const merged: Evidence = { ...prev, ...(body as Partial<Evidence>) };

			if (body.type_id !== undefined && body.type_id !== prev.type_id) {
				merged.type = null;
			}

			byId[id] = merged;
		}

		const res = await CaseEvidencesService.update(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			byId[id] = res.data;
			return res.data;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const removeEvidence = async (
		id: CaseEvidenceIdentifier,
		options: ApiOptions = {}
	): Promise<boolean> => {
		mutation.error = null;

		const caseId = getCaseId();

		if (caseId === null) return false;

		const prev = byId[id];
		const prevIds = [...list.ids];
		const prevSelected = ui.selectedEvidenceId;

		if (prev) delete byId[id];
		list.ids = list.ids.filter((x) => x !== id);

		if (ui.selectedEvidenceId === id) {
			ui.selectedEvidenceId = undefined;
		}

		const res = await CaseEvidencesService.remove(caseId, id, options);

		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		mutation.error = res.error?.message ?? null;

		if (prev) {
			byId[id] = prev;
		}

		list.ids = prevIds;
		ui.selectedEvidenceId = prevSelected;

		await refresh(options);
		return false;
	};

	const selectEvidence = (id?: number) => {
		ui.selectedEvidenceId = id;
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

		ui.selectedEvidenceId = undefined;
		ui.showAddModal = false;
	};

	return {
		byId,
		list,
		ui,
		mutation,
		currentCaseId,
		currentEvidence,
		evidences,
		listPaginated,
		refresh,
		getEvidence,
		createEvidence,
		patchEvidence,
		removeEvidence,
		selectEvidence,
		reset
	};
};

export type CaseEvidencesContext = ReturnType<typeof createCaseEvidencesContext>;
