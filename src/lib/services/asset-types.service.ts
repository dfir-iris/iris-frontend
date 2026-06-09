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
	static async list(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetType[]>> {
		const path = ApiService.withQuery('/manage/asset-type/list', { cid: caseId });
		const res = await ApiService.get<ApiEnvelope<AssetType[]>>(path, options);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}

	static async get(
		assetTypeId: AssetTypeIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<AssetType>> {
		const res = await ApiService.get<ApiEnvelope<AssetType>>(
			`/manage/asset-type/${assetTypeId}`,
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: null };
	}
}
