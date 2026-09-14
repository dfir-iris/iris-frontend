import { AlertService, alertSearchQueryError } from '$lib/services/alerts.service';
import type {
	AlertSearchQueryError,
	AlertIdentifier,
	FilterAlertsParams,
	UpdateAlertBody,
	CreateAlertBody,
	RelatedAlert,
	MergeAlertBody,
	EscalateAlertBody,
	MergeAlertResponse,
	EscalateAlertResponse,
	GetRelatedAlertsParams
} from '$lib/services/alerts.service';
import type { ApiOptions, Paginated, RequestResponse } from '$lib/services/api.service';
import type { Alert } from '$lib/types/resources/alert';
import type { AlertQueueUnit } from '$lib/types/resources/alert-queue-unit';
import { flattenAlertQueueUnits, parseAlertQueueUnits } from '$lib/utils/alert-queue';
import { AlertsFiltersService } from '$lib/services/alerts-filters.service';
import type {
	SavedFilter,
	SavedFilterIdentifier,
	CreateSavedFilterBody,
	ListSavedFiltersParams
} from '$lib/services/alerts-filters.service';

export const ALERTS_CTX = Symbol('alerts');

type Status = 'idle' | 'loading' | 'error';

// The v2 paginated body is flat — `response_api_paginated` serializes
// `{total, data: [...], current_page, last_page, next_page}` directly,
// without wrapping in a `{status, message, data}` envelope.
type FilterEnvelope = {
	total: number;
	data: Alert[];
	current_page?: number;
	last_page?: number;
	next_page?: number | null;
};

