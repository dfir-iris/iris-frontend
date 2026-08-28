import { ApiService } from './api.service';
import type { ApiOptions } from './api.service';
import type {
	DeployFlowResult,
	FlowConditions,
	FlowTarget,
	InvestigationFlow,
	InvestigationFlowStep,
	InvestigationOverview,
	InvestigationProgress
} from '$lib/types/resources/investigation-flow';

export interface CreateFlowBody {
	flow_name: string;
	flow_description?: string;
	flow_is_active?: boolean;
	flow_customer_scope?: number[] | null;
	flow_target?: FlowTarget;
	flow_conditions?: FlowConditions;
	flow_priority?: number;
}

export type UpdateFlowBody = Partial<CreateFlowBody>;

export interface CreateStepBody {
	step_order: number;
	step_title: string;
	step_description?: string;
	step_is_required?: boolean;
}

export type UpdateStepBody = Partial<CreateStepBody>;

export class InvestigationFlowsService {
	static async list(customerId?: number, options: ApiOptions = {}) {
		const path = ApiService.withQuery('/api/v2/investigation-flows', {
			customer_id: customerId
		});
		return ApiService.get<InvestigationFlow[]>(path, options);
	}

	static async get(id: number, options: ApiOptions = {}) {
		return ApiService.get<InvestigationFlow>(`/api/v2/investigation-flows/${id}`, options);
	}

	static async create(body: CreateFlowBody, options: ApiOptions = {}) {
		return ApiService.post<InvestigationFlow, CreateFlowBody>(
			'/api/v2/investigation-flows',
			body,
			options
		);
	}

	static async update(id: number, body: UpdateFlowBody, options: ApiOptions = {}) {
		return ApiService.put<InvestigationFlow, UpdateFlowBody>(
			`/api/v2/investigation-flows/${id}`,
			body,
			options
		);
	}

	static async remove(id: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(`/api/v2/investigation-flows/${id}`, options);
	}

	static async createStep(flowId: number, body: CreateStepBody, options: ApiOptions = {}) {
		return ApiService.post<InvestigationFlowStep, CreateStepBody>(
			`/api/v2/investigation-flows/${flowId}/steps`,
			body,
			options
		);
	}

	static async updateStep(
		flowId: number,
		stepId: number,
		body: UpdateStepBody,
		options: ApiOptions = {}
	) {
		return ApiService.put<InvestigationFlowStep, UpdateStepBody>(
			`/api/v2/investigation-flows/${flowId}/steps/${stepId}`,
			body,
			options
		);
	}

	static async deleteStep(flowId: number, stepId: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(
			`/api/v2/investigation-flows/${flowId}/steps/${stepId}`,
			options
		);
	}

	// --- Deploy to existing ---

	static async deploy(id: number, options: ApiOptions = {}) {
		return ApiService.post<DeployFlowResult, Record<string, never>>(
			`/api/v2/investigation-flows/${id}/deploy`,
			{},
			options
		);
	}

	// --- Alert-scoped progress ---

	static async getAlertProgress(alertId: number, options: ApiOptions = {}) {
		return ApiService.get<InvestigationOverview>(
			`/api/v2/alerts/${alertId}/investigation-progress`,
			options
		);
	}

	static async recordAlertProgress(
		alertId: number,
		stepId: number,
		note: string | undefined,
		options: ApiOptions = {}
	) {
		return ApiService.post<InvestigationProgress, { note?: string }>(
			`/api/v2/alerts/${alertId}/investigation-progress/${stepId}`,
			{ note },
			options
		);
	}

	static async uncheckAlertProgress(alertId: number, stepId: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(
			`/api/v2/alerts/${alertId}/investigation-progress/${stepId}`,
			options
		);
	}

	// --- AlertCluster-scoped progress (mirrors the alert endpoints) ---

	static async getAlertClusterProgress(alertClusterId: number, options: ApiOptions = {}) {
		return ApiService.get<InvestigationOverview>(
			`/api/v2/alert-clusters/${alertClusterId}/investigation-progress`,
			options
		);
	}

	static async recordAlertClusterProgress(
		alertClusterId: number,
		stepId: number,
		note: string | undefined,
		options: ApiOptions = {}
	) {
		return ApiService.post<InvestigationProgress, { note?: string }>(
			`/api/v2/alert-clusters/${alertClusterId}/investigation-progress/${stepId}`,
			{ note },
			options
		);
	}

	static async uncheckAlertClusterProgress(
		alertClusterId: number,
		stepId: number,
		options: ApiOptions = {}
	) {
		return ApiService.delete<null>(
			`/api/v2/alert-clusters/${alertClusterId}/investigation-progress/${stepId}`,
			options
		);
	}
}
