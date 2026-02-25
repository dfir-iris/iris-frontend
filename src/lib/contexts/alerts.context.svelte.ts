import { AlertService } from '$lib/services/alerts.service';
import type {
	AlertIdentifier,
	FilterAlertsParams,
	UpdateAlertBody,
	CreateAlertBody,
	RelatedAlert
} from '$lib/services/alerts.service';
import type { ApiOptions, Paginated, RequestResponse } from '$lib/services/api.service';
import type { Alert } from '$lib/types/resources/alert';

export const ALERTS_CTX = Symbol('alerts');

type Status = 'idle' | 'loading' | 'error';

type FilterEnvelope = {
	status?: string;
	message?: string;
	data?: {
		total: number;
		alerts: Alert[];
		current_page?: number;
		last_page?: number;
		next_page?: number | null;
	};
	total?: number;
	alerts?: Alert[];
	current_page?: number;
	last_page?: number;
	next_page?: number | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object';

const hasTopLevelAlerts = (
	value: unknown
): value is Required<Pick<FilterEnvelope, 'total' | 'alerts'>> =>
	isRecord(value) &&
	typeof value.total === 'number' &&
	Array.isArray((value as Record<string, unknown>).alerts);

const hasNestedAlerts = (value: unknown): value is Required<Pick<FilterEnvelope, 'data'>> => {
	if (!isRecord(value)) return false;

	const nested = (value as Record<string, unknown>).data;
	if (!isRecord(nested)) return false;

	return typeof nested.total === 'number' && Array.isArray(nested.alerts);
};

const extractFilterEnvelope = (raw: unknown): FilterEnvelope | null => {
	if (hasTopLevelAlerts(raw)) return raw as FilterEnvelope;
	if (hasNestedAlerts(raw)) return raw as FilterEnvelope;

	if (isRecord(raw) && isRecord(raw.data)) {
		const inner = raw.data;
		if (hasTopLevelAlerts(inner)) return inner as FilterEnvelope;
	}

	return null;
};

const toPaginatedAlerts = (envelope: FilterEnvelope | null, params: Record<string, unknown>) => {
	const per_page = Number(params.per_page);

	const alerts = envelope?.alerts ?? envelope?.data?.alerts ?? [];
	const total = envelope?.total ?? envelope?.data?.total ?? 0;

	const current_page = envelope?.current_page ?? envelope?.data?.current_page ?? 1;
	const last_page = envelope?.last_page ?? envelope?.data?.last_page ?? 1;
	const next_page = envelope?.next_page ?? envelope?.data?.next_page ?? null;

	return {
		data: alerts,
		total,
		current_page,
		last_page,
		next_page,
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
	}>({
		params: {},
		ids: [],
		status: 'idle',
		error: null
	});

	const ui = $state({
		showAddModal: false,
		showManageModal: false
	});

	const load = async (params: FilterAlertsParams = {}, options: ApiOptions = {}) => {
		list.params = params;
		list.status = 'loading';
		list.error = null;

		const response = await AlertService.list(params, options);

		if (
			!response.ok ||
			response.error ||
			response.data === null ||
			typeof response.data === 'string'
		) {
			list.status = 'error';
			list.error = response.error?.message ?? 'Failed to load alerts';
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
			return response as unknown as RequestResponse<Paginated<Alert>>;
		}

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

	const refresh = async (options: ApiOptions = {}) => load(list.params, options);

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
		const previous = byId[id];

		if (previous) delete byId[id];
		if (list.ids.includes(id)) list.ids = list.ids.filter((x) => x !== id);

		const response = await AlertService.remove(id, options);

		if (response.ok && !response.error) return true;

		if (previous) byId[id] = previous;
		if (!list.ids.includes(id)) list.ids = [id, ...list.ids];

		await refresh(options);
		return false;
	};

	const getRelatedAlerts = async (
		id: AlertIdentifier,
		options: ApiOptions = {}
	): Promise<RelatedAlert | null> => {
		const response = await AlertService.getRelatedAlerts(id, options);

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

		ui.showAddModal = false;
		ui.showManageModal = false;
	};

	const alerts = $derived(() =>
		list.ids.map((id) => byId[id]).filter((a): a is Alert => a !== undefined)
	);

	return {
		byId,
		list,
		ui,
		alerts,
		load,
		listPaginated,
		refresh,
		get,
		create,
		patch,
		remove,
		getRelatedAlerts,
		reset
	};
};

export type AlertsContext = ReturnType<typeof createAlertsContext>;
