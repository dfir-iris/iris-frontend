/**
 * War-room chat REST wrapper.
 *
 * Cursor-paginated (`before=<message_id>`) — the SPA scrolls back by
 * passing the smallest id it has loaded. Slash commands are resolved
 * server-side; the SPA just POSTs the body verbatim.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type ChatMessageKind =
	| 'message'
	| 'system'
	| 'task_assigned'
	| 'task_completed'
	| 'case_attached'
	| 'case_detached'
	| 'case_activity'
	| 'sitrep_published'
	| 'note'
	| 'pin'
	| 'decision'
	| 'priority';

export interface ChatReaction {
	emoji: string;
	count: number;
	user_ids: number[];
}

export interface ChatMessage {
	message_id: number;
	war_room_id: number;
	author_id: number | null;
	author_login: string | null;
	author_name: string | null;
	body: string | null;
	kind: ChatMessageKind;
	ref_type: string | null;
	ref_id: number | null;
	ref_case_id: number | null;
	/**
	 * Fine-grained classifier for case-activity rows: `note.created`,
	 * `ioc.updated`, `asset.deleted`, etc. NULL for chat-author messages
	 * and for system rows that don't map to a tracked-activity verb. The
	 * Stream tab uses this to drive per-case, per-type filter checkboxes.
	 */
	activity_type: string | null;
	created_at: string | null;
	edited_at: string | null;
	deleted_at: string | null;
	reactions: ChatReaction[];
}

export interface ListChatParams {
	before?: number;
	limit?: number;
	kinds?: ChatMessageKind[];
	caseIds?: number[];
}

export class WarRoomChatService {
	static list(
		warRoomId: number,
		params: ListChatParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatMessage[]>> {
		const qs = new URLSearchParams();
		if (params.before != null) qs.set('before', String(params.before));
		if (params.limit != null) qs.set('limit', String(params.limit));
		if (params.kinds && params.kinds.length) qs.set('kinds', params.kinds.join(','));
		if (params.caseIds && params.caseIds.length)
			qs.set('case_ids', params.caseIds.join(','));
		const tail = qs.toString();
		const path = tail
			? `/war-rooms/${warRoomId}/chat?${tail}`
			: `/war-rooms/${warRoomId}/chat`;
		return ApiService.get<ChatMessage[]>(path, options);
	}

	static post(
		warRoomId: number,
		body: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; kind: ChatMessageKind }>> {
		return ApiService.post(`/war-rooms/${warRoomId}/chat`, { body }, options);
	}

	static edit(
		warRoomId: number,
		messageId: number,
		body: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number }>> {
		return ApiService.patch(`/war-rooms/${warRoomId}/chat/${messageId}`, { body }, options);
	}

	static remove(
		warRoomId: number,
		messageId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/chat/${messageId}`, options);
	}

	static toggleReaction(
		warRoomId: number,
		messageId: number,
		emoji: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; added: boolean }>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/chat/${messageId}/reactions`,
			{ emoji },
			options
		);
	}
}
