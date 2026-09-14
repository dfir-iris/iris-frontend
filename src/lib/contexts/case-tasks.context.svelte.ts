import type { Task } from '$lib/types/resources/task';
import type { ApiOptions } from '$lib/services/api.service';
import { CaseTasksService } from '$lib/services/case-tasks.service';
import type {
	CaseTaskIdentifier,
	CreateCaseTaskBody,
	ListCaseTasksParams,
	UpdateCaseTaskBody
} from '$lib/services/case-tasks.service';

export const CASE_TASKS_CTX = Symbol('case-tasks');

type Status = 'idle' | 'loading' | 'error';

/**
 * `board` is a full-width view: it replaces the sidebar/detail split
 * entirely, which is why the mode lives on the shared context rather
 * than inside the sidebar — the tasks layout has to see it too.
 */
export type TaskViewMode = 'cards' | 'table' | 'board';

type UIState = {
	selectedTaskId?: number;
	showAddModal: boolean;
	viewMode: TaskViewMode;
};

const getTaskId = (task: Task): number => task.id;

const normalizeListParams = (
	params: ListCaseTasksParams
): Required<Omit<ListCaseTasksParams, 'custom_conditions'>> &
	Pick<ListCaseTasksParams, 'custom_conditions'> => ({
	page: params.page ?? 1,
	per_page: params.per_page ?? 20,
	order_by: params.order_by ?? 'id',
	sort_dir: params.sort_dir ?? 'desc',
	custom_conditions: params.custom_conditions
});

export const createCaseTasksContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, Task>>({});

	const list = $state<{
		ids: number[];
		params: Required<Omit<ListCaseTasksParams, 'custom_conditions'>> &
			Pick<ListCaseTasksParams, 'custom_conditions'>;
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
		selectedTaskId: undefined,
		showAddModal: false,
		viewMode: 'cards'
	});

	const mutation = $state<{ error: string | null }>({ error: null });

	const currentCaseId = $derived(() => getCaseId());

	const currentTask = $derived(() =>
		ui.selectedTaskId !== undefined ? byId[ui.selectedTaskId] : undefined
	);

	const tasks = $derived(() =>
		list.ids.map((id) => byId[id]).filter((task): task is Task => !!task)
	);

	const replaceListState = (items: Task[]) => {
		const nextIds: number[] = [];

		for (const task of items) {
			const id = getTaskId(task);
			byId[id] = task;
			nextIds.push(id);
		}

		list.ids = nextIds;
	};

	const listPaginated = async (
		params: ListCaseTasksParams = {},
		options: ApiOptions = {}
	): Promise<Task[]> => {
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

		const res = await CaseTasksService.list(caseId, nextParams, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load tasks';
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

	const getTask = async (
		id: CaseTaskIdentifier,
		options: ApiOptions = {}
	): Promise<Task | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const cached = byId[id];
		if (cached) return cached;

		const res = await CaseTasksService.get(caseId, id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const task = res.data;
			byId[id] = task;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return task;
		}

		return null;
	};

	const createTask = async (
		body: CreateCaseTaskBody,
		options: ApiOptions = {}
	): Promise<Task | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseTasksService.create(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const task = res.data;
			const id = getTaskId(task);

			byId[id] = task;
			ui.selectedTaskId = id;

			await refresh(options);
			return byId[id] ?? task;
		}

		await refresh(options);
		return null;
	};

	const patchTask = async (
		id: CaseTaskIdentifier,
		body: UpdateCaseTaskBody,
		options: ApiOptions = {}
	): Promise<Task | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = byId[id];
		if (prev) {
			const merged: Task = { ...prev, ...(body as Partial<Task>) };

			if (body.task_status_id !== undefined && body.task_status_id !== prev.task_status_id) {
				(merged as Partial<Task>).status = undefined;
			}

			byId[id] = merged;
		}

		const res = await CaseTasksService.update(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			byId[id] = res.data;
			return res.data;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const removeTask = async (id: CaseTaskIdentifier, options: ApiOptions = {}): Promise<boolean> => {
		mutation.error = null;

		const caseId = getCaseId();

		if (caseId === null) return false;

		const prev = byId[id];
		const prevIds = [...list.ids];
		const prevSelected = ui.selectedTaskId;

		if (prev) delete byId[id];
		list.ids = list.ids.filter((x) => x !== id);

		if (ui.selectedTaskId === id) {
			ui.selectedTaskId = undefined;
		}

		const res = await CaseTasksService.remove(caseId, id, options);

		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		mutation.error = res.error?.message ?? null;

		if (prev) {
			byId[id] = prev;
		}

		list.ids = prevIds;
		ui.selectedTaskId = prevSelected;

		await refresh(options);
		return false;
	};

	const selectTask = (id?: number) => {
		ui.selectedTaskId = id;
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

		ui.selectedTaskId = undefined;
		ui.showAddModal = false;
		ui.viewMode = 'cards';
	};

	return {
		byId,
		list,
		ui,
		mutation,
		currentCaseId,
		currentTask,
		tasks,
		listPaginated,
		refresh,
		getTask,
		createTask,
		patchTask,
		removeTask,
		selectTask,
		reset
	};
};

export type CaseTasksContext = ReturnType<typeof createCaseTasksContext>;
