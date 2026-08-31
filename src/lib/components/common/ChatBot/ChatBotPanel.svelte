<!--
  Global chatbot panel — mounted at the (app) layout so open/closed
  state and the current conversation survive navigation.

  Renders as a floating draggable + resizable window (not a side sheet)
  so the analyst can still see and interact with the underlying case
  while the assistant is open. Position + size persist in localStorage
  across sessions. The window is anchored to the viewport (position:
  fixed), constrained inside the viewport when dragged, and can be
  minimized to a small pill that keeps the conversation state alive.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		SparklesIcon,
		HistoryIcon,
		MinusIcon,
		PlusIcon,
		XIcon,
		PencilIcon,
		ShieldCheckIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { CHAT_PANEL_CTX, type ChatPanelContext } from '$lib/contexts/chat-panel.context.svelte';
	import ChatMessage from './components/ChatMessage.svelte';
	import ChatComposer from './components/ChatComposer.svelte';
	import ChatUsageBar from './components/ChatUsageBar.svelte';
	import PendingToolApproval from './components/PendingToolApproval.svelte';
	import ToolCallCard from './components/ToolCallCard.svelte';
	import ConversationHistory from './components/ConversationHistory.svelte';
	import ThinkingShimmer from './components/ThinkingShimmer.svelte';
	import WelcomeFrame from './components/WelcomeFrame.svelte';
	import ScopePicker from './components/ScopePicker.svelte';
	import type { ChatScopeChoice } from './components/scope-picker-types';

	const chat = getContext<ChatPanelContext>(CHAT_PANEL_CTX);

	const currentCaseId = $derived.by<number | null>(() => {
		const raw = page.params?.case_id ?? null;
		if (!raw) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});

	const currentWarRoomId = $derived.by<number | null>(() => {
		const raw = page.params?.war_room_id ?? null;
		if (!raw) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});

	// Alert scope. Alerts don't have their own conversation FK — they
	// piggyback on global conversations via a `focusHint` prepended to
	// the first user message. See chat-panel.context for the hint.
	const currentAlertId = $derived.by<number | null>(() => {
		const raw = page.params?.alert_id ?? null;
		if (!raw) return null;
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	});

	const streaming = $derived(chat.state.streamingConversationId != null);
	const disabled = $derived(streaming || chat.state.pendingToolCalls.length > 0);

	// True in the initial-latency window: the user just sent and the
	// stream is running but no text has arrived yet. Also true between
	// a tool_result and the next TextDelta (model reasoning on the
	// tool output). Drives the shimmer bar.
	const thinking = $derived(
		streaming && (!chat.state.streamingAssistant || chat.state.streamingAssistant.text.length === 0)
	);

	async function newHere() {
		showHistory = false;
		showHeaderScopePicker = false;
		if (currentWarRoomId != null) {
			await chat.startWarRoomConversation(currentWarRoomId);
		} else if (currentCaseId != null) {
			await chat.startCaseConversation(currentCaseId);
		} else if (currentAlertId != null) {
			// Alerts: global conversation + focus hint set via
			// startWithScope so the first send prepends the alert id.
			await chat.startWithScope({ kind: 'currentAlert', alertId: currentAlertId });
		} else {
			await chat.startGlobalConversation();
		}
	}

	// Header-chip scope picker: opens inline in the header to fork a
	// NEW chat with a different scope than the currently active one.
	let showHeaderScopePicker = $state(false);

	async function onScopePicked(choice: ChatScopeChoice) {
		showHistory = false;
		showHeaderScopePicker = false;
		const materialized: Parameters<typeof chat.startWithScope>[0] = { kind: choice.kind };
		if (choice.kind === 'currentCase' && currentCaseId != null) {
			materialized.caseId = currentCaseId;
		} else if (choice.kind === 'currentWarRoom' && currentWarRoomId != null) {
			materialized.warRoomId = currentWarRoomId;
		} else if (choice.kind === 'currentAlert' && currentAlertId != null) {
			materialized.alertId = currentAlertId;
		} else if (choice.kind === 'pickCase') {
			materialized.caseId = choice.caseId;
		} else if (choice.kind === 'pickWarRoom') {
			materialized.warRoomId = choice.warRoomId;
		}
		await chat.startWithScope(materialized);
	}

	// Label for the header chip that describes the CURRENT conversation's
	// scope (case #N / war-room #N / global). Read-only — analyst clicks
	// the chip to fork a NEW chat at a different scope; the existing
	// conversation's scope is immutable.
	const currentConversationScope = $derived.by<string>(() => {
		const conv = chat.state.currentConversation;
		if (!conv) return '';
		if (conv.war_room_id != null) return `war-room #${conv.war_room_id}`;
		if (conv.case_id != null) return `case #${conv.case_id}`;
		return 'global';
	});

	// ---------- Enforced chatbot policy ----------
	// The backend stamps the resolved policy on the conversation at
	// creation and returns a trimmed summary of it on every payload.
	// Null = the thread runs on the global chatbot settings, and the
	// banner stays hidden — no banner is the "nothing special applies"
	// signal, so it only ever appears when something really is enforced.
	const policy = $derived(chat.state.currentConversation?.policy ?? null);

	/** The parts of the policy an analyst can act on, in plain words.
	 *  Restriction level and provider names aren't in here: what matters
	 *  mid-conversation is where the data goes, what gets scrubbed, and
	 *  how long the transcript lives. */
	const policyNotes = $derived.by<string[]>(() => {
		if (!policy) return [];
		const notes: string[] = [];
		if (policy.restriction_level >= 100) notes.push('local model only');
		else if (policy.model) notes.push(policy.model);
		const redacted = [
			policy.redact_ips ? 'IPs' : null,
			policy.redact_emails ? 'emails' : null,
			policy.redact_hashes ? 'hashes' : null
		].filter(Boolean);
		if (redacted.length) notes.push(`${redacted.join(', ')} redacted`);
		if (policy.retention_days > 0) notes.push(`kept ${policy.retention_days}d`);
		return notes;
	});

	let showHistory = $state(false);

	// Inline rename of the CURRENT conversation from the header — the
	// history dropdown handles renaming from the list. Two entry points
	// because the current one is what the analyst usually wants to name
	// after the model earns a coherent identity for the thread.
	let renamingCurrent = $state(false);
	let currentTitleDraft = $state('');
	function beginRenameCurrent() {
		if (!chat.state.currentConversation) return;
		currentTitleDraft = chat.state.currentConversation.title || '';
		renamingCurrent = true;
	}
	async function commitRenameCurrent() {
		if (!chat.state.currentConversation) return;

		const renamed = await chat.renameConversation(
			chat.state.currentConversation.id,
			currentTitleDraft
		);

		if (!renamed) {
			toast({ title: 'Failed to rename conversation', variant: 'destructive' });
			return;
		}

		renamingCurrent = false;
	}
	function cancelRenameCurrent() {
		renamingCurrent = false;
	}

	// ---------- Floating-window geometry ----------
	// Persisted across sessions so the analyst's chosen layout survives
	// a browser refresh. Stored as one JSON blob keyed on `iris_chat_win`.

	const STORAGE_KEY = 'iris_chat_win';
	const MIN_W = 320;
	const MIN_H = 320;
	const DEFAULT_W = 420;
	const DEFAULT_H = 560;

	interface WinState {
		x: number;
		y: number;
		w: number;
		h: number;
		minimized: boolean;
	}

	function loadWinState(): WinState {
		if (typeof localStorage === 'undefined') {
			return { x: 0, y: 0, w: DEFAULT_W, h: DEFAULT_H, minimized: false };
		}
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as Partial<WinState>;
				return {
					x: Number.isFinite(parsed.x) ? Number(parsed.x) : -1,
					y: Number.isFinite(parsed.y) ? Number(parsed.y) : -1,
					w: Number.isFinite(parsed.w) ? Math.max(MIN_W, Number(parsed.w)) : DEFAULT_W,
					h: Number.isFinite(parsed.h) ? Math.max(MIN_H, Number(parsed.h)) : DEFAULT_H,
					minimized: Boolean(parsed.minimized)
				};
			}
		} catch {
			// Fall through to defaults.
		}
		return { x: -1, y: -1, w: DEFAULT_W, h: DEFAULT_H, minimized: false };
	}

	let win = $state<WinState>(loadWinState());

	function saveWinState() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(win));
		} catch {
			// Quota / private-mode — non-fatal.
		}
	}

	// First-time placement: bottom-right with 16px gutter. Runs once on
	// mount and any time the window size drifts out of the viewport
	// (e.g. desktop resized between sessions).
	function clampToViewport() {
		if (typeof window === 'undefined') return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		if (win.w > vw - 32) win.w = Math.max(MIN_W, vw - 32);
		if (win.h > vh - 32) win.h = Math.max(MIN_H, vh - 32);
		if (win.x < 0 || win.x + win.w > vw) win.x = Math.max(16, vw - win.w - 16);
		if (win.y < 0 || win.y + win.h > vh) win.y = Math.max(16, vh - win.h - 16);
	}

	onMount(() => {
		clampToViewport();
		saveWinState();
		const onResize = () => {
			clampToViewport();
			saveWinState();
		};
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	// ---------- Drag ----------
	let dragging = false;
	let dragOffX = 0;
	let dragOffY = 0;

	function onHeaderPointerDown(e: PointerEvent) {
		// Only left-button drags; ignore clicks on buttons inside header.
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;
		dragging = true;
		dragOffX = e.clientX - win.x;
		dragOffY = e.clientY - win.y;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onHeaderPointerMove(e: PointerEvent) {
		if (!dragging) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const nx = Math.min(Math.max(0, e.clientX - dragOffX), vw - win.w);
		const ny = Math.min(Math.max(0, e.clientY - dragOffY), vh - win.h);
		win.x = nx;
		win.y = ny;
	}

	function onHeaderPointerUp(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		saveWinState();
	}

	// ---------- Resize (bottom-right corner grip) ----------
	let resizing = false;
	let resizeStartW = 0;
	let resizeStartH = 0;
	let resizeStartX = 0;
	let resizeStartY = 0;

	function onResizePointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		resizeStartW = win.w;
		resizeStartH = win.h;
		resizeStartX = e.clientX;
		resizeStartY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onResizePointerMove(e: PointerEvent) {
		if (!resizing) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const dx = e.clientX - resizeStartX;
		const dy = e.clientY - resizeStartY;
		win.w = Math.min(Math.max(MIN_W, resizeStartW + dx), vw - win.x - 8);
		win.h = Math.min(Math.max(MIN_H, resizeStartH + dy), vh - win.y - 8);
	}

	function onResizePointerUp(e: PointerEvent) {
		if (!resizing) return;
		resizing = false;
		(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		saveWinState();
	}

	function toggleMinimize() {
		win.minimized = !win.minimized;
		saveWinState();
	}
</script>

{#if chat.state.open}
	{#if win.minimized}
		<!--
		  Minimized pill — a small non-modal tab pinned near the window's
		  saved position so it's easy to find. Click to restore. The
		  underlying conversation state is untouched.
		-->
		<button
			type="button"
			onclick={toggleMinimize}
			class="fixed z-50 flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-xs font-medium shadow-lg transition-colors hover:bg-muted"
			style="left: {win.x}px; top: {Math.min(
				win.y,
				(typeof window !== 'undefined' ? window.innerHeight : 0) - 48
			)}px;"
		>
			<SparklesIcon size={14} />
			Yuki
			{#if chat.state.streamingAssistant}
				<span class="ml-1 size-2 animate-pulse rounded-full bg-primary" aria-label="streaming"
				></span>
			{/if}
		</button>
	{:else}
		<!--
		  Floating window. position:fixed to escape any ancestor overflow
		  and stack above the app shell (z-50). The header owns drag; the
		  corner grip owns resize. Both use pointer capture so a drag
		  that leaves the element mid-motion still receives up events.
		-->
		<div
			class="fixed z-50 flex flex-col overflow-hidden rounded-lg border bg-background shadow-2xl"
			style="left: {win.x}px; top: {win.y}px; width: {win.w}px; height: {win.h}px;"
			role="dialog"
			aria-label="Yuki"
		>
			<!-- Drag handle / header. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="flex shrink-0 cursor-move select-none items-center gap-2 border-b bg-muted/40 px-3 py-2"
				onpointerdown={onHeaderPointerDown}
				onpointermove={onHeaderPointerMove}
				onpointerup={onHeaderPointerUp}
				onpointercancel={onHeaderPointerUp}
			>
				<SparklesIcon size={14} class="text-primary" />
				<!-- Conversation title / inline rename. If no conversation
				     yet, show the product name. onpointerdown stopped so a
				     click on the title doesn't initiate a header drag. -->
				{#if chat.state.currentConversation && renamingCurrent}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						type="text"
						class="min-w-0 flex-1 rounded border bg-background px-1 py-0.5 text-xs"
						bind:value={currentTitleDraft}
						onpointerdown={(e) => e.stopPropagation()}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								void commitRenameCurrent();
							} else if (e.key === 'Escape') {
								e.preventDefault();
								cancelRenameCurrent();
							}
						}}
						onblur={commitRenameCurrent}
						autofocus
					/>
				{:else if chat.state.currentConversation}
					<button
						type="button"
						class="min-w-0 flex-1 truncate text-left text-xs font-semibold hover:underline"
						title="Click to rename"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={beginRenameCurrent}
					>
						{chat.state.currentConversation.title?.trim() ||
							`Untitled #${chat.state.currentConversation.id}`}
					</button>
				{:else}
					<span class="text-xs font-semibold">Yuki</span>
				{/if}
				{#if chat.state.currentConversation?.model}
					<span class="hidden text-2xs font-normal text-muted-foreground sm:inline">
						{chat.state.currentConversation.model}
					</span>
				{/if}
				<div class="ml-auto flex items-center gap-1">
					<button
						type="button"
						class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						title="History"
						aria-label="History"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={() => (showHistory = !showHistory)}
					>
						<HistoryIcon size={14} />
					</button>
					{#if chat.state.currentConversation && !renamingCurrent}
						<button
							type="button"
							class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							title="Rename"
							aria-label="Rename"
							onpointerdown={(e) => e.stopPropagation()}
							onclick={beginRenameCurrent}
						>
							<PencilIcon size={14} />
						</button>
					{/if}
					<button
						type="button"
						class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						title="Minimize"
						aria-label="Minimize"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={toggleMinimize}
					>
						<MinusIcon size={14} />
					</button>
					<button
						type="button"
						class="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						title="Close"
						aria-label="Close"
						onpointerdown={(e) => e.stopPropagation()}
						onclick={() => chat.closePanel()}
					>
						<XIcon size={14} />
					</button>
				</div>
			</div>

			<!-- Toolbar: new-chat button + scope chip. -->
			<div class="flex shrink-0 flex-col gap-2 border-b px-3 py-2">
				<div class="flex items-center gap-2">
					<Button size="sm" variant="outline" class="h-7" onclick={newHere}>
						<PlusIcon size={12} class="mr-1" />
						New chat {currentWarRoomId != null
							? `in war-room #${currentWarRoomId}`
							: currentCaseId != null
								? `on case #${currentCaseId}`
								: currentAlertId != null
									? `on alert #${currentAlertId}`
									: ''}
					</Button>
					<!-- Scope chip: shows the current conversation's scope
					     (case/war-room/global) OR the route's scope if no
					     conversation yet. Clicking opens an inline scope
					     picker that starts a NEW chat at the chosen scope
					     — the existing conversation is immutable. -->
					<button
						type="button"
						class="ml-auto flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground"
						title="Change scope for next new chat"
						onclick={() => (showHeaderScopePicker = !showHeaderScopePicker)}
					>
						Scope: {chat.state.currentConversation
							? currentConversationScope
							: currentWarRoomId != null
								? `war-room #${currentWarRoomId}`
								: currentCaseId != null
									? `case #${currentCaseId}`
									: currentAlertId != null
										? `alert #${currentAlertId}`
										: 'global'}
					</button>
				</div>
				{#if showHeaderScopePicker}
					<ScopePicker {currentCaseId} {currentWarRoomId} {currentAlertId} onPick={onScopePicked} />
				{/if}
			</div>

			<!-- Policy banner: only rendered when a chatbot policy is
			     actually enforced on this conversation, so its presence
			     alone is the signal. One line, no dismiss — it describes
			     a constraint the analyst can't opt out of. -->
			{#if policy}
				<div
					class="flex shrink-0 items-start gap-1.5 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-2xs text-amber-700 dark:text-amber-400"
					title={policy.description || undefined}
				>
					<ShieldCheckIcon size={12} class="mt-0.5 shrink-0" />
					<span class="min-w-0">
						Policy <span class="font-medium">{policy.name}</span> is enforced on this conversation{#if policyNotes.length}
							— {policyNotes.join(' · ')}{/if}
					</span>
				</div>
			{/if}

			<!-- Scrollable message thread. min-h-0 so flex lets it shrink
			     below intrinsic content height and the overflow-y-auto
			     activates. `relative` anchors the ConversationHistory
			     overlay to this container. -->
			<div class="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
				{#if showHistory}
					<ConversationHistory
						{chat}
						{currentCaseId}
						{currentWarRoomId}
						onClose={() => (showHistory = false)}
					/>
				{/if}
				{#if chat.state.loading}
					<Skeleton class="h-12 w-full" />
					<Skeleton class="h-16 w-full" />
				{:else if !chat.state.currentConversation}
					<WelcomeFrame
						{chat}
						{currentCaseId}
						{currentWarRoomId}
						{currentAlertId}
						onStart={newHere}
						onPickScope={onScopePicked}
					/>
				{:else}
					{#each chat.state.messages as message (message.id)}
						<ChatMessage {message} />
					{/each}

					{#if chat.state.streamingAssistant && (chat.state.streamingAssistant.text.length > 0 || chat.state.streamingAssistant.toolUses.length > 0)}
						<!-- Real content has started arriving — show the
						     bubble with the dripped text + any tool cards. -->
						<div class="flex gap-2 text-xs">
							<div
								class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
							>
								<SparklesIcon size={12} />
							</div>
							<div class="max-w-[80%] rounded-md bg-muted px-3 py-2">
								<!--
								  Streaming bubble: show whatever's been dripped
								  into `.text` so far. Rendered as plain text
								  with `whitespace-pre-wrap` during the stream —
								  MarkDownPreview replaces this once the message
								  lands in `state.messages` (rendering markdown
								  mid-stream produces half-parsed tables/lists).
								-->
								<p class="whitespace-pre-wrap">{chat.state.streamingAssistant.text}</p>
								{#if chat.state.streamingAssistant.toolUses.length > 0}
									<div class="mt-2 flex flex-col gap-1">
										{#each chat.state.streamingAssistant.toolUses as tu (tu.tool_use_id)}
											<ToolCallCard
												toolUseId={tu.tool_use_id}
												toolName={tu.tool_name}
												argsData={tu.arguments}
												result={tu.result}
												error={tu.error}
											/>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{:else if thinking}
						<!-- Latency window: stream started but nothing has
						     arrived yet, or model reasoning after a
						     tool_result. Show the shimmer instead of an
						     empty bubble. -->
						<ThinkingShimmer />
					{/if}

					{#if chat.state.pendingToolCalls.length > 1}
						<!-- Batch escape hatch: when the model proposes many
						     writes at once (or is stuck in a retry loop
						     after a tool error), denying them one by one
						     is tedious. This drops the whole batch in one
						     click; the loop re-runs after each deny but
						     converges quickly since everything denies. -->
						<div class="flex justify-end">
							<button
								type="button"
								class="text-2xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
								onclick={() => chat.denyAllPending()}
							>
								Deny all ({chat.state.pendingToolCalls.length})
							</button>
						</div>
					{/if}
					{#each chat.state.pendingToolCalls as pending (pending.id)}
						<PendingToolApproval {pending} onApprove={chat.approveTool} onDeny={chat.denyTool} />
					{/each}

					{#if chat.state.error}
						<p class="text-2xs text-destructive">{chat.state.error}</p>
					{/if}
				{/if}
			</div>

			<ChatComposer
				{disabled}
				onSend={(text) =>
					chat.sendOrStart(text, {
						caseId: currentCaseId,
						warRoomId: currentWarRoomId,
						alertId: currentAlertId
					})}
			/>

			<!-- Slim token/context indicator strip. Self-hides when the
			     conversation has no egress rows yet (turn_count === 0)
			     so the empty welcome state stays uncluttered. -->
			<ChatUsageBar usage={chat.state.usage} />

			<!--
			  Corner resize grip. 14×14 tab in the bottom-right that owns
			  its own pointer capture so a drag that leaves the tab still
			  gets the up event. Visually a subtle diagonal-stripe hint.
			-->
			<div
				class="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
				style="background-image: linear-gradient(135deg, transparent 50%, hsl(var(--muted-foreground) / 0.4) 50%, hsl(var(--muted-foreground) / 0.4) 60%, transparent 60%, transparent 70%, hsl(var(--muted-foreground) / 0.4) 70%, hsl(var(--muted-foreground) / 0.4) 80%, transparent 80%);"
				role="separator"
				aria-label="Resize"
				onpointerdown={onResizePointerDown}
				onpointermove={onResizePointerMove}
				onpointerup={onResizePointerUp}
				onpointercancel={onResizePointerUp}
			></div>
		</div>
	{/if}
{/if}
