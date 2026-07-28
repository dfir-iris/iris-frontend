/**
 * Global chat panel context — one instance per app-shell layout.
 *
 * Owns the panel's open/closed state, the currently-open conversation,
 * the rendered message list, and the streaming pipeline (buffered
 * assistant text, pending write approvals). The panel component
 * (`ChatBotPanel.svelte`) is a thin renderer over this rune state.
 *
 * Mounted at `src/routes/(app)/+layout.svelte` (not the case layout)
 * so open/closed and current conversation survive navigation between
 * cases, alerts, war rooms, and the dashboard.
 */

import type {
	ChatContentBlock,
	ChatConversation,
	ChatMessage,
	PendingToolCall
} from '$lib/services/chat.service';
import { ChatService, ChatSocketClient } from '$lib/services/chat.service';
import { toast } from '$lib/components/ui/toast';

export const CHAT_PANEL_CTX = Symbol('chat-panel');

/**
 * A staged message shown mid-stream (assistant text arriving delta by
 * delta before the final backend-persisted row lands). Merged into the
 * canonical `messages` array once `assistant_end` fires, or dropped on
 * `error`.
 */
export interface StreamingAssistant {
	text: string;
	toolUses: {
		tool_use_id: string;
		tool_name: string;
		arguments: Record<string, unknown>;
		is_write: boolean;
		pending: boolean;
		pending_tool_call_id?: number;
		result?: unknown;
		error?: string;
	}[];
}

