import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { IncidentRule, RuleAction, RuleConditions } from '$lib/types/resources/incident-rule';

export interface CreateIncidentRuleBody {
	rule_name: string;
	rule_description?: string;
	rule_is_active?: boolean;
	rule_priority?: number;
	rule_customer_scope?: number[] | null;
	rule_conditions: RuleConditions;
	rule_action_type: RuleAction;
	rule_action_config?: Record<string, unknown>;
}

export type UpdateIncidentRuleBody = Partial<CreateIncidentRuleBody>;

export interface TestRuleResponse {
	rule_id: number;
	matching_alert_ids: number[];
	sample_days: number;
}

export interface BackfillRuleResponse {
	rule_id: number;
	attached: number;
	skipped_already_in_incident: number;
	errors: number;
	considered: number;
}

export class IncidentRulesService {
	static async list(options: ApiOptions = {}) {
		return ApiService.get<IncidentRule[]>('/api/v2/incident-rules', options);
	}

	static async get(id: number, options: ApiOptions = {}) {
		return ApiService.get<IncidentRule>(`/api/v2/incident-rules/${id}`, options);
	}

	static async create(body: CreateIncidentRuleBody, options: ApiOptions = {}) {
		return ApiService.post<IncidentRule, CreateIncidentRuleBody>(
			'/api/v2/incident-rules',
			body,
			options
		);
	}

	static async update(id: number, body: UpdateIncidentRuleBody, options: ApiOptions = {}) {
		return ApiService.put<IncidentRule, UpdateIncidentRuleBody>(
			`/api/v2/incident-rules/${id}`,
			body,
			options
		);
	}

	static async remove(id: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(`/api/v2/incident-rules/${id}`, options);
	}

	static async test(
		id: number,
		params: { sample_days?: number; limit?: number } = {},
		options: ApiOptions = {}
	) {
		return ApiService.post<TestRuleResponse, typeof params>(
			`/api/v2/incident-rules/${id}/test`,
			params,
			options
		);
	}

	static async backfill(
		id: number,
		params: { sample_days?: number } = {},
		options: ApiOptions = {}
	) {
		return ApiService.post<BackfillRuleResponse, typeof params>(
			`/api/v2/incident-rules/${id}/backfill`,
			params,
			options
		);
	}
}
