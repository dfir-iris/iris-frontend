import type { Case } from '$lib/types/resources/case';
import type { CaseIdentifier, ListCasesParams, UpdateCaseBody } from '$lib/services/case.service';
import type { ApiOptions, Paginated } from '$lib/services/api.service';
import { CaseService } from '$lib/services/case.service';

export const CASES_CTX = Symbol('cases');

type Status = 'idle' | 'loading' | 'error';

export const createCasesContext = (getId: (c: Case) => number) => {
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

	const refresh = async (options: ApiOptions = {}) => load(list.params, options);

	const patch = async (id: CaseIdentifier, body: UpdateCaseBody, options: ApiOptions = {}) => {
		const prev = byId[id];

		if (prev) byId[id] = { ...prev, ...(body as Partial<Case>) };

		const res = await CaseService.update(id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const c = res.data;
			byId[getId(c)] = c;
			return;
		}

		await refresh(options);
	};

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		list.params = {};
		list.ids = [];
		list.status = 'idle';
		list.error = null;
	};

	const cases = $derived(() =>
		list.ids.map((id) => byId[id]).filter((c): c is Case => c !== undefined)
	);

	return { byId, list, cases, load, refresh, patch, reset };
};

export type CasesContext = ReturnType<typeof createCasesContext>;
