import { CaseTemplatesService } from '$lib/services/case-templates.service';
import type {
	CaseTemplate,
	CaseTemplateIdentifier,
	CaseTemplateBody
} from '$lib/services/case-templates.service';
import type { ApiOptions } from '$lib/services/api.service';

export const CASE_TEMPLATES_CTX = Symbol('case-templates');

type Status = 'idle' | 'loading' | 'error';

export const createCaseTemplatesContext = (getId: (t: CaseTemplate) => number) => {
	const byId = $state<Record<number, CaseTemplate>>({});

	const list = $state<{
		ids: number[];
		status: Status;
		error: string | null;
	}>({
		ids: [],
		status: 'idle',
		error: null
	});

	const load = async (options: ApiOptions = {}) => {
		list.status = 'loading';
		list.error = null;

		const res = await CaseTemplatesService.list(options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load case templates';

			return;
		}

		for (const template of res.data) byId[getId(template)] = template;

		list.ids = res.data.map(getId);
		list.status = 'idle';
	};

	const refresh = async (options: ApiOptions = {}) => load(options);

	const get = async (
		id: CaseTemplateIdentifier,
		options: ApiOptions = {}
	): Promise<CaseTemplate | null> => {
		const res = await CaseTemplatesService.get(id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const template = res.data;
			byId[getId(template)] = template;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return template;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const create = async (
		body: CaseTemplateBody,
		options: ApiOptions = {}
	): Promise<CaseTemplate | null> => {
		const res = await CaseTemplatesService.create(body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const template = res.data;
			byId[getId(template)] = template;

			const id = getId(template);
			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return template;
		}

		await refresh(options);
		return null;
	};

	const patch = async (
		id: CaseTemplateIdentifier,
		body: Partial<CaseTemplateBody>,
		options: ApiOptions = {}
	): Promise<CaseTemplate | null> => {
		const prev = byId[id];

		if (prev) byId[id] = { ...prev, ...body };

		const res = await CaseTemplatesService.update(id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const template = res.data;
			byId[getId(template)] = template;
			return template;
		}

		await refresh(options);
		return await get(id, options);
	};

	const remove = async (id: CaseTemplateIdentifier, options: ApiOptions = {}): Promise<boolean> => {
		const prev = byId[id];

		if (prev) delete byId[id];
		if (list.ids.includes(id)) list.ids = list.ids.filter((x) => x !== id);

		const res = await CaseTemplatesService.remove(id, options);

		if (res.ok && !res.error) return true;

		if (prev) byId[id] = prev;
		if (!list.ids.includes(id)) list.ids = [id, ...list.ids];

		await refresh(options);
		return false;
	};

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		list.ids = [];
		list.status = 'idle';
		list.error = null;
	};

	const caseTemplates = $derived(
		list.ids.map((id) => byId[id]).filter((t): t is CaseTemplate => t !== undefined)
	);

	return {
		byId,
		list,
		caseTemplates,
		load,
		refresh,
		get,
		create,
		patch,
		remove,
		reset
	};
};

export type CaseTemplatesContext = ReturnType<typeof createCaseTemplatesContext>;
