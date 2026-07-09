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
	| 'priority'
	| 'poll';

export interface ChatReaction {
	emoji: string;
	count: number;
	user_ids: number[];
}

export interface ChatPollOptionVoter {
	user_id: number;
	user_login: string | null;
	user_name: string | null;
}

export interface ChatPollOption {
	option_id: number;
	label: string;
	sort_order: number;
	vote_count: number;
	/** Only populated on non-anonymous polls. */
	voters?: ChatPollOptionVoter[];
}

export interface ChatPoll {
	poll_id: number;
	war_room_id: number;
	author_id: number | null;
	question: string;
	is_multi_select: boolean;
	is_anonymous: boolean;
	closes_at: string | null;
	closed_at: string | null;
	is_closed: boolean;
	chat_message_id: number | null;
	created_at: string | null;
	/** Viewer's own selections. Always populated (even on anonymous polls). */
	my_votes: number[];
	options: ChatPollOption[];
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
	/**
	 * Analyst-toggled sticky flag. When true the message gets a small
	 * pin badge inline in the stream and surfaces in the "Decisions &
	 * Pins" sidebar. `getattr`-guarded on the backend so pre-migration
	 * databases return `false` rather than 500'ing the read.
	 */
	is_pinned: boolean;
	/**
	 * Topic partition — the top-level lane this message belongs to.
	 * `null` means the message is on the war-room's Main topic (either
	 * the message pre-dates the topics migration or the poster left
	 * `topic_id` unset). The sidebar always shows Main as its first
	 * entry so a `null` value still has a clear rendering.
	 */
	topic_id: number | null;
	created_at: string | null;
	edited_at: string | null;
	deleted_at: string | null;
	reactions: ChatReaction[];
	/**
	 * Inlined poll state on `kind==='poll'` messages so the stream
	 * loads without a second RPC per poll. Null for every other kind.
	 */
	poll?: ChatPoll | null;
}

export interface ChatTopic {
	topic_id: number;
	war_room_id: number;
	name: string;
	is_main: boolean;
	created_by_id: number | null;
	created_at: string | null;
	/** Non-null once the topic has been archived. Archived topics stay
	 * readable but the composer refuses to post into them. */
	archived_at: string | null;
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
	/**
	 * Free-text needle. Applied server-side as a case-insensitive
	 * ILIKE against the chat body and (for case activity rows) the
	 * activity description. Empty / whitespace is treated as "no
	 * filter" so callers can pass `search` unconditionally.
	 */
	search?: string;
	/**
	 * Topic-id filter. When populated the server returns only messages
	 * belonging to one of these topics; a `null`-topic message (which
	 * lives on Main) is included when the Main topic id is in this
	 * list. Omit the field entirely to skip the filter — sending an
	 * empty array intentionally returns nothing.
	 */
	topicIds?: number[];
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
		if (params.search && params.search.trim())
			qs.set('search', params.search.trim());
		if (params.topicIds !== undefined)
			qs.set('topic_ids', params.topicIds.join(','));
		const tail = qs.toString();
		const path = tail
			? `/war-rooms/${warRoomId}/chat?${tail}`
			: `/war-rooms/${warRoomId}/chat`;
		return ApiService.get<ChatMessage[]>(path, options);
	}

	static post(
		warRoomId: number,
		body: string,
		topicId: number | null = null,
		options: ApiOptions = {}
	): Promise<
		RequestResponse<{
			message_id: number;
			kind: ChatMessageKind;
			/** Populated when the posted body was `/topic <name>` — the SPA
			 * uses this to auto-switch the selection to the new topic. */
			topic?: ChatTopic;
		}>
	> {
		const payload: { body: string; topic_id?: number } = { body };
		if (topicId != null) payload.topic_id = topicId;
		return ApiService.post(`/war-rooms/${warRoomId}/chat`, payload, options);
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

	/**
	 * Toggle the sticky pin flag on a message. Backend enforces
	 * war-room write access; anyone with write can pin/unpin (unlike
	 * edit/delete which are author-only).
	 */
	static setMessagePin(
		warRoomId: number,
		messageId: number,
		isPinned: boolean,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; is_pinned: boolean }>> {
		return ApiService.patch(
			`/war-rooms/${warRoomId}/chat/${messageId}/pin`,
			{ is_pinned: isPinned },
			options
		);
	}

	// ---- Polls ----------------------------------------------------

	static createPoll(
		warRoomId: number,
		body: {
			question: string;
			options: string[];
			is_multi_select?: boolean;
			is_anonymous?: boolean;
			closes_at?: string | null;
		},
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message_id: number; poll_id: number }>> {
		return ApiService.post(
			`/war-rooms/${warRoomId}/chat/polls`,
			body,
			options
		);
	}

	static getPoll(
		warRoomId: number,
		pollId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatPoll>> {
		return ApiService.get<ChatPoll>(
			`/war-rooms/${warRoomId}/chat/polls/${pollId}`,
			options
		);
	}

	/** Replace the caller's votes for a poll. `[]` clears them entirely. */
	static voteOnPoll(
		warRoomId: number,
		pollId: number,
		optionIds: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatPoll>> {
		return ApiService.post<ChatPoll>(
			`/war-rooms/${warRoomId}/chat/polls/${pollId}/vote`,
			{ option_ids: optionIds },
			options
		);
	}

	static closePoll(
		warRoomId: number,
		pollId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatPoll>> {
		return ApiService.post<ChatPoll>(
			`/war-rooms/${warRoomId}/chat/polls/${pollId}/close`,
			{},
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

	// ---- Topics ---------------------------------------------------

	static listTopics(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatTopic[]>> {
		return ApiService.get<ChatTopic[]>(
			`/war-rooms/${warRoomId}/chat/topics`,
			options
		);
	}

	static createTopic(
		warRoomId: number,
		name: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatTopic>> {
		return ApiService.post<ChatTopic>(
			`/war-rooms/${warRoomId}/chat/topics`,
			{ name },
			options
		);
	}

	static archiveTopic(
		warRoomId: number,
		topicId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatTopic>> {
		return ApiService.post<ChatTopic>(
			`/war-rooms/${warRoomId}/chat/topics/${topicId}/archive`,
			{},
			options
		);
	}

	static unarchiveTopic(
		warRoomId: number,
		topicId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatTopic>> {
		return ApiService.post<ChatTopic>(
			`/war-rooms/${warRoomId}/chat/topics/${topicId}/unarchive`,
			{},
			options
		);
	}
}
