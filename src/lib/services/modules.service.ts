import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

export type ModuleId = number;

export type ModuleParameterType =
	| 'string'
	| 'int'
	| 'bool'
	| 'sensitive_string'
	| 'textfield_json'
	| 'textfield_html'
	| 'textfield_markdown';

export interface ModuleParameter {
	param_name: string;
	param_human_name?: string;
	param_description?: string;
	type: ModuleParameterType | string;
	default?: unknown;
	value?: unknown;
	mandatory: boolean;
	section?: string;
}

export interface ModuleListEntry {
	id: ModuleId;
	module_human_name: string;
	has_pipeline: boolean;
	module_version: string;
	interface_version: string;
	date_added: string | null;
	added_by: string;
	is_active: boolean;
	configured: boolean;
}

export interface ModuleDetail {
	id: ModuleId;
	module_name: string;
	module_human_name: string;
	module_description: string;
	module_version: string;
	interface_version: string;
	date_added: string | null;
	is_active: boolean;
	has_pipeline: boolean;
	module_type: string;
	module_config: ModuleParameter[];
}

export interface ModuleHook {
	id: number;
	module_name: string;
	is_active: boolean;
	hook_name: string;
	hook_description: string;
	is_manual_hook: boolean;
}

export interface ModuleConfigExport {
	module_name: string;
	module_human_name: string;
	module_configuration: ModuleParameter[];
}

export interface ModuleConfigImportResult {
	skipped: string[];
	module: ModuleDetail;
}

export interface ListModulesParams {
	page?: number;
	per_page?: number;
}

export class ModulesService {
	static async list(
		params: ListModulesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<ModuleListEntry>>> {
		return ApiService.get<Paginated<ModuleListEntry>>(
			ApiService.withQuery('/manage/modules', params as Record<string, unknown>),
			options
		);
	}

	static async get(
		moduleId: ModuleId,
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleDetail>> {
		return ApiService.get<ModuleDetail>(`/manage/modules/${moduleId}`, options);
	}

	static async add(
		moduleName: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleDetail>> {
		return ApiService.post<ModuleDetail>('/manage/modules', { module_name: moduleName }, options);
	}

	static async remove(
		moduleId: ModuleId,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/modules/${moduleId}`, options);
	}

	static async enable(
		moduleId: ModuleId,
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleDetail>> {
		return ApiService.post<ModuleDetail>(`/manage/modules/${moduleId}/enable`, {}, options);
	}

	static async disable(
		moduleId: ModuleId,
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleDetail>> {
		return ApiService.post<ModuleDetail>(`/manage/modules/${moduleId}/disable`, {}, options);
	}

	static async setParameter(
		moduleId: ModuleId,
		paramName: string,
		value: unknown,
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleDetail>> {
		return ApiService.put<ModuleDetail>(
			`/manage/modules/${moduleId}/parameters/${encodeURIComponent(paramName)}`,
			{ parameter_value: value },
			options
		);
	}

	static async exportConfig(
		moduleId: ModuleId,
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleConfigExport>> {
		return ApiService.get<ModuleConfigExport>(`/manage/modules/${moduleId}/export-config`, options);
	}

	static async importConfig(
		moduleId: ModuleId,
		configuration: ModuleParameter[],
		options: ApiOptions = {}
	): Promise<RequestResponse<ModuleConfigImportResult>> {
		return ApiService.post<ModuleConfigImportResult>(
			`/manage/modules/${moduleId}/import-config`,
			{ module_configuration: configuration },
			options
		);
	}

	static async listHooks(
		params: ListModulesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<ModuleHook>>> {
		return ApiService.get<Paginated<ModuleHook>>(
			ApiService.withQuery('/manage/modules/hooks', params as Record<string, unknown>),
			options
		);
	}
}
