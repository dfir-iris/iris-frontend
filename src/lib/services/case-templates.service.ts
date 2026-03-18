import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CaseTemplateIdentifier = number;

export interface CaseTemplateTask {
	title: string;
	description?: string;
	tags?: string[];
}

export interface CaseTemplateNote {
	title: string;
	content?: string;
}

export interface CaseTemplateNoteGroup {
	title: string;
	notes?: CaseTemplateNote[];
}

export interface CaseTemplate {
	template_id: number;
	template_name: string;
	template_description?: string;
	case_name?: string;
	case_description?: string;
	case_tags?: string[] | string;
	tasks?: CaseTemplateTask[];
	note_groups?: CaseTemplateNoteGroup[];
	custom_attributes?: Record<string, unknown>;
	[key: string]: unknown;
}

export interface CaseTemplateBody {
	template_name: string;
	template_description?: string;
	case_name?: string;
	case_description?: string;
	case_tags?: string[] | string;
	tasks?: CaseTemplateTask[];
	note_groups?: CaseTemplateNoteGroup[];
	custom_attributes?: Record<string, unknown>;
	[key: string]: unknown;
}

export class CaseTemplatesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<CaseTemplate[]>> {
		return ApiService.get<CaseTemplate[]>('/manage/case-templates/list', options);
	}

	static async get(
		templateId: CaseTemplateIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTemplate>> {
		return ApiService.get<CaseTemplate>(`/manage/case-templates/${templateId}`, options);
	}

	static async create(
		body: CaseTemplateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTemplate>> {
		return ApiService.post<CaseTemplate>('/manage/case-templates/add', body, options);
	}

	static async update(
		templateId: CaseTemplateIdentifier,
		body: Partial<CaseTemplateBody>,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTemplate>> {
		return ApiService.post<CaseTemplate>(
			`/manage/case-templates/update/${templateId}`,
			body,
			options
		);
	}

	static async remove(
		templateId: CaseTemplateIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/case-templates/delete/${templateId}`, {}, options);
	}
}
