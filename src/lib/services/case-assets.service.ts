import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { Asset } from '$lib/types/resources/asset';

export type CaseAssetIdentifier = number;
export type SortDir = 'asc' | 'desc';

export interface ListCaseAssetsParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: SortDir;
	custom_conditions?: string;
}

export interface CreateCaseAssetBody {
	asset_name: string;
	asset_type_id: number;
	asset_description?: string;
	analysis_status_id?: number;
	custom_attributes?: Record<string, unknown>;
	asset_info?: string;
	user_id?: number;
	date_added?: string;
	date_update?: string;
	asset_ip?: string;
	asset_tags?: string;
	asset_compromise_status_id?: number;
	asset_uuid?: string;
	asset_domain?: string;
}

export interface UpdateCaseAssetBody {
	asset_name?: string;
	asset_type_id?: number;
	asset_domain?: string;
	asset_ip?: string;
	asset_info?: string;
	asset_compromise_status_id?: number;
	analysis_status_id?: number;
	ioc_links?: string[];
	asset_tags?: string;
	asset_description?: string;
	custom_attributes?: Record<string, unknown>;
}

export class CaseAssetsService {
	static async list(
		caseId: number,
		params: ListCaseAssetsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Asset>>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/assets`,
			params as Record<string, unknown>
		);

		return ApiService.get<Paginated<Asset>>(path, options);
	}

	static async get(
		caseId: number,
		assetId: CaseAssetIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Asset>> {
		return ApiService.get<Asset>(`/api/v2/cases/${caseId}/assets/${assetId}`, options);
	}

	static async getById(
		assetId: CaseAssetIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Asset>> {
		return ApiService.get<Asset>(`/api/v2/assets/${assetId}`, options);
	}

	static async create(
		caseId: number,
		body: CreateCaseAssetBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Asset>> {
		return ApiService.post<Asset>(`/api/v2/cases/${caseId}/assets`, body, options);
	}

	static async update(
		caseId: number,
		assetId: CaseAssetIdentifier,
		body: UpdateCaseAssetBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Asset>> {
		return ApiService.put<Asset>(`/api/v2/cases/${caseId}/assets/${assetId}`, body, options);
	}

	static async remove(
		caseId: number,
		assetId: CaseAssetIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}/assets/${assetId}`, options);
	}
}
