import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// The v2 /search endpoint returns a unified envelope. Every row carries
// a `type` discriminator and a `result_id`, so the frontend can render a
// mixed list without per-type branches at the call site.
export type SearchType =
	| 'ioc'
	| 'notes'
	| 'comments'
	| 'assets'
	| 'events'
	| 'tasks'
	| 'evidences';

export interface SearchPagination {
	total: number;
	page: number;
	per_page: number;
	total_pages: number;
}

export interface SearchEnvelope {
	data: SearchResultRow[];
	pagination: SearchPagination;
}

// Common fields every annotated row carries.
interface BaseRow {
	type: SearchType;
	result_id: number;
	case_id: number;
	case_name: string;
	customer_name: string;
}

export interface IocRow extends BaseRow {
	type: 'ioc';
	ioc_id: number;
	ioc_name: string;
	ioc_description: string | null;
	ioc_misp: string | null;
	type_name: string;
	tlp_name: string | null;
	tlp_bscolor: string | null;
}

export interface NoteRow extends BaseRow {
	type: 'notes';
	note_id: number;
	note_title: string;
	client_name?: string;
}

export interface CommentRow extends BaseRow {
	type: 'comments';
	comment_id: number;
	comment_text: string;
}

export interface AssetRow extends BaseRow {
	type: 'assets';
	asset_id: number;
	asset_name: string;
	asset_description: string | null;
	asset_ip: string | null;
	asset_domain: string | null;
	asset_type_name: string;
}

export interface EventRow extends BaseRow {
	type: 'events';
	event_id: number;
	event_title: string;
	event_content: string | null;
	event_date: string | null;
}

export interface TaskRow extends BaseRow {
	type: 'tasks';
	task_id: number;
	task_title: string;
	task_description: string | null;
	status_name: string | null;
}

export interface EvidenceRow extends BaseRow {
	type: 'evidences';
	evidence_id: number;
	filename: string;
	file_description: string | null;
	file_hash: string | null;
}

export type SearchResultRow =
	| IocRow
	| NoteRow
	| CommentRow
	| AssetRow
	| EventRow
	| TaskRow
	| EvidenceRow;

export interface SearchParams {
	value: string;
	types: SearchType[];
	page?: number;
	per_page?: number;
	// Optional — restrict to a single case. Kept for back-compat;
	// prefer `case_ids` for new callers.
	case_id?: number;
	// Optional — restrict to a set of cases (server intersects with the
	// caller's accessible-case list, so any forbidden id just drops out
	// of the scope silently).
	case_ids?: number[];
}

export class SearchService {
	static async search(
		params: SearchParams,
		options: ApiOptions = {}
	): Promise<RequestResponse<SearchEnvelope>> {
		return ApiService.get<SearchEnvelope>(
			ApiService.withQuery('/search', {
				value: params.value,
				types: params.types.join(','),
				page: params.page ?? 1,
				per_page: params.per_page ?? 25,
				...(params.case_id != null ? { case_id: params.case_id } : {}),
				...(params.case_ids && params.case_ids.length > 0
					? { case_ids: params.case_ids.join(',') }
					: {})
			}),
			options
		);
	}
}
