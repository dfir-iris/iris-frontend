/**
 * AI workflow suggestions — `/api/v2/ai-suggestions`.
 *
 * A suggestion is something a workflow run proposes to an analyst on an
 * alert, cluster, case or war room: an action to run, a draft, or a
 * question (`info_request`). Accepting runs the proposed tool call as
 * the accepting analyst, under their own permissions. Visibility is
 * resolved server side; no extra permission bit is needed to read them.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AiSuggestionEntityType = 'alert' | 'alert_cluster' | 'case' | 'war_room';

export type AiSuggestionKind =
	| 'create_case'
	| 'merge_into_case'
	| 'related_alerts'
	| 'draft_reply'
	| 'info_request'
	| 'generic_action'
	| string;

export type AiSuggestionStatus = 'open' | 'accepted' | 'dismissed' | 'expired' | 'dry_run';

export type AiSuggestionSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AiSuggestionFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select';

export interface AiSuggestionFormField {
	name: string;
	label?: string | null;
	type: AiSuggestionFieldType;
	/** `select` choices: plain strings or `{value, label}` pairs. */
	options?: Array<string | { value: string; label?: string }> | null;
	required?: boolean;
}

export interface AiSuggestionProposedAction {
	tool: string;
	arguments: Record<string, unknown>;
}

export interface AiSuggestionRef {
	type: AiSuggestionEntityType;
	id: number;
	/** Display title; LLM-provided unless the backend substituted the real one. */
	title?: string | null;
}

export interface AiSuggestionUser {
	id: number;
	login: string;
	name: string;
}

export interface AiSuggestion {
	id: number;
	uuid: string;
	run_id: number | null;
	run_uuid: string | null;
	workflow_id: number | null;
	workflow_name: string | null;
	entity_type: AiSuggestionEntityType | null;
	entity_id: number | null;
	entity_title: string | null;
	sub_entity: Record<string, unknown> | null;
	kind: AiSuggestionKind;
	title: string;
	body: string | null;
	proposed_action: AiSuggestionProposedAction | null;
	form_schema: { fields: AiSuggestionFormField[] } | null;
	related_refs: AiSuggestionRef[] | null;
	confidence: number | null;
	severity: AiSuggestionSeverity | string | null;
	status: AiSuggestionStatus;
	created_at: string | null;
	resolved_at: string | null;
	resolved_by: AiSuggestionUser | null;
	resolution_note: string | null;
	/**
	 * The answer / action result. Only the resolver (and admins) get them;
	 * for everyone else they are absent or null.
	 */
	answer?: Record<string, unknown> | null;
	result?: unknown;
	/** Resolved by someone else: their answer / result is withheld. */
	resolution_hidden?: boolean;
	can_accept: boolean;
}

export interface AiSuggestionFilters {
	/** `none`: the suggestions about no entity. */
	entity_type?: AiSuggestionEntityType | 'none' | null;
	entity_id?: number | null;
	/** `open` (server default) or `all`, or one explicit status. */
	status?: AiSuggestionStatus | 'all' | null;
	run_uuid?: string | null;
	workflow_id?: number | null;
	severity?: string | null;
	/** Only those addressed to the current user (what non-admins get anyway). */
	mine?: boolean;
	/** 200 by default, 500 at most. */
	limit?: number | null;
}

/** Socket payload of the `ai_suggestion` event on `/notifications`. */
export interface AiSuggestionSocketEvent {
	action: 'created' | 'updated';
	suggestion: AiSuggestion;
}

const BASE = '/ai-suggestions';

/**
 * The list route may answer with a plain array or, if it ends up
 * paginated, `{data: [...]}`. Both are flattened to an array.
 */
export function aiSuggestionsUnwrapList(data: unknown): AiSuggestion[] {
	if (Array.isArray(data)) return data as AiSuggestion[];
	if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
		return (data as { data: AiSuggestion[] }).data;
	}
	return [];
}

export class AiSuggestionsService {
	static async list(
		filters: AiSuggestionFilters = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<AiSuggestion[]>> {
		const params: Record<string, unknown> = {};
		if (filters.entity_type) params.entity_type = filters.entity_type;
		if (filters.entity_id != null) params.entity_id = filters.entity_id;
		if (filters.status) params.status = filters.status;
		if (filters.run_uuid) params.run_uuid = filters.run_uuid;
		if (filters.workflow_id != null) params.workflow_id = filters.workflow_id;
		if (filters.severity) params.severity = filters.severity;
		if (filters.mine) params.mine = 'true';
		if (filters.limit != null) params.limit = filters.limit;
		const res = await ApiService.get<unknown>(ApiService.withQuery(BASE, params), options);
		if (!res.ok || res.data == null || typeof res.data === 'string') {
			return res as RequestResponse<AiSuggestion[]>;
		}
		return { ...res, data: aiSuggestionsUnwrapList(res.data) };
	}

	/** Open suggestion counts per entity id: `{"<id>": n}`. */
	static async counts(
		entityType: AiSuggestionEntityType,
		entityIds: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<Record<string, number>>> {
		return ApiService.get<Record<string, number>>(
			ApiService.withQuery(`${BASE}/counts`, {
				entity_type: entityType,
				entity_ids: entityIds.join(',')
			}),
			options
		);
	}

	static async get(id: number, options: ApiOptions = {}): Promise<RequestResponse<AiSuggestion>> {
		return ApiService.get<AiSuggestion>(`${BASE}/${id}`, options);
	}

	/** Runs the proposed action as the current user. */
	static async accept(
		id: number,
		note: string | null = null,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiSuggestion>> {
		return ApiService.post<AiSuggestion>(`${BASE}/${id}/accept`, note ? { note } : {}, options);
	}

	static async dismiss(
		id: number,
		note: string | null = null,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiSuggestion>> {
		return ApiService.post<AiSuggestion>(`${BASE}/${id}/dismiss`, note ? { note } : {}, options);
	}

	/** Answers an `info_request`; resumes the waiting run. */
	static async answer(
		id: number,
		answer: Record<string, unknown>,
		note: string | null = null,
		options: ApiOptions = {}
	): Promise<RequestResponse<AiSuggestion>> {
		const body: { answer: Record<string, unknown>; note?: string } = { answer };
		if (note) body.note = note;
		return ApiService.post<AiSuggestion>(`${BASE}/${id}/answer`, body, options);
	}
}