export const createChatPanelContext = () => {
	const state = $state<{
		open: boolean;
		streamingConversationId: number | null;
		currentConversation: ChatConversation | null;
		messages: ChatMessage[];
		pendingToolCalls: PendingToolCall[];
		streamingAssistant: StreamingAssistant | null;
		error: string | null;
		loading: boolean;
	}>({
		open: false,
		streamingConversationId: null,
		currentConversation: null,
		messages: [],
		pendingToolCalls: [],
		streamingAssistant: null,
		error: null,
		loading: false
	});

	let socket: ChatSocketClient | null = null;

	const _ensureSocket = () => {
		if (socket) return socket;
		socket = new ChatSocketClient({
			onAssistantDelta: (payload) => {
				if (!state.streamingAssistant) {
					state.streamingAssistant = { text: '', toolUses: [] };
				}
				state.streamingAssistant = {
					...state.streamingAssistant,
					text: state.streamingAssistant.text + (payload.text ?? '')
				};
			},
			onAssistantToolStart: (payload) => {
				if (!state.streamingAssistant) {
					state.streamingAssistant = { text: '', toolUses: [] };
				}
				const nextToolUses = [
					...state.streamingAssistant.toolUses,
					{
						tool_use_id: payload.tool_use_id,
						tool_name: payload.tool_name,
						arguments: payload.arguments,
						is_write: payload.is_write,
						pending: payload.pending,
						pending_tool_call_id: payload.pending_tool_call_id
					}
				];
				state.streamingAssistant = {
					...state.streamingAssistant,
					toolUses: nextToolUses
				};
				if (payload.pending && payload.pending_tool_call_id != null) {
					// Refresh the persisted pending list so the panel can
					// render the Approve/Deny card from a canonical source
					// (survives reload).
					void refreshPending();
				}
			},
			onAssistantToolResult: (payload) => {
				if (!state.streamingAssistant) return;
				state.streamingAssistant = {
					...state.streamingAssistant,
					toolUses: state.streamingAssistant.toolUses.map((tu) =>
						tu.tool_use_id === payload.tool_use_id
							? { ...tu, result: payload.result, error: payload.error }
							: tu
					)
				};
			},
			onAssistantEnd: () => {
				// The backend already persisted the assistant message;
				// re-fetch the conversation so `messages` reflects the
				// canonical rows. Cheaper than deriving the shape here.
				if (state.currentConversation) {
					void refresh(state.currentConversation.id);
				}
				state.streamingAssistant = null;
				state.streamingConversationId = null;
			},
			onUserMessagePersisted: () => {
				// Refresh to pick up the newly-persisted user turn.
				if (state.currentConversation) {
					void refresh(state.currentConversation.id);
				}
			},
			onError: (payload) => {
				state.error = payload.message || 'Chatbot error';
				state.streamingAssistant = null;
				state.streamingConversationId = null;
				toast({ title: state.error, variant: 'destructive' });
			},
			onConnectFailure: () => {
				state.error =
					'Could not connect to the chatbot socket. Reload the page to retry.';
			}
		});
		socket.connect();
		return socket;
	};

	const refresh = async (conversationId: number) => {
		const res = await ChatService.getConversation(conversationId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const data = res.data as ChatMessage[] extends unknown[] ? never : never;
			void data;
			const conv = res.data as unknown as {
				id: number;
				messages: ChatMessage[];
				pending_tool_calls: PendingToolCall[];
			} & ChatConversation;
			state.currentConversation = conv;
			state.messages = conv.messages ?? [];
			state.pendingToolCalls = conv.pending_tool_calls ?? [];
		}
	};

	const refreshPending = async () => {
		if (!state.currentConversation) return;
		await refresh(state.currentConversation.id);
	};

	const openPanel = () => {
		state.open = true;
	};
	const closePanel = () => {
		state.open = false;
	};
	const toggle = () => {
		state.open = !state.open;
	};

	const openConversation = async (conversationId: number) => {
		state.loading = true;
		state.error = null;
		try {
			await refresh(conversationId);
			_ensureSocket().joinConversation(conversationId);
		} finally {
			state.loading = false;
		}
	};

	const startCaseConversation = async (caseId: number, title = '') => {
		state.loading = true;
		state.error = null;
		try {
			const res = await ChatService.createCaseConversation(caseId, { title });
			if (res.ok && res.data && typeof res.data !== 'string') {
				const conv = res.data as ChatConversation;
				state.currentConversation = conv;
				state.messages = [];
				state.pendingToolCalls = [];
				_ensureSocket().joinConversation(conv.id);
				return conv.id;
			}
			state.error =
				(res.error?.message as string) || 'Could not create conversation';
			return null;
		} finally {
			state.loading = false;
		}
	};

	const startGlobalConversation = async (title = '') => {
		state.loading = true;
		state.error = null;
		try {
			const res = await ChatService.createGlobalConversation({ title });
			if (res.ok && res.data && typeof res.data !== 'string') {
				const conv = res.data as ChatConversation;
				state.currentConversation = conv;
				state.messages = [];
				state.pendingToolCalls = [];
				_ensureSocket().joinConversation(conv.id);
				return conv.id;
			}
			state.error =
				(res.error?.message as string) || 'Could not create conversation';
			return null;
		} finally {
			state.loading = false;
		}
	};

	const send = (text: string) => {
		if (!state.currentConversation) return;
		state.error = null;
		state.streamingAssistant = { text: '', toolUses: [] };
		state.streamingConversationId = state.currentConversation.id;
		_ensureSocket().send(state.currentConversation.id, text);
	};

	const approveTool = (pendingToolCallId: number) => {
		if (!state.currentConversation) return;
		state.streamingAssistant = { text: '', toolUses: [] };
		state.streamingConversationId = state.currentConversation.id;
		_ensureSocket().approveTool(pendingToolCallId, state.currentConversation.id);
	};

	const denyTool = (pendingToolCallId: number) => {
		if (!state.currentConversation) return;
		state.streamingAssistant = { text: '', toolUses: [] };
		state.streamingConversationId = state.currentConversation.id;
		_ensureSocket().denyTool(pendingToolCallId, state.currentConversation.id);
	};

	return {
		get state() {
			return state;
		},
		openPanel,
		closePanel,
		toggle,
		openConversation,
		startCaseConversation,
		startGlobalConversation,
		send,
		approveTool,
		denyTool,
		refresh,
		// Escape hatch for tests: drop the socket so a follow-up connect()
		// picks up a fresh token.
		disconnect: () => {
			socket?.disconnect();
			socket = null;
		}
	};
};

// Referenced by ChatContentBlock consumers — silence "declared but not used".
export type { ChatContentBlock };

export type ChatPanelContext = ReturnType<typeof createChatPanelContext>;
