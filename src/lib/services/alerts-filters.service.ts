import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type SavedFilterIdentifier = number;

export type SavedFilter = {
	filter_id: number;
	filter_is_private: boolean;
	filter_type: string;
	filter_name: string;
	filter_description?: string;
	filter_data: unknown;
	created_by?: number;
};

export type ListSavedFiltersParams = {
	filter_type?: string;
	include_public?: 0 | 1;
};

export type CreateSavedFilterBody = {
	filter_is_private: boolean;
	filter_type: 'alerts';
	filter_name: string;
	filter_description?: string;
	filter_data: unknown;
};

export class AlertsFiltersService {
	static async list(
		params: ListSavedFiltersParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<SavedFilter[]>> {
		const query: Record<string, unknown> = {
			filter_type: params.filter_type ?? 'alerts',
			include_public: params.include_public ?? 1
		};

		const path = ApiService.withQuery('/api/v2/alerts-filters', query);
		return ApiService.get<SavedFilter[]>(path, options);
	}

	static async get(
		id: SavedFilterIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<SavedFilter>> {
		return ApiService.get<SavedFilter>(`/api/v2/alerts-filters/${id}`, options);
	}

	static async create(
		body: CreateSavedFilterBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<SavedFilter>> {
		return ApiService.post<SavedFilter, CreateSavedFilterBody>(
			`/api/v2/alerts-filters`,
			body,
			options
		);
	}

	static async update(
		id: SavedFilterIdentifier,
		body: Partial<CreateSavedFilterBody>,
		options: ApiOptions = {}
	): Promise<RequestResponse<SavedFilter>> {
		return ApiService.put<SavedFilter, Partial<CreateSavedFilterBody>>(
			`/api/v2/alerts-filters/${id}`,
			body,
			options
		);
	}

	static async remove(
		id: SavedFilterIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/alerts-filters/${id}`, options);
	}
}
