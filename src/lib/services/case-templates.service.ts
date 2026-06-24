import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

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

// ---------------------------------------------------------------------
// v2 surface — used by the Settings Case Templates page.
//
// The legacy `CaseTemplatesService` above keeps existing consumers
// (case-templates context store, alerts-merge dialog) working: those
// hit `/manage/case-templates/...` legacy paths and read fields like
// `template_id` / `template_name` which were never the schema's real
// field names but became load-bearing in those callers.
//
// `CaseTemplatesV2Service` here speaks the real CaseTemplateSchema
// from the backend: `id`, `name`, `display_name`, `description`,
// `author`, `title_prefix`, `summary`, `tags`, `classification`,
// `note_directories` plus the raw `tasks` JSON. Paginated list +
// dry-run preview against a user-accessible case round out the
// surface.
// ---------------------------------------------------------------------

export interface CaseTemplateTaskV2 {
	title: string;
	description?: string;
	tags?: string[];
}

export interface CaseTemplateNoteV2 {
	title: string;
	content?: string;
}

export interface CaseTemplateNoteDirectoryV2 {
	title: string;
	notes?: CaseTemplateNoteV2[];
}

export interface CaseTemplateV2 {
	id: number;
	name: string;
	display_name?: string;
	description?: string;
	author?: string;
	title_prefix?: string;
	summary?: string;
	tags?: string[];
	classification?: string;
	note_directories?: CaseTemplateNoteDirectoryV2[];
	tasks?: CaseTemplateTaskV2[];
	created_at?: string;
	updated_at?: string;
	created_by_user_id?: number;
}

export interface CaseTemplateBodyV2 {
	name: string;
	display_name?: string;
	description?: string;
	author?: string;
	title_prefix?: string;
	summary?: string;
	tags?: string[];
	classification?: string;
	note_directories?: CaseTemplateNoteDirectoryV2[];
	tasks?: CaseTemplateTaskV2[];
}

export interface SearchCaseTemplatesParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
	/** ILIKE substring match across name, display_name, description, author and title_prefix. */
	search?: string;
}

export class CaseTemplatesV2Service {
	static async search(
		params: SearchCaseTemplatesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<CaseTemplateV2>>> {
		return ApiService.get<Paginated<CaseTemplateV2>>(
			ApiService.withQuery('/manage/case-templates', params as Record<string, unknown>),
			options
		);
	}

	static async get(
		identifier: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTemplateV2>> {
		return ApiService.get<CaseTemplateV2>(`/manage/case-templates/${identifier}`, options);
	}

	static async create(
		body: CaseTemplateBodyV2,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTemplateV2>> {
		return ApiService.post<CaseTemplateV2>('/manage/case-templates', body, options);
	}

	static async update(
		identifier: number,
		body: Partial<CaseTemplateBodyV2>,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTemplateV2>> {
		return ApiService.put<CaseTemplateV2>(
			`/manage/case-templates/${identifier}`,
			body,
			options
		);
	}

	static async remove(
		identifier: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/case-templates/${identifier}`, options);
	}

	static async schema(options: ApiOptions = {}): Promise<RequestResponse<CaseTemplateSchemaInfo>> {
		return ApiService.get<CaseTemplateSchemaInfo>('/manage/case-templates/schema', options);
	}
}

/**
 * Field descriptor returned by `GET /api/v2/manage/case-templates/schema`.
 *
 * Mirrors the introspection backend in
 * `app/blueprints/rest/v2/manage_routes/case_templates.py`. `kind`
 * controls which widget the interactive editor renders.
 *
 * `item_schema` is set when `kind === 'list[object]'` and names one
 * of the entries in `CaseTemplateSchemaInfo.item_schemas` — the
 * editor uses that to render a repeating sub-form.
 */
export type CaseTemplateFieldKind =
	| 'string'
	| 'text'
	| 'integer'
	| 'boolean'
	| 'datetime'
	| 'list[string]'
	| 'list[object]';

export interface CaseTemplateField {
	name: string;
	label: string;
	help: string;
	kind: CaseTemplateFieldKind;
	required: boolean;
	allow_none: boolean;
	dump_only: boolean;
	max_length: number | null;
	item_schema?: 'task' | 'note_directory' | 'note';
}

export interface CaseTemplateItemField {
	name: string;
	label: string;
	kind: CaseTemplateFieldKind;
	required: boolean;
	help?: string;
	item_schema?: 'task' | 'note_directory' | 'note';
}

export interface CaseTemplateSchemaInfo {
	fields: CaseTemplateField[];
	item_schemas: {
		task: CaseTemplateItemField[];
		note_directory: CaseTemplateItemField[];
		note: CaseTemplateItemField[];
	};
}
