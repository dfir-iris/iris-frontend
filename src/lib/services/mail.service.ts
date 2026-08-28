// Mail-ingest rules + ingest-log client.
//
// Backs /api/v2/manage/mail/*. All routes are server-administrator
// gated on the backend — a non-admin gets 403 which the SPA surfaces
// via ApiError.

import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type MailRuleAction = 'create_alert' | 'create_case' | 'drop';

export interface MailRule {
	id: number;
	name: string;
	priority: number;
	enabled: boolean;
	match_subject_regex: string | null;
	match_from_regex: string | null;
	match_to_regex: string | null;
	action: MailRuleAction;
	customer_id: number | null;
	case_template_id: number | null;
	severity_id: number | null;
	assignee_user_id: number | null;
	created_by_id: number | null;
	created_at: string | null;
	updated_at: string | null;
}

export type MailRuleBody = Partial<
	Omit<MailRule, 'id' | 'created_by_id' | 'created_at' | 'updated_at'>
>;

export interface MailIngestLogEntry {
	message_id: string;
	received_at: string | null;
	outcome:
		| 'alert_created'
		| 'case_created'
		| 'skipped_by_rule'
		| 'no_rule_match'
		| 'error'
		| string;
	outcome_object_id: number | null;
	rule_id: number | null;
	from_addr: string | null;
	subject: string | null;
	error: string | null;
}

export class MailService {
	// --- Rules ---------------------------------------------------------

	static async listRules(options: ApiOptions = {}): Promise<RequestResponse<{ data: MailRule[] }>> {
		return ApiService.get<{ data: MailRule[] }>('/manage/mail/rules', options);
	}

	static async createRule(
		body: MailRuleBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<MailRule>> {
		return ApiService.post<MailRule>('/manage/mail/rules', body, options);
	}

	static async updateRule(
		ruleId: number,
		body: MailRuleBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<MailRule>> {
		return ApiService.put<MailRule>(`/manage/mail/rules/${ruleId}`, body, options);
	}

	static async deleteRule(
		ruleId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ deleted: number }>> {
		return ApiService.delete<{ deleted: number }>(`/manage/mail/rules/${ruleId}`, options);
	}

	// --- Ingest log ----------------------------------------------------

	static async listIngestLog(
		limit: number = 100,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ data: MailIngestLogEntry[] }>> {
		const path = ApiService.withQuery('/manage/mail/ingest-log', { limit });
		return ApiService.get<{ data: MailIngestLogEntry[] }>(path, options);
	}

	// --- Diagnostic poll trigger --------------------------------------

	static async pollNow(
		options: ApiOptions = {}
	): Promise<RequestResponse<{ skipped?: boolean; processed?: number; reason?: string }>> {
		return ApiService.post<{ skipped?: boolean; processed?: number; reason?: string }>(
			'/manage/mail/poll-now',
			{},
			options
		);
	}
}
