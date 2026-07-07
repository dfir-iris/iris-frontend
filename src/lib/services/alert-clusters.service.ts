import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { AlertCluster } from '$lib/types/resources/alert-cluster';

export interface ListAlertClustersParams {
	page?: number;
	per_page?: number;
	customer_id?: number;
	status_id?: number;
	title?: string;
	sort?: string;
}

export interface CreateAlertClusterBody {
	cluster_title: string;
	cluster_description?: string;
	cluster_status_id: number;
	cluster_severity_id?: number | null;
	cluster_customer_id: number;
	cluster_owner_id?: number | null;
	alert_ids?: number[];
}

export interface UpdateAlertClusterBody {
	cluster_title?: string;
	cluster_description?: string;
	cluster_status_id?: number;
	cluster_severity_id?: number | null;
	cluster_owner_id?: number | null;
}

export interface EscalateAlertClusterBody {
	template_id?: number;
	case_title?: string;
	note?: string;
	import_as_event?: boolean;
	case_tags?: string;
}

export interface MergeAlertClusterBody {
	target_case_id: number;
	note?: string;
	import_as_event?: boolean;
	case_tags?: string;
}

export interface EscalateAlertClusterResponse {
	cluster_id: number;
	case_id: number;
}

export interface CaseSourceAlertCluster {
	cluster_id: number;
	cluster_title: string;
	cluster_status: string | null;
}

export interface AlertClusterGraphNode {
	id: string;
	label: string;
	title?: string;
	group: 'alert' | 'ioc' | 'asset';
	image?: string;
}

export interface AlertClusterGraphEdge {
	from: string;
	to: string;
	dashes?: boolean;
}

export interface AlertClusterGraph {
	nodes: AlertClusterGraphNode[];
	edges: AlertClusterGraphEdge[];
}

export interface PaginatedAlertClusters {
	data: AlertCluster[];
	total: number;
	current_page: number;
	last_page: number | null;
	next_page: number | null;
}

export class AlertClustersService {
	static async list(
		params: ListAlertClustersParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<PaginatedAlertClusters>> {
		const path = ApiService.withQuery('/api/v2/alert-clusters', params as Record<string, unknown>);
		return ApiService.get<PaginatedAlertClusters>(path, options);
	}

	static async get(id: number, options: ApiOptions = {}) {
		return ApiService.get<AlertCluster>(`/api/v2/alert-clusters/${id}`, options);
	}

	static async create(body: CreateAlertClusterBody, options: ApiOptions = {}) {
		return ApiService.post<AlertCluster, CreateAlertClusterBody>('/api/v2/alert-clusters', body, options);
	}

	static async update(id: number, body: UpdateAlertClusterBody, options: ApiOptions = {}) {
		return ApiService.put<AlertCluster, UpdateAlertClusterBody>(`/api/v2/alert-clusters/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(`/api/v2/alert-clusters/${id}`, options);
	}

	static async addAlerts(id: number, alertIds: number[], options: ApiOptions = {}) {
		return ApiService.post<AlertCluster, { alert_ids: number[] }>(
			`/api/v2/alert-clusters/${id}/alerts`,
			{ alert_ids: alertIds },
			options
		);
	}

	static async removeAlert(id: number, alertId: number, options: ApiOptions = {}) {
		return ApiService.delete<AlertCluster>(`/api/v2/alert-clusters/${id}/alerts/${alertId}`, options);
	}

	static async escalate(id: number, body: EscalateAlertClusterBody, options: ApiOptions = {}) {
		return ApiService.post<EscalateAlertClusterResponse, EscalateAlertClusterBody>(
			`/api/v2/alert-clusters/${id}/escalate`,
			body,
			options
		);
	}

	// Merge a cluster's alerts into an existing case. Returns the same
	// `{ cluster_id, case_id }` envelope as escalate so the caller can
	// navigate to the target case on success.
	static async merge(id: number, body: MergeAlertClusterBody, options: ApiOptions = {}) {
		return ApiService.post<EscalateAlertClusterResponse, MergeAlertClusterBody>(
			`/api/v2/alert-clusters/${id}/merge`,
			body,
			options
		);
	}

	// Reverse lookup used by the case detail topbar to render a
	// "back to source cluster" chip when the case was created from
	// (or merged into by) a cluster. Backend returns `null` when the
	// case has no source cluster so the chip can hide itself.
	static async forCase(caseId: number, options: ApiOptions = {}) {
		return ApiService.get<CaseSourceAlertCluster | null>(
			`/api/v2/cases/${caseId}/source-alert-cluster`,
			options
		);
	}

	// Reverse a cluster->case escalation/merge from the cluster side.
	// Server clears `cluster_case_id`, moves the cluster back to
	// `Investigating`, and re-assigns every member alert. Returns
	// `{unlinked: false}` when nothing was linked (idempotent no-op).
	static async unlinkCase(id: number, options: ApiOptions = {}) {
		return ApiService.delete<{ unlinked: boolean; cluster_id?: number }>(
			`/api/v2/alert-clusters/${id}/case`,
			options
		);
	}

	// Correlation graph across the cluster's member alerts. IOCs and
	// assets are deduplicated server-side so shared indicators show as
	// junction points between multiple alert nodes.
	static async graph(id: number, options: ApiOptions = {}) {
		return ApiService.get<AlertClusterGraph>(`/api/v2/alert-clusters/${id}/graph`, options);
	}
}
