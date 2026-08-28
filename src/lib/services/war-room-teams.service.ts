/**
 * v2 service for per-war-room teams.
 *
 * Teams are named groupings of war-room members used as @-mention
 * targets in chat, notes, tasks, and threads. Team membership drives
 * the notification fan-out: @-team resolves to every user in that team
 * who is still a war-room member.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomTeam {
	team_id: number;
	war_room_id: number;
	name: string;
	description: string | null;
	color: string | null;
	created_at: string | null;
	created_by_id: number | null;
	/** Present on list/get responses; may be null on the raw create response. */
	member_ids: number[] | null;
}

export interface WarRoomTeamMember {
	team_id: number;
	user_id: number;
	added_at: string | null;
	added_by_id: number | null;
	/**
	 * True when the user wasn't a war-room member before this call and
	 * was auto-added as `responder` with full access in the same
	 * transaction. Present only on the response to `POST members`.
	 */
	auto_added_room_member?: boolean;
}

export interface CreateTeamBody {
	name: string;
	description?: string | null;
	color?: string | null;
}

export interface UpdateTeamBody {
	name?: string;
	description?: string | null;
	color?: string | null;
}

export class WarRoomTeamsService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTeam[]>> {
		return ApiService.get<WarRoomTeam[]>(`/war-rooms/${warRoomId}/teams`, options);
	}

	static get(
		warRoomId: number,
		teamId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTeam>> {
		return ApiService.get<WarRoomTeam>(`/war-rooms/${warRoomId}/teams/${teamId}`, options);
	}

	static create(
		warRoomId: number,
		body: CreateTeamBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTeam>> {
		return ApiService.post<WarRoomTeam>(`/war-rooms/${warRoomId}/teams`, body, options);
	}

	static update(
		warRoomId: number,
		teamId: number,
		body: UpdateTeamBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTeam>> {
		return ApiService.patch<WarRoomTeam>(`/war-rooms/${warRoomId}/teams/${teamId}`, body, options);
	}

	static remove(
		warRoomId: number,
		teamId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/teams/${teamId}`, options);
	}

	static listMembers(
		warRoomId: number,
		teamId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTeamMember[]>> {
		return ApiService.get<WarRoomTeamMember[]>(
			`/war-rooms/${warRoomId}/teams/${teamId}/members`,
			options
		);
	}

	static addMember(
		warRoomId: number,
		teamId: number,
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTeamMember>> {
		return ApiService.post<WarRoomTeamMember>(
			`/war-rooms/${warRoomId}/teams/${teamId}/members`,
			{ user_id: userId },
			options
		);
	}

	static removeMember(
		warRoomId: number,
		teamId: number,
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/teams/${teamId}/members/${userId}`,
			options
		);
	}
}
