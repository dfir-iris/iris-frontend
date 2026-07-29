/**
 * Case-chat service — REST wrappers for conversation CRUD and a
 * `ChatSocketClient` class that owns the `/chat` SocketIO connection
 * for one panel instance.
 *
 * The socket does the token streaming; the REST endpoints are for
 * listing / opening / archiving conversations without spinning up a
 * socket. Both paths speak the same envelope shape as every other v2
 * service in the app (`ApiService.get/post/delete`).
 */
import { io, type Socket } from 'socket.io-client';
import { env } from '$env/dynamic/public';
import { auth } from '$lib/stores/auth.store';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// ---------------------------------------------------------------------
// Types — mirror the backend Marshmallow schemas
// ---------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'tool';

/**
 * Anthropic-shaped content block, the same shape the backend
 * persists. Kept intentionally open — new block types (image, audio)
 * can appear without a TS change.
 */
export interface ChatContentBlock {
	type: 'text' | 'tool_use' | 'tool_result' | string;
	// text block
	text?: string;
	// tool_use block
	id?: string;
	name?: string;
	input?: Record<string, unknown>;
	// tool_result block
	tool_use_id?: string;
	content?: unknown;
	[k: string]: unknown;
}

export interface ChatMessage {
	id: number;
	conversation_id: number;
	role: ChatRole;
	content: ChatContentBlock[];
	tool_use_id?: string | null;
	created_at: string;
}

export interface ChatConversation {
	id: number;
	case_id: number | null;
	user_id: number;
	model: string;
	title: string;
	created_at: string;
	updated_at: string;
	archived_at: string | null;
}

export interface PendingToolCall {
	id: number;
	conversation_id: number;
	assistant_message_id: number;
	tool_use_id: string;
	tool_name: string;
	arguments: Record<string, unknown>;
	status: 'pending' | 'approved' | 'denied' | 'expired';
	created_at: string;
}

export interface ChatConversationDetail extends ChatConversation {
	messages: ChatMessage[];
	pending_tool_calls: PendingToolCall[];
}

export interface ChatHealth {
	enabled: boolean;
	provider_available: boolean;
	model?: string;
	reason?: string | null;
}

// ---------------------------------------------------------------------
// REST facade
// ---------------------------------------------------------------------

export class ChatService {
	static async health(
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatHealth>> {
		return ApiService.get<ChatHealth>('/case-chat/health', options);
	}

	static async listCaseConversations(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversations: ChatConversation[] }>> {
		return ApiService.get(`/case-chat/cases/${caseId}/conversations`, options);
	}

	static async createCaseConversation(
		caseId: number,
		body: { title?: string } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.post<ChatConversation>(
			`/case-chat/cases/${caseId}/conversations`,
			body,
			options
		);
	}

	static async listGlobalConversations(
		options: ApiOptions = {}
	): Promise<RequestResponse<{ conversations: ChatConversation[] }>> {
		return ApiService.get('/case-chat/global/conversations', options);
	}

	static async createGlobalConversation(
		body: { title?: string } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.post<ChatConversation>(
			'/case-chat/global/conversations',
			body,
			options
		);
	}

	static async getConversation(
		conversationId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversationDetail>> {
		return ApiService.get<ChatConversationDetail>(
			`/case-chat/conversations/${conversationId}`,
			options
		);
	}

	static async archiveConversation(
		conversationId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.delete(
			`/case-chat/conversations/${conversationId}`,
			options
		);
	}

	static async renameConversation(
		conversationId: number,
		title: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<ChatConversation>> {
		return ApiService.patch<ChatConversation>(
			`/case-chat/conversations/${conversationId}`,
			{ title },
			options
		);
	}
}

// ---------------------------------------------------------------------
// SocketIO client
// ---------------------------------------------------------------------

/**
 * Per-panel socket. Owns one `/chat` namespace connection and dispatches
 * inbound events into user-supplied handlers. Auth mirrors the
 * `/notifications` pattern in `notifications.store.ts`.
 */
export type ChatSocketHandlers = {
	onAssistantDelta?: (payload: { conversation_id: number; text: string }) => void;
	onAssistantToolStart?: (payload: {
		conversation_id: number;
		pending_tool_call_id?: number;
		tool_use_id: string;
		tool_name: string;
		arguments: Record<string, unknown>;
		is_write: boolean;
		pending: boolean;
	}) => void;
	onAssistantToolResult?: (payload: {
		conversation_id: number;
		tool_use_id: string;
		tool_name: string;
		result?: unknown;
		error?: string;
	}) => void;
	onAssistantEnd?: (payload: {
		conversation_id: number;
		message_id?: number;
		stop_reason?: string;
	}) => void;
	onUserMessagePersisted?: (payload: { conversation_id: number }) => void;
	onError?: (payload: { message: string }) => void;
	onConnectFailure?: () => void;
};

export class ChatSocketClient {
	private socket: Socket | null = null;
	private handlers: ChatSocketHandlers;

	constructor(handlers: ChatSocketHandlers = {}) {
		this.handlers = handlers;
	}

	connect(): void {
		if (this.socket) return;
		const token = auth.getAccessToken();
		const baseUrl = env.PUBLIC_EXTERNAL_API_URL?.replace(/\/$/, '') ?? '';

		this.socket = io(`${baseUrl}/chat`, {
			auth: token ? { token } : {},
			extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
			transports: ['websocket', 'polling'],
			reconnectionAttempts: 3
		});

		this.socket.on('assistant_delta', (p) => this.handlers.onAssistantDelta?.(p));
		this.socket.on('assistant_tool_start', (p) =>
			this.handlers.onAssistantToolStart?.(p)
		);
		this.socket.on('assistant_tool_result', (p) =>
			this.handlers.onAssistantToolResult?.(p)
		);
		this.socket.on('assistant_end', (p) => this.handlers.onAssistantEnd?.(p));
		this.socket.on('user_message_persisted', (p) =>
			this.handlers.onUserMessagePersisted?.(p)
		);
		this.socket.on('error', (p) => this.handlers.onError?.(p ?? {}));
		this.socket.on('connect_error', () => this.handlers.onConnectFailure?.());
	}

	disconnect(): void {
		this.socket?.disconnect();
		this.socket = null;
	}

	joinConversation(conversationId: number): void {
		this.socket?.emit('join_conversation', {
			conversation_id: conversationId
		});
	}

	leaveConversation(conversationId: number): void {
		this.socket?.emit('leave_conversation', {
			conversation_id: conversationId
		});
	}

	send(conversationId: number, userText: string): void {
		this.socket?.emit('send', {
			conversation_id: conversationId,
			user_text: userText
		});
	}

	approveTool(pendingToolCallId: number, conversationId: number): void {
		this.socket?.emit('approve_tool', {
			pending_tool_call_id: pendingToolCallId,
			conversation_id: conversationId
		});
	}

	denyTool(pendingToolCallId: number, conversationId: number): void {
		this.socket?.emit('deny_tool', {
			pending_tool_call_id: pendingToolCallId,
			conversation_id: conversationId
		});
	}
}