export type GroupedAlertPage = {
	/** Clusters and lone alerts, in the order the queue should render them. */
	units: AlertQueueUnit[];
	/** How many units match the filters, across every page. */
	totalUnits: number;
	/** The same page flattened to alerts, for everything that counts alerts. */
	page: Paginated<Alert>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object';

const extractFilterEnvelope = (raw: unknown): FilterEnvelope | null => {
	if (!isRecord(raw)) return null;
	if (!Array.isArray(raw.data)) return null;
	return {
		data: raw.data as Alert[],
		total: typeof raw.total === 'number' ? raw.total : 0,
		current_page: typeof raw.current_page === 'number' ? raw.current_page : undefined,
		last_page: typeof raw.last_page === 'number' ? raw.last_page : undefined,
		next_page:
			typeof raw.next_page === 'number' || raw.next_page === null
				? (raw.next_page as number | null)
				: undefined
	};
};

const toPaginatedAlerts = (envelope: FilterEnvelope | null, params: Record<string, unknown>) => {
	const per_page = Number(params.per_page);

	return {
		data: envelope?.data ?? [],
		total: envelope?.total ?? 0,
		current_page: envelope?.current_page ?? 1,
		last_page: envelope?.last_page ?? 1,
		next_page: envelope?.next_page ?? null,
		per_page
	} as Paginated<Alert>;
};

export const createAlertsContext = (getId: (a: Alert) => number) => {
	const byId = $state<Record<number, Alert>>({});

	const list = $state<{
		params: FilterAlertsParams;
		ids: number[];
		status: Status;
		error: string | null;
		/**
		 * Set when the last listing was refused because of its `query`.
		 * Kept apart from `error` because it is the only failure the search
		 * bar can act on: it carries the offset to underline, and it is the
		 * user's typing rather than something that went wrong.
		 */
		searchError: AlertSearchQueryError | null;
	}>({
		params: {},
		ids: [],
		status: 'idle',
		error: null,
		searchError: null
	});

	const savedFilters = $state<{
		params: ListSavedFiltersParams;
		items: SavedFilter[];
		status: Status;
		error: string | null;
	}>({
		params: { filter_type: 'alerts', include_public: 1 },
		items: [],
		status: 'idle',
		error: null
	});

	const mutation = $state<{ error: string | null }>({ error: null });

	const load = async (params: FilterAlertsParams = {}, options: ApiOptions = {}) => {
		list.params = params;
		list.status = 'loading';
		list.error = null;
		list.searchError = null;

		const response = await AlertService.list(params, options);

		if (
			!response.ok ||
			response.error ||
			response.data === null ||
			typeof response.data === 'string'
		) {
			list.status = 'error';
			list.searchError = alertSearchQueryError(response);
			list.error = list.searchError?.message ?? response.error?.message ?? 'Failed to load alerts';
			return;
		}

		const envelope = extractFilterEnvelope(response.data);
		if (!envelope) {
			list.status = 'error';
			list.error = 'Failed to load alerts';
			return;
		}

		const page = toPaginatedAlerts(envelope, params as Record<string, unknown>);

		for (const alert of page.data) byId[getId(alert)] = alert;

		list.ids = page.data.map(getId);
		list.status = 'idle';
		list.error = null;
	};

	const listPaginated = async (
		params: FilterAlertsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Alert>>> => {
		const response = await AlertService.list(params, options);

		if (
			!response.ok ||
			response.error ||
			response.data === null ||
			typeof response.data === 'string'
		) {
			list.searchError = alertSearchQueryError(response);
			return response as unknown as RequestResponse<Paginated<Alert>>;
		}

		list.searchError = null;

		const envelope = extractFilterEnvelope(response.data);
		const page = toPaginatedAlerts(envelope, params as Record<string, unknown>);

		for (const alert of page.data) byId[getId(alert)] = alert;

		list.params = params;
		list.ids = page.data.map(getId);
		list.status = 'idle';
		list.error = null;

		return {
			...response,
			data: page
		} as unknown as RequestResponse<Paginated<Alert>>;
	};

	/**
	 * The cluster-grouped queue, as used by the split view.
	 *
	 * The body is a page of *units* rather than alerts, so `total` counts
	 * units (a cluster is one) while `total_alerts` counts the alerts inside
	 * them. Both are returned: the pager needs the first, the "N Alerts"
	 * heading the second.
	 *
	 * It does the same `byId` / `list.ids` bookkeeping as `listPaginated`,
	 * which is not optional — select-all resolves to `list.ids`, so a grouped
	 * page that skipped it would leave bulk actions pointed at the previous
	 * page's alerts.
	 */
	const listGroupedPaginated = async (
		params: FilterAlertsParams = {},
		options: ApiOptions = {}
	): Promise<GroupedAlertPage | null> => {
		const response = await AlertService.listGrouped(params, options);

		if (
			!response.ok ||
			response.error ||
			response.data === null ||
			typeof response.data === 'string'
		) {
			list.searchError = alertSearchQueryError(response);
			return null;
		}

		list.searchError = null;

		const raw = isRecord(response.data) ? response.data : null;
		const units = parseAlertQueueUnits(raw?.data);
		const data = flattenAlertQueueUnits(units);

		const page = {
			data,
			total: typeof raw?.total_alerts === 'number' ? raw.total_alerts : data.length,
			current_page: typeof raw?.current_page === 'number' ? raw.current_page : 1,
			last_page: typeof raw?.last_page === 'number' ? raw.last_page : 1,
			next_page: typeof raw?.next_page === 'number' ? raw.next_page : null,
			per_page: Number(params.per_page)
		} as Paginated<Alert>;

		for (const alert of data) byId[getId(alert)] = alert;

		list.params = params;
		list.ids = data.map(getId);
		list.status = 'idle';
		list.error = null;

		return {
			units,
			totalUnits: typeof raw?.total === 'number' ? raw.total : units.length,
			page
		};
	};

	const refresh = async (options: ApiOptions = {}) => load(list.params, options);

	const loadSavedFilters = async (
		params: ListSavedFiltersParams = savedFilters.params,
		options: ApiOptions = {}
	) => {
		savedFilters.params = params;
		savedFilters.status = 'loading';
		savedFilters.error = null;

		const response = await AlertsFiltersService.list(params, options);

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
		id: SavedFilterIdentifier,
		options: ApiOptions = {}
	): Promise<SavedFilter | null> => {
		const response = await AlertsFiltersService.get(id, options);

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
		body: CreateSavedFilterBody,
		options: ApiOptions = {}
	): Promise<SavedFilter | null> => {
		const response = await AlertsFiltersService.create(body, options);

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

	const updateSavedFilter = async (
		id: SavedFilterIdentifier,
		body: Partial<CreateSavedFilterBody>,
		options: ApiOptions = {}
	): Promise<SavedFilter | null> => {
		const response = await AlertsFiltersService.update(id, body, options);

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
		id: SavedFilterIdentifier,
		options: ApiOptions = {}
	): Promise<boolean> => {
		mutation.error = null;

		const response = await AlertsFiltersService.remove(id, options);

		if (response.ok && !response.error) {
			await loadSavedFilters(savedFilters.params, options);
			return true;
		}

		mutation.error = response.error?.message ?? null;
		return false;
	};

	const get = async (id: AlertIdentifier, options: ApiOptions = {}): Promise<Alert | null> => {
		const response = await AlertService.get(id, options);

		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			const alert = response.data;
			byId[getId(alert)] = alert;

			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return alert;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const create = async (body: CreateAlertBody, options: ApiOptions = {}): Promise<Alert | null> => {
		const response = await AlertService.create(body, options);

		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			const alert = response.data;
			byId[getId(alert)] = alert;

			const id = getId(alert);
			if (!list.ids.includes(id)) {
				list.ids = [id, ...list.ids];
			}

			return alert;
		}

		await refresh(options);
		return null;
	};

	const patch = async (
		id: AlertIdentifier,
		body: UpdateAlertBody,
		options: ApiOptions = {}
	): Promise<Alert | null> => {
		const previous = byId[id];

		if (previous) byId[id] = { ...previous, ...(body as Partial<Alert>) };

		const response = await AlertService.update(id, body, options);

		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			const alert = response.data;
			byId[getId(alert)] = alert;
			return alert;
		}

		await refresh(options);
		return await get(id, options);
	};

	const remove = async (id: AlertIdentifier, options: ApiOptions = {}): Promise<boolean> => {
		mutation.error = null;

		const previous = byId[id];

		if (previous) delete byId[id];
		if (list.ids.includes(id)) list.ids = list.ids.filter((x) => x !== id);

		const response = await AlertService.remove(id, options);

		if (response.ok && !response.error) return true;

		mutation.error = response.error?.message ?? null;

		if (previous) byId[id] = previous;
		if (!list.ids.includes(id)) list.ids = [id, ...list.ids];

		await refresh(options);
		return false;
	};

	const merge = async (
		id: AlertIdentifier,
		body: MergeAlertBody,
		options: ApiOptions = {}
	): Promise<MergeAlertResponse | null> => {
		const response = await AlertService.merge(id, body, options);

		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			await refresh(options);
			return response.data;
		}

		return null;
	};

	const unmerge = async (id: AlertIdentifier, options: ApiOptions = {}): Promise<Alert | null> => {
		const response = await AlertService.unmerge(id, options);

		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			const alert = response.data;
			byId[getId(alert)] = alert;
			await refresh(options);
			return alert;
		}

		return null;
	};

	const escalate = async (
		id: AlertIdentifier,
		body: EscalateAlertBody,
		options: ApiOptions = {}
	): Promise<EscalateAlertResponse | null> => {
		const response = await AlertService.escalate(id, body, options);

		if (
			response.ok &&
			!response.error &&
			response.data !== null &&
			typeof response.data !== 'string'
		) {
			await refresh(options);
			return response.data;
		}

		return null;
	};

	const getRelatedAlerts = async (
		id: AlertIdentifier,
		params: GetRelatedAlertsParams,
		options: ApiOptions = {}
	): Promise<RelatedAlert | null> => {
		const response = await AlertService.getRelatedAlerts(id, params, options);

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

	const reset = () => {
		for (const key of Object.keys(byId)) delete byId[Number(key)];

		list.params = {};
		list.ids = [];
		list.status = 'idle';
		list.error = null;

		savedFilters.params = { filter_type: 'alerts', include_public: 1 };
		savedFilters.items = [];
		savedFilters.status = 'idle';
		savedFilters.error = null;
	};

	const alerts = $derived(() =>
		list.ids.map((id) => byId[id]).filter((a): a is Alert => a !== undefined)
	);

	return {
		byId,
		list,
		savedFilters,
		mutation,
		alerts,
		load,
		listPaginated,
		listGroupedPaginated,
		refresh,
		loadSavedFilters,
		getSavedFilter,
		createSavedFilter,
		updateSavedFilter,
		removeSavedFilter,
		get,
		create,
		patch,
		remove,
		merge,
		unmerge,
		escalate,
		getRelatedAlerts,
		reset
	};
};

export type AlertsContext = ReturnType<typeof createAlertsContext>;
