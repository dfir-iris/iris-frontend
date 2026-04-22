import { CaseAssetsService } from '$lib/services/case-assets.service';
import type {
	CaseAssetIdentifier,
	CreateCaseAssetBody,
	ListCaseAssetsParams,
	UpdateCaseAssetBody
} from '$lib/services/case-assets.service';
import type { ApiOptions } from '$lib/services/api.service';
import type { Asset } from '$lib/types/resources/asset';

export const CASE_ASSETS_CTX = Symbol('case-assets');

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedAssetId?: number;
};

const getAssetId = (asset: Asset): number => asset.asset_id;

const normalizeListParams = (params: ListCaseAssetsParams): Required<ListCaseAssetsParams> => ({
	page: params.page ?? 1,
	per_page: params.per_page ?? 10,
	order_by: params.order_by ?? 'asset_id',
	sort_dir: params.sort_dir ?? 'desc'
});

export const createCaseAssetsContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, Asset>>({});

	const list = $state<{
		ids: number[];
		params: Required<ListCaseAssetsParams>;
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
		selectedAssetId: undefined
	});

	const currentCaseId = $derived(() => getCaseId());

	const currentAsset = $derived(() =>
		ui.selectedAssetId !== undefined ? byId[ui.selectedAssetId] : undefined
	);

	const assets = $derived(() =>
		list.ids.map((id) => byId[id]).filter((asset): asset is Asset => !!asset)
	);

	const replaceListState = (items: Asset[]) => {
		const nextIds: number[] = [];

		for (const asset of items) {
			const id = getAssetId(asset);
			byId[id] = asset;
			nextIds.push(id);
		}

		list.ids = nextIds;
	};

	const listPaginated = async (
		params: ListCaseAssetsParams = {},
		options: ApiOptions = {}
	): Promise<Asset[]> => {
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

		const res = await CaseAssetsService.list(caseId, nextParams, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.status = 'error';
			list.error = res.error?.message ?? 'Failed to load assets';
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

	const getAsset = async (
		id: CaseAssetIdentifier,
		options: ApiOptions = {}
	): Promise<Asset | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const cached = byId[id];
		if (cached) return cached;

		const res = await CaseAssetsService.get(caseId, id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const asset = res.data;
			byId[id] = asset;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return asset;
		}

		return null;
	};

	const createAsset = async (
		body: CreateCaseAssetBody,
		options: ApiOptions = {}
	): Promise<Asset | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseAssetsService.create(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const asset = res.data;
			const id = getAssetId(asset);

			byId[id] = asset;
			ui.selectedAssetId = id;

			await refresh(options);
			return byId[id] ?? asset;
		}

		await refresh(options);
		return null;
	};

	const patchAsset = async (
		id: CaseAssetIdentifier,
		body: UpdateCaseAssetBody,
		options: ApiOptions = {}
	): Promise<Asset | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = byId[id];
		if (prev) {
			byId[id] = { ...prev, ...(body as Partial<Asset>) };
		}

		const res = await CaseAssetsService.update(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			byId[id] = res.data;

			await refresh(options);
			return byId[id] ?? res.data;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const removeAsset = async (
		id: CaseAssetIdentifier,
		options: ApiOptions = {}
	): Promise<boolean> => {
		const caseId = getCaseId();

		if (caseId === null) return false;

		const prev = byId[id];
		const prevIds = [...list.ids];
		const prevSelected = ui.selectedAssetId;

		if (prev) delete byId[id];
		list.ids = list.ids.filter((x) => x !== id);

		if (ui.selectedAssetId === id) {
			ui.selectedAssetId = undefined;
		}

		const res = await CaseAssetsService.remove(caseId, id, options);

		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		if (prev) {
			byId[id] = prev;
		}

		list.ids = prevIds;
		ui.selectedAssetId = prevSelected;

		await refresh(options);
		return false;
	};

	const selectAsset = (id?: number) => {
		ui.selectedAssetId = id;
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

		ui.selectedAssetId = undefined;
	};

	return {
		byId,
		list,
		ui,
		currentCaseId,
		currentAsset,
		assets,
		listPaginated,
		refresh,
		getAsset,
		createAsset,
		patchAsset,
		removeAsset,
		selectAsset,
		reset
	};
};

export type CaseAssetsContext = ReturnType<typeof createCaseAssetsContext>;
