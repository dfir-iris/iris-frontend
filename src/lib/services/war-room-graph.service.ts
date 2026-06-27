/** War-room graph board REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface GraphNode {
	node_id: number | string;
	kind: 'case' | 'annotation' | 'group';
	ref_id: number | null;
	label: string | null;
	note_md: string | null;
	color: string | null;
	x: number;
	y: number;
	tmp_id?: string;
}

export interface GraphEdge {
	edge_id?: number | string;
	from_node_id: number | string;
	to_node_id: number | string;
	label: string | null;
	note_md: string | null;
	style: string | null;
}

export interface GraphPayload {
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface CaseSummary {
	case_id: number;
	name: string | null;
	severity_id: number | null;
	state_id: number | null;
	closed: boolean;
	owner: { user_id: number; user_login: string; user_name: string } | null;
	counts: {
		tasks_total: number;
		tasks_open: number;
		assets: number;
		iocs: number;
		events: number;
	};
	top_tasks: Array<{
		task_id: number;
		title: string | null;
		status_id: number | null;
		assignee_id: number | null;
	}>;
	last_activity: { at: string | null; desc: string | null } | null;
}

export class WarRoomGraphService {
	static get(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphPayload>> {
		return ApiService.get<GraphPayload>(`/war-rooms/${warRoomId}/graph`, options);
	}

	static save(
		warRoomId: number,
		payload: GraphPayload,
		options: ApiOptions = {}
	): Promise<RequestResponse<GraphPayload>> {
		return ApiService.put<GraphPayload>(
			`/war-rooms/${warRoomId}/graph`,
			payload,
			options
		);
	}

	static caseSummary(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseSummary>> {
		return ApiService.get<CaseSummary>(`/cases/${caseId}/summary`, options);
	}
}
