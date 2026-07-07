import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { ClusterRule, RuleAction, RuleConditions } from '$lib/types/resources/cluster-rule';

export interface CreateClusterRuleBody {
	rule_name: string;
	rule_description?: string;
	rule_is_active?: boolean;
	rule_priority?: number;
	rule_customer_scope?: number[] | null;
	rule_conditions: RuleConditions;
	rule_action_type: RuleAction;
	rule_action_config?: Record<string, unknown>;
}

export type UpdateClusterRuleBody = Partial<CreateClusterRuleBody>;

export interface TestRuleResponse {
	rule_id: number;
	matching_alert_ids: number[];
	sample_days: number;
}

export interface BackfillRuleResponse {
	rule_id: number;
	attached: number;
	skipped_already_in_cluster: number;
	errors: number;
	considered: number;
}

export class ClusterRulesService {
	static async list(options: ApiOptions = {}) {
		return ApiService.get<ClusterRule[]>('/api/v2/cluster-rules', options);
	}

	static async get(id: number, options: ApiOptions = {}) {
		return ApiService.get<ClusterRule>(`/api/v2/cluster-rules/${id}`, options);
	}

	static async create(body: CreateClusterRuleBody, options: ApiOptions = {}) {
		return ApiService.post<ClusterRule, CreateClusterRuleBody>(
			'/api/v2/cluster-rules',
			body,
			options
		);
	}

	static async update(id: number, body: UpdateClusterRuleBody, options: ApiOptions = {}) {
		return ApiService.put<ClusterRule, UpdateClusterRuleBody>(
			`/api/v2/cluster-rules/${id}`,
			body,
			options
		);
	}

	static async remove(id: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(`/api/v2/cluster-rules/${id}`, options);
	}

	static async test(
		id: number,
		params: { sample_days?: number; limit?: number } = {},
		options: ApiOptions = {}
	) {
		return ApiService.post<TestRuleResponse, typeof params>(
			`/api/v2/cluster-rules/${id}/test`,
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
			`/api/v2/cluster-rules/${id}/backfill`,
			params,
			options
		);
	}
}
