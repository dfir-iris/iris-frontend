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
	/**
	 * Threading. `parent_message_id` is non-null on replies and points
	 * to the thread root. `thread_title` is set only when a root has
	 * been promoted to a named topic. Both fields are null on virtual
	 * UA rows so the stream renderer can treat them as plain entries.
	 */
	parent_message_id: number | null;
	thread_title: string | null;
	created_at: string | null;
	edited_at: string | null;
	deleted_at: string | null;
	reactions: ChatReaction[];
}

export interface ChatThreadRoot {
	message_id: number;
	thread_title: string | null;
	preview: string | null;
	kind: ChatMessageKind;
	author_id: number | null;
	author_login: string | null;
	author_name: string | null;
	reply_count: number;
	last_activity_at: string | null;
	created_at: string | null;
	deleted_at: string | null;
	is_followed: boolean;
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

	static listThreads(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatThreadRoot[]>> {
		return ApiService.get<ChatThreadRoot[]>(
			`/war-rooms/${warRoomId}/chat/threads`,
			options
		);
	}

	/**
	 * Trace log — every decision / pin / note in the war room, top-level
	 * or nested in a thread, newest first. Powers the "Decisions & Pins"
	 * sidebar index; the main chat listing skips replies so a decision
	 * posted inside a thread wouldn't be visible there.
	 */
	static listTraceLog(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatMessage[]>> {
		return ApiService.get<ChatMessage[]>(
			`/war-rooms/${warRoomId}/chat/trace-log`,
			options
		);
	}

	static listReplies(
		warRoomId: number,
		rootMessageId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatMessage[]>> {
		return ApiService.get<ChatMessage[]>(
			`/war-rooms/${warRoomId}/chat/${rootMessageId}/replies`,
			options
		);
	}

	static reply(
		warRoomId: number,
		rootMessageId: number,
		body: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; parent_message_id: number }>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/chat/${rootMessageId}/replies`,
			{ body },
			options
		);
	}

	static setThreadTitle(
		warRoomId: number,
		rootMessageId: number,
		title: string | null,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; thread_title: string | null }>> {
		return ApiService.patch(
			`/war-rooms/${warRoomId}/chat/${rootMessageId}/thread-title`,
			{ title },
			options
		);
	}

	static followThread(
		warRoomId: number,
		rootMessageId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; added: boolean }>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/chat/${rootMessageId}/follow`,
			{},
			options
		);
	}

	static unfollowThread(
		warRoomId: number,
		rootMessageId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; removed: boolean }>> {
		return ApiService.delete<{ message_id: number; removed: boolean }>(
			`/war-rooms/${warRoomId}/chat/${rootMessageId}/follow`,
			options
		);
	}
}
