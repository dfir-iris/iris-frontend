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
	/** Characters revealed to the reader — what the panel actually paints. */
	text: string;
	/** Buffered characters that arrived from the socket but haven't been
	 *  revealed yet. Drained by the drip timer (see `_ensureSocket`).
	 *  Kept separate from `text` so the drip effect works even when SSE
	 *  chunks arrive in bursts of 30-60 chars at a time. */
	pending: string;
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

/**
 * Extra context focus that lives ALONGSIDE the conversation's scope
 * column. Alerts don't get their own scope FK on `case_chat_conversation`
 * (would be a schema change), so we thread the alert focus through the
 * client and inject a one-line note into the first user message when
 * the analyst starts a chat scoped to an alert. The LLM sees that note
 * as user context and reads/acts on the alert via the existing
 * `iris_alerts_*` tools.
 */
export interface ChatFocusHint {
	alertId?: number;
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
		/**
		 * Pending focus hint applied to the NEXT user turn's text.
		 * Cleared after the first send() consumes it. Null when the
		 * conversation has no extra focus.
		 */
		focusHint: ChatFocusHint | null;
	}>({
		open: false,
		streamingConversationId: null,
		currentConversation: null,
		messages: [],
		pendingToolCalls: [],
		streamingAssistant: null,
		error: null,
		loading: false,
		focusHint: null
	});

	let socket: ChatSocketClient | null = null;

	// ---- Character-drip typing effect ----
	// The socket delivers full-token SSE chunks (5-60 chars each). Painting
	// them raw feels jerky — the assistant "types" in staccato bursts.
	// Instead we buffer incoming text into `streamingAssistant.pending`
	// and drain it into `.text` one character at a time at
	// TYPING_CHARS_PER_SEC. Feels like a person typing without exceeding
	// the actual streaming throughput (once pending is empty the drip
	// sleeps until the next chunk lands).
	const TYPING_CHARS_PER_SEC = 90;
	const TYPING_TICK_MS = 20;
	// Chars-per-tick derived so slower connections don't fall behind:
	// at 90 char/s with 20ms ticks we emit ~2 chars per tick. When
	// pending grows large (model bursts a paragraph in one SSE frame),
	// the drainer scales up so we never trail more than 200 chars —
	// beyond that the illusion breaks and it's better to catch up.
	const TYPING_MAX_LAG_CHARS = 200;
	let typingTimer: ReturnType<typeof setInterval> | null = null;

	const _startTypingTimer = () => {
		if (typingTimer != null) return;
		typingTimer = setInterval(() => {
			const sa = state.streamingAssistant;
			if (!sa || sa.pending.length === 0) {
				// Nothing to drip — stop the timer to avoid spinning
				// the JS thread while we wait for the next SSE chunk.
				if (typingTimer != null) {
					clearInterval(typingTimer);
					typingTimer = null;
				}
				return;
			}
			const baseChunk = Math.max(
				1,
				Math.floor((TYPING_CHARS_PER_SEC * TYPING_TICK_MS) / 1000)
			);
			// Catch-up multiplier: if pending is growing past the lag
			// threshold, drain faster so we don't fall behind.
			const chunk = Math.min(
				sa.pending.length,
				sa.pending.length > TYPING_MAX_LAG_CHARS
					? baseChunk * 3
					: baseChunk
			);
			state.streamingAssistant = {
				...sa,
				text: sa.text + sa.pending.slice(0, chunk),
				pending: sa.pending.slice(chunk)
			};
		}, TYPING_TICK_MS);
	};

	const _flushTyping = () => {
		if (typingTimer != null) {
			clearInterval(typingTimer);
			typingTimer = null;
		}
		if (state.streamingAssistant && state.streamingAssistant.pending) {
			state.streamingAssistant = {
				...state.streamingAssistant,
				text: state.streamingAssistant.text + state.streamingAssistant.pending,
				pending: ''
			};
		}
	};

	const _ensureSocket = () => {
		if (socket) return socket;
		socket = new ChatSocketClient({
			onAssistantDelta: (payload) => {
				if (!state.streamingAssistant) {
					state.streamingAssistant = { text: '', pending: '', toolUses: [] };
				}
				state.streamingAssistant = {
					...state.streamingAssistant,
					pending: state.streamingAssistant.pending + (payload.text ?? '')
				};
				_startTypingTimer();
			},
			onAssistantToolStart: (payload) => {
				if (!state.streamingAssistant) {
					state.streamingAssistant = { text: '', pending: '', toolUses: [] };
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
				// Flush any un-dripped characters so the final rendered
				// message matches what the model actually sent (no lost
				// tail if the socket closed while pending had data).
				_flushTyping();
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
				_flushTyping();
				state.error = payload.message || 'Chatbot error';
				state.streamingAssistant = null;
				state.streamingConversationId = null;
				toast({ title: state.error, variant: 'destructive' });
			},
			onConnectFailure: () => {
				state.error =
					'Could not connect to the chatbot socket. Reload the page to retry.';
				// Unlock the composer so the user can at least see the
				// error and try a fresh conversation instead of typing
				// into a paralysed textarea.
				state.streamingConversationId = null;
				state.streamingAssistant = null;
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
		// Opening a previously-persisted conversation is also a reset
		// moment for streaming state — if the tab was closed mid-turn
		// the flag could still be set from the last session.
		state.streamingConversationId = null;
		state.streamingAssistant = null;
		try {
			await refresh(conversationId);
			_ensureSocket().joinConversation(conversationId);
		} finally {
			state.loading = false;
		}
	};

	const listCaseConversations = async (caseId: number): Promise<ChatConversation[]> => {
		const res = await ChatService.listCaseConversations(caseId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const body = res.data as { conversations?: ChatConversation[] };
			return body.conversations ?? [];
		}
		return [];
	};

	const listGlobalConversations = async (): Promise<ChatConversation[]> => {
		const res = await ChatService.listGlobalConversations();
		if (res.ok && res.data && typeof res.data !== 'string') {
			const body = res.data as { conversations?: ChatConversation[] };
			return body.conversations ?? [];
		}
		return [];
	};

	const renameConversation = async (
		conversationId: number,
		title: string
	): Promise<boolean> => {
		const res = await ChatService.renameConversation(conversationId, title);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const updated = res.data as ChatConversation;
			if (state.currentConversation?.id === updated.id) {
				state.currentConversation = updated;
			}
			return true;
		}
		return false;
	};

	const archiveConversation = async (conversationId: number): Promise<boolean> => {
		const res = await ChatService.archiveConversation(conversationId);
		if (!res.ok) return false;
		if (state.currentConversation?.id === conversationId) {
			state.currentConversation = null;
			state.messages = [];
			state.pendingToolCalls = [];
		}
		return true;
	};

	const startCaseConversation = async (caseId: number, title = '') => {
		state.loading = true;
		state.error = null;
		// A previous conversation may have left the composer locked
		// (stuck streamingConversationId if a socket dropped mid-turn).
		// Starting a fresh chat is an explicit reset moment.
		state.streamingConversationId = null;
		state.streamingAssistant = null;
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

	const startWarRoomConversation = async (warRoomId: number, title = '') => {
		state.loading = true;
		state.error = null;
		state.streamingConversationId = null;
		state.streamingAssistant = null;
		try {
			const res = await ChatService.createWarRoomConversation(warRoomId, { title });
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

	const listWarRoomConversations = async (warRoomId: number): Promise<ChatConversation[]> => {
		const res = await ChatService.listWarRoomConversations(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const body = res.data as { conversations?: ChatConversation[] };
			return body.conversations ?? [];
		}
		return [];
	};

	const startGlobalConversation = async (title = '') => {
		state.loading = true;
		state.error = null;
		state.streamingConversationId = null;
		state.streamingAssistant = null;
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
		state.streamingAssistant = { text: '', pending: '', toolUses: [] };
		state.streamingConversationId = state.currentConversation.id;
		// Prepend a one-line focus hint on the FIRST send of a
		// conversation that was started with e.g. an alert focus. The
		// LLM receives it as part of the user turn and treats the id
		// as authoritative context — the existing alert MCP tools
		// (iris_alerts_get, iris_alerts_related_get) take an
		// alert_identifier they can pull from the hint.
		let outbound = text;
		if (state.focusHint?.alertId != null) {
			outbound = `[context: focused on alert #${state.focusHint.alertId}]\n\n${text}`;
			state.focusHint = null;
		}
		_ensureSocket().send(state.currentConversation.id, outbound);
	};

	/**
	 * "Type and go" — the analyst types their first message before
	 * clicking any "New chat" button. Auto-create a conversation
	 * scoped appropriately, then send the message. Returns true on
	 * success so the caller (composer) can clear its input.
	 */
	const sendOrStart = async (
		text: string,
		scope: {
			caseId?: number | null;
			warRoomId?: number | null;
			alertId?: number | null;
		} = {}
	): Promise<boolean> => {
		if (!text.trim()) return false;
		if (!state.currentConversation) {
			let convId: number | null = null;
			if (scope.warRoomId != null) {
				convId = await startWarRoomConversation(scope.warRoomId);
			} else if (scope.caseId != null) {
				convId = await startCaseConversation(scope.caseId);
			} else {
				convId = await startGlobalConversation();
			}
			if (convId == null || !state.currentConversation) return false;
			if (scope.alertId != null) {
				state.focusHint = { alertId: scope.alertId };
			}
		}
		send(text);
		return true;
	};

	/**
	 * Explicit scope-picker entrypoint. Analyst chose a scope in the
	 * WelcomeFrame / header chip; start a fresh conversation and set
	 * any focus hint. Returns the new conversation id.
	 */
	const startWithScope = async (choice: {
		kind:
			| 'global'
			| 'currentCase'
			| 'currentWarRoom'
			| 'currentAlert'
			| 'pickCase'
			| 'pickWarRoom';
		caseId?: number;
		warRoomId?: number;
		alertId?: number;
	}): Promise<number | null> => {
		let convId: number | null = null;
		switch (choice.kind) {
			case 'currentCase':
			case 'pickCase': {
				const id = choice.caseId;
				if (id == null) return null;
				convId = await startCaseConversation(id);
				break;
			}
			case 'currentWarRoom':
			case 'pickWarRoom': {
				const id = choice.warRoomId;
				if (id == null) return null;
				convId = await startWarRoomConversation(id);
				break;
			}
			case 'currentAlert': {
				// Alerts don't have their own conversation scope column
				// — start a global conversation and set a focus hint so
				// the first send() prepends the alert id as user context.
				convId = await startGlobalConversation();
				if (convId != null && choice.alertId != null) {
					state.focusHint = { alertId: choice.alertId };
				}
				break;
			}
			case 'global':
			default:
				convId = await startGlobalConversation();
				break;
		}
		return convId;
	};

	const approveTool = (pendingToolCallId: number) => {
		if (!state.currentConversation) return;
		state.streamingAssistant = { text: '', pending: '', toolUses: [] };
		state.streamingConversationId = state.currentConversation.id;
		_ensureSocket().approveTool(pendingToolCallId, state.currentConversation.id);
	};

	const denyTool = (pendingToolCallId: number) => {
		if (!state.currentConversation) return;
		state.streamingAssistant = { text: '', pending: '', toolUses: [] };
		state.streamingConversationId = state.currentConversation.id;
		_ensureSocket().denyTool(pendingToolCallId, state.currentConversation.id);
	};

	/** Deny every currently-pending tool call in one click. Useful when
	 *  the model gets stuck in a retry loop after a validation error and
	 *  the analyst wants to bail out without approving nothing individually.
	 *  Emits one deny per pending row; the loop re-runs after each, but
	 *  since every row denies, the model will eventually stop retrying. */
	const denyAllPending = () => {
		if (!state.currentConversation) return;
		const snapshot = [...state.pendingToolCalls];
		for (const pending of snapshot) {
			_ensureSocket().denyTool(pending.id, state.currentConversation.id);
		}
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
		startWarRoomConversation,
		startGlobalConversation,
		listCaseConversations,
		listWarRoomConversations,
		listGlobalConversations,
		renameConversation,
		archiveConversation,
		send,
		sendOrStart,
		startWithScope,
		approveTool,
		denyTool,
		denyAllPending,
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
