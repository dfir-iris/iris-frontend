/**
 * Generic taxonomy service for the Settings "Case Objects" page.
 *
 * The five Case Objects sub-resources (asset types, IOC types, case
 * classifications, case states, evidence types) share an identical
 * v2 surface — list/get/create/update/delete with a `search` query
 * param. The legacy per-resource services
 * (`asset-types.service.ts`, `ioc-types.service.ts`, …) deliberately
 * hit the *legacy* `/manage/...` URLs because they're consumed by
 * case/asset/IOC modals that haven't been ported yet; this service
 * is the v2-native alternative used by the admin page only.
 *
 * Resource paths match the backend blueprint url_prefixes in
 * `case_objects.py`.
 */
import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

export type CaseObjectResource =
	| 'asset-types'
	| 'ioc-types'
	| 'case-classifications'
	| 'case-states'
	| 'evidence-types';

export interface ListCaseObjectsParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
	/** ILIKE substring across each resource's documented search columns. */
	search?: string;
}

export type TaxonomyRow = Record<string, unknown>;

export class CaseObjectsService {
	private static base(resource: CaseObjectResource) {
		return `/manage/case-objects/${resource}`;
	}

	static async search<T extends TaxonomyRow = TaxonomyRow>(
		resource: CaseObjectResource,
		params: ListCaseObjectsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<T>>> {
		return ApiService.get<Paginated<T>>(
			ApiService.withQuery(CaseObjectsService.base(resource), params as Record<string, unknown>),
			options
		);
	}

	static async get<T extends TaxonomyRow = TaxonomyRow>(
		resource: CaseObjectResource,
		identifier: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<T>> {
		return ApiService.get<T>(`${CaseObjectsService.base(resource)}/${identifier}`, options);
	}

	static async create<T extends TaxonomyRow = TaxonomyRow>(
		resource: CaseObjectResource,
		body: Record<string, unknown>,
		options: ApiOptions = {}
	): Promise<RequestResponse<T>> {
		return ApiService.post<T>(CaseObjectsService.base(resource), body, options);
	}

	static async update<T extends TaxonomyRow = TaxonomyRow>(
		resource: CaseObjectResource,
		identifier: number,
		body: Record<string, unknown>,
		options: ApiOptions = {}
	): Promise<RequestResponse<T>> {
		return ApiService.put<T>(
			`${CaseObjectsService.base(resource)}/${identifier}`,
			body,
			options
		);
	}

	static async remove(
		resource: CaseObjectResource,
		identifier: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`${CaseObjectsService.base(resource)}/${identifier}`,
			options
		);
	}

	/**
	 * Upload one of an asset type's two icons. `field` matches the
	 * column suffix on the backend (`asset_icon_compromised` /
	 * `asset_icon_not_compromised`) and the URL parameter expected by
	 * the v2 endpoint. The server returns the full updated asset
	 * type so callers can refresh their detail pane in one round-trip.
	 *
	 * FormData bypasses ApiService (which forces JSON) — we still
	 * need the auth header and the configured base URL, hence the
	 * inline fetch.
	 */
	static async uploadAssetTypeIcon(
		identifier: number,
		field: 'compromised' | 'not_compromised',
		file: File
	): Promise<RequestResponse<TaxonomyRow>> {
		const { auth } = await import('$lib/stores/auth.store');
		const { AuthService } = await import('./auth.service');
		const { browser } = await import('$app/environment');
		const { apiOrigin } = await import('$lib/config/api.config');

		if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
			await AuthService.refreshToken();
		}

		const baseUrl = apiOrigin();
		const url = `${baseUrl}/api/v2/manage/case-objects/asset-types/${identifier}/icon/${field}`;

		const headers: Record<string, string> = { Accept: 'application/json' };
		const token = auth.getAccessToken();
		if (token) headers.Authorization = `Bearer ${token}`;

		const fd = new FormData();
		fd.append('file', file, file.name);

		const fetchFn = browser ? window.fetch : global.fetch;
		const response = await fetchFn(url, { method: 'POST', headers, body: fd });

		let data: TaxonomyRow | string | null = null;
		try {
			const ct = response.headers.get('content-type') ?? '';
			data = ct.includes('application/json')
				? ((await response.json()) as TaxonomyRow)
				: await response.text();
		} catch {
			data = null;
		}

		return { data, status: response.status, headers: response.headers, ok: response.ok };
	}
}

/**
 * URL for a stored asset icon, served by the legacy /static path the
 * Flask backend exposes via symlinks. Returns `null` for empty / null
 * filenames so the UI can render a placeholder instead.
 */
export const assetIconUrl = (filename?: string | null): string | null => {
	if (!filename) return null;
	return `/static/assets/img/graph/${filename}`;
};
