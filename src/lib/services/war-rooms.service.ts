/**
 * v2 service for the War Room feature.
 *
 * Wraps `/api/v2/war-rooms` and its sub-resources (members, attached
 * cases). The chat, tasks, timelines, notes, SitReps, graph, and
 * datastore have their own dedicated services so this file stays
 * focused on the workspace itself.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type WarRoomState = 'open' | 'active' | 'standby' | 'closed';
export type WarRoomMemberRole = 'lead' | 'responder' | 'observer';

export interface WarRoom {
	war_room_id: number;
	war_room_uuid: string | null;
	name: string;
	description: string | null;
	state: WarRoomState;
	severity_id: number | null;
	color: string | null;
	created_at: string | null;
	created_by_id: number | null;
	closed_at: string | null;
	closed_by_id: number | null;
	custom_attributes: Record<string, unknown> | null;
}

export interface WarRoomMember {
	war_room_id: number;
	user_id: number;
	user_login: string;
	user_name: string;
	role: WarRoomMemberRole;
	added_at: string | null;
}

export interface WarRoomCaseAttachment {
	war_room_id: number;
	case_id: number;
	case_name: string;
	attached_at: string | null;
	note: string | null;
}

export interface WarRoomCaseSummary {
	war_room_id: number;
	name: string;
	state: WarRoomState;
	color: string | null;
}

export interface CreateWarRoomBody {
	name: string;
	description?: string | null;
	state?: WarRoomState;
	severity_id?: number | null;
	color?: string | null;
	custom_attributes?: Record<string, unknown> | null;
}

export interface UpdateWarRoomBody {
	name?: string;
	description?: string | null;
	state?: WarRoomState;
	severity_id?: number | null;
	color?: string | null;
	custom_attributes?: Record<string, unknown> | null;
}

export interface AddMemberBody {
	user_id: number;
	role?: WarRoomMemberRole;
	access_level?: number;
}

export interface AttachCaseBody {
	case_id: number;
	note?: string | null;
}

export interface ListWarRoomsParams {
	state?: WarRoomState;
	search?: string;
}

export class WarRoomsService {
	static list(
		params: ListWarRoomsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoom[]>> {
		const qs = new URLSearchParams();
		if (params.state) qs.set('state', params.state);
		if (params.search) qs.set('search', params.search);
		const tail = qs.toString();
		const path = tail ? `/war-rooms?${tail}` : '/war-rooms';
		return ApiService.get<WarRoom[]>(path, options);
	}

	static create(
		body: CreateWarRoomBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoom>> {
		return ApiService.post<WarRoom>('/war-rooms', body, options);
	}

	static get(id: number, options: ApiOptions = {}): Promise<RequestResponse<WarRoom>> {
		return ApiService.get<WarRoom>(`/war-rooms/${id}`, options);
	}

	static update(
		id: number,
		body: UpdateWarRoomBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoom>> {
		return ApiService.patch<WarRoom>(`/war-rooms/${id}`, body, options);
	}

	static remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${id}`, options);
	}

	// --- Members ----
	static listMembers(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomMember[]>> {
		return ApiService.get<WarRoomMember[]>(`/war-rooms/${id}/members`, options);
	}

	static addMember(
		id: number,
		body: AddMemberBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomMember>> {
		return ApiService.post<WarRoomMember>(`/war-rooms/${id}/members`, body, options);
	}

	static removeMember(
		id: number,
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${id}/members/${userId}`, options);
	}

	// --- Case attachment ----
	static listCases(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomCaseAttachment[]>> {
		return ApiService.get<WarRoomCaseAttachment[]>(`/war-rooms/${id}/cases`, options);
	}

	static attachCase(
		id: number,
		body: AttachCaseBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomCaseAttachment>> {
		return ApiService.post<WarRoomCaseAttachment>(
			`/war-rooms/${id}/cases`,
			body,
			options
		);
	}

	static detachCase(
		id: number,
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${id}/cases/${caseId}`, options);
	}

	// --- Reverse lookup from a case ----
	static forCase(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomCaseSummary[]>> {
		return ApiService.get<WarRoomCaseSummary[]>(`/cases/${caseId}/war-rooms`, options);
	}
}
