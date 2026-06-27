import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AssetTypeIdentifier = number;

export type AssetType = {
	asset_id: number;
	id?: number;
	asset_name: string;
	asset_description?: string;
	asset_icon_compromised?: string;
	asset_icon_compromised_path?: string;
	asset_icon_not_compromised?: string;
	asset_icon_not_compromised_path?: string;
};

type ApiEnvelope<T> = {
	data: T;
	message?: string;
	status?: string;
};

export class AssetTypesService {
	/**
	 * The v2 endpoint is case-agnostic (asset types are global seed
	 * data); the legacy `cid` query param is accepted-but-ignored
	 * for back-compat with existing callers.
	 */
	static async list(
		_caseId?: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetType[]>> {
		// Asset types is a small taxonomy (a few dozen entries) and the
		// add/edit dropdowns need the FULL list. The v2 backend defaults
		// to per_page=10 which silently truncates the result — pass a
		// per_page large enough to cover any realistic deployment.
		const url = ApiService.withQuery('/manage/case-objects/asset-types', {
			per_page: 10000
		});
		const res = await ApiService.get<ApiEnvelope<AssetType[]>>(url, options);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}

	static async get(
		assetTypeId: AssetTypeIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetType | null>> {
		const res = await ApiService.get<AssetType>(
			`/manage/case-objects/asset-types/${assetTypeId}`,
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			// The v2 `read` returns the row directly (not wrapped in
			// `{data: ...}` like the legacy envelope).
			return { ...res, data: res.data as AssetType };
		}

		return { ...res, data: null };
	}
}
