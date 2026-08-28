<!--
  Side-pane for a single thread.

  Slack-style: opens to the right of the main stream when the operator
  clicks a thread chip or "Reply in thread". Renders the root message
  at the top, then a stream of replies underneath, with a composer at
  the bottom. The composer reuses the same Enter/Shift+Enter contract
  as the main composer.

  The pane is responsible for its own data (replies fetch, post,
  follow toggle, retitle). It receives the root id + initial root row
  from the parent so it can render immediately without an extra fetch.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import {
		AlertCircle,
		AlertOctagon,
		Bell,
		BellOff,
		Gavel,
		Loader2,
		Paperclip,
		Pencil,
		Pin,
		Search,
		Send,
		Trash2,
		X,
		Check
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { current_user } from '$lib/stores/auth.store';
	import {
		WarRoomChatService,
		type ChatMessage,
		type ChatMessageKind,
		type ChatThreadRoot
	} from '$lib/services/war-room-chat.service';
	import type { WarRoomCaseAttachment } from '$lib/services/war-rooms.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';
	import ChatMessageBody from './ChatMessageBody.svelte';
	import ChatMessageEditor from './ChatMessageEditor.svelte';
	import ChatMessageAttachments from './ChatMessageAttachments.svelte';
	import ChatComposerMentions from './ChatComposerMentions.svelte';

	interface Props {
		warRoomId: number;
		root: ChatThreadRoot;
		/**
		 * Cases attached to the war room, propagated from the parent so the
		 * reply composer can offer the same attachments picker (events /
		 * IOCs / assets / tasks) as the main chat composer.
		 */
		attachedCases: WarRoomCaseAttachment[];
		/**
		 * Passed to <ChatMessageBody> on each rendered reply so clicking a
		 * `[Event "…"](/case/…)` chip pops the same preview dialog the main
		 * stream uses instead of hard-navigating away from the war room.
		 */
		onAttachmentClick: (t: {
			type: 'event' | 'ioc' | 'asset' | 'task';
			label: string;
			href: string;
		}) => void;
		onClose: () => void;
		onChanged: () => void;
	}

	const { warRoomId, root, attachedCases, onAttachmentClick, onClose, onChanged }: Props = $props();

	let replies = $state<ChatMessage[]>([]);
	// `loading` is true only for the *initial* fetch of a thread — a
	// blank-and-spinner state is fine there. Background refetches (poll
	// pulled a new reply, or the operator sent one) reuse the existing
	// list and merge new rows in without flipping this flag, so the pane
	// doesn't visibly refresh every 4 seconds.
	let loading = $state(true);
	let body = $state('');
	let sending = $state(false);
	let composerEl: HTMLTextAreaElement | null = $state(null);
	let listEl: HTMLDivElement | null = $state(null);

	let editingTitle = $state(false);
	let titleDraft = $state('');
	let titleSaving = $state(false);

	let followed = $state(false);
	let following = $state(false);

	// Sync local mirrors from props whenever the operator switches
	// threads. Capturing these as `$state(root.x)` at component creation
	// would lock them to the initial root — and the parent reuses this
	// component instance when openThread changes.
	$effect(() => {
		titleDraft = root.thread_title ?? '';
		followed = root.is_followed;
	});

	const scrollToBottom = async () => {
		await tick();
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	};

	// Full replace — used only for the initial fetch, or when the
	// operator switches to a different thread.
	const loadInitial = async () => {
		loading = true;
		replies = [];
		const res = await WarRoomChatService.listReplies(warRoomId, root.message_id);
		if (res.ok && Array.isArray(res.data)) {
			replies = res.data as ChatMessage[];
		}
		loading = false;
		void scrollToBottom();
	};

	// Background merge — silent. Keeps existing rows in place and just
	// appends anything new so the list doesn't flash blank. Preserves
	// scroll position unless the operator was already at the bottom, in
	// which case we follow the newest reply down.
	const refetchSilently = async () => {
		const rootId = root.message_id;
		const res = await WarRoomChatService.listReplies(warRoomId, rootId);
		// Root may have changed while the request was in flight.
		if (rootId !== root.message_id) return;
		if (!res.ok || !Array.isArray(res.data)) return;
		const incoming = res.data as ChatMessage[];
		const seen = new Set(replies.map((r) => r.message_id));
		const fresh = incoming.filter((r) => !seen.has(r.message_id));
		const wasAtBottom =
			listEl != null && listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
		// In-place patch for rows we already have (edits/soft-deletes),
		// then append the new tail. A row the operator is actively
		// editing is left alone — swapping the body under the open
		// editor would silently rebase their draft.
		const byId = new Map(incoming.map((r) => [r.message_id, r]));
		replies = replies
			.map((r) => (r.message_id === editingReplyId ? r : (byId.get(r.message_id) ?? r)))
			.concat(fresh);
		if (fresh.length > 0 && wasAtBottom) void scrollToBottom();
	};

	// Two effects with different keys — critical for the no-flicker
	// behaviour. Switching threads (message_id changes) does a full
	// reload; a poll landing new activity on the *same* thread only
	// triggers a silent merge.
	let lastRootId: number | null = null;
	$effect(() => {
		if (root.message_id !== lastRootId) {
			lastRootId = root.message_id;
			void loadInitial();
		}
	});

	$effect(() => {
		// Runs on same-thread updates (reply_count, last_activity_at). The
		// message_id check keeps this from double-firing alongside the
		// initial load above.
		// These bare expressions read reactive state to register $effect
		// dependencies without using the values — the standard Svelte idiom.
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		root.last_activity_at;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		root.reply_count;
		if (root.message_id === lastRootId && !loading) {
			void refetchSilently();
		}
	});

	const currentUserId = $derived(
		($current_user?.user_id ?? $current_user?.id ?? null) as number | null
	);

	// Confirm dialog state (parity with the sitreps page pattern) — a
	// single ConfirmationDialog handles the "delete reply" prompt so we
	// don't fall back to window.confirm.
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let pendingDeleteId: number | null = null;

	const requestDelete = (r: ChatMessage) => {
		pendingDeleteId = r.message_id;
		confirmTitle = 'Delete this reply?';
		confirmMessage = "It will be hidden from the thread. This can't be undone.";
		confirmOpen = true;
	};

	const runDelete = async () => {
		const id = pendingDeleteId;
		pendingDeleteId = null;
		if (id == null) return;
		const res = await WarRoomChatService.remove(warRoomId, id);
		if (res.ok) {
			// Drop locally; the next reply-count refresh comes via the
			// parent's poll on the next tick.
			replies = replies.filter((x) => x.message_id !== id);
			onChanged();
		} else {
			toast({ title: 'Could not delete reply', variant: 'destructive' });
		}
	};

	// --- Inline reply editing ---------------------------------------
	//
	// Mirrors the main stream: authors may revise their own plain
	// replies, and the server's PATCH handler is the actual gate (it
	// rejects non-authors, system kinds and soft-deleted rows). The
	// predicate below only decides whether to render the affordance.
	let editingReplyId = $state<number | null>(null);
	let editSaving = $state(false);

	const canEditReply = (r: ChatMessage) =>
		currentUserId != null && r.author_id === currentUserId && r.kind === 'message' && !r.deleted_at;

	const cancelEdit = () => {
		editingReplyId = null;
		editSaving = false;
	};

	const saveEdit = async (messageId: number, nextBody: string) => {
		editSaving = true;
		const res = await WarRoomChatService.edit(warRoomId, messageId, nextBody);
		editSaving = false;
		if (!res.ok) {
			toast({ title: 'Could not edit reply', variant: 'destructive' });
			return;
		}
		// Patch locally so the new body and the "(edited)" tag land
		// straight away rather than on the next silent refetch.
		const stamp = new Date().toISOString();
		replies = replies.map((r) =>
			r.message_id === messageId ? { ...r, body: nextBody, edited_at: stamp } : r
		);
		cancelEdit();
	};

	const send = async () => {
		const text = body.trim();
		if (!text) return;
		sending = true;
		const res = await WarRoomChatService.reply(warRoomId, root.message_id, text);
		sending = false;
		if (res.ok) {
			body = '';
			// Merge the new reply in without blanking the pane; the parent
			// poll will refresh reply_count on its own cadence.
			await refetchSilently();
			onChanged();
			composerEl?.focus();
		} else {
			toast({ title: 'Could not post reply', variant: 'destructive' });
		}
	};

	// Mentions autocomplete — same component the main composer uses. The
	// popup owns Up/Down/Enter/Esc when open; we only handle Enter-sends
	// when it hasn't claimed the key.
	let mentions = $state<{
		handleKeydown: (e: KeyboardEvent) => boolean;
		handleInput: () => void;
	} | null>(null);

	const onKey = (e: KeyboardEvent) => {
		if (mentions?.handleKeydown(e)) return;
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void send();
		}
	};

	const onInput = (e: Event) => {
		body = (e.target as HTMLTextAreaElement).value;
		mentions?.handleInput();
	};

	// ---- Attachments picker (mirrors the main composer) ----------------

	type ResourceKind = 'event' | 'ioc' | 'asset' | 'task';

	let attachOpen = $state(false);
	let attachKind = $state<ResourceKind>('event');
	let attachCaseId = $state<number | null>(null);
	let attachSearch = $state('');
	let attachLoading = $state(false);

	type Picker = { id: number; label: string; sub?: string; caseId: number };
	let pickerRows = $state<Picker[]>([]);

	$effect(() => {
		if (attachOpen && attachCaseId == null && attachedCases.length > 0) {
			attachCaseId = attachedCases[0].case_id;
		}
	});

	$effect(() => {
		if (!attachOpen || attachCaseId == null) return;
		void loadPickerRows();
	});

	const loadPickerRows = async () => {
		if (attachCaseId == null) return;
		attachLoading = true;
		pickerRows = [];
		const caseId = attachCaseId;
		try {
			if (attachKind === 'event') {
				const res = await CaseTimelineService.listEvents(caseId, {}, {}, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as { timeline?: Array<Record<string, unknown>> };
					pickerRows = (payload.timeline ?? []).map((e) => ({
						id: Number((e as { event_id: number }).event_id),
						label:
							String((e as { event_title?: string }).event_title ?? '') ||
							`Event #${(e as { event_id: number }).event_id}`,
						sub:
							typeof (e as { event_date?: string }).event_date === 'string'
								? new Date((e as { event_date: string }).event_date).toLocaleString()
								: undefined,
						caseId
					}));
				}
			} else if (attachKind === 'ioc') {
				const res = await CaseIocsService.list(caseId, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: Array<Record<string, unknown>> };
					pickerRows = (payload.data ?? []).map((i) => ({
						id: Number((i as { ioc_id: number }).ioc_id),
						label:
							String((i as { ioc_value?: string }).ioc_value ?? '') ||
							`IOC #${(i as { ioc_id: number }).ioc_id}`,
						sub: String((i as { ioc_type?: string }).ioc_type ?? ''),
						caseId
					}));
				}
			} else if (attachKind === 'asset') {
				const res = await CaseAssetsService.list(caseId, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: Array<Record<string, unknown>> };
					pickerRows = (payload.data ?? []).map((a) => ({
						id: Number((a as { asset_id: number }).asset_id),
						label:
							String((a as { asset_name?: string }).asset_name ?? '') ||
							`Asset #${(a as { asset_id: number }).asset_id}`,
						sub: String((a as { asset_type_name?: string }).asset_type_name ?? ''),
						caseId
					}));
				}
			} else if (attachKind === 'task') {
				const res = await CaseTasksService.list(caseId, { per_page: 25 });
				if (res.ok && res.data && typeof res.data !== 'string') {
					const payload = res.data as unknown as { data?: Array<Record<string, unknown>> };
					pickerRows = (payload.data ?? []).map((t) => ({
						id: Number((t as { id: number }).id ?? (t as { task_id?: number }).task_id ?? 0),
						label:
							String((t as { task_title?: string }).task_title ?? '') ||
							`Task #${(t as { id: number }).id}`,
						caseId
					}));
				}
			}
		} finally {
			attachLoading = false;
		}
	};

	const filteredPickerRows = $derived.by(() => {
		const needle = attachSearch.trim().toLowerCase();
		if (!needle) return pickerRows;
		return pickerRows.filter(
			(r) => r.label.toLowerCase().includes(needle) || (r.sub ?? '').toLowerCase().includes(needle)
		);
	});

	const insertAttachment = (row: Picker) => {
		const link =
			attachKind === 'event'
				? `[Event "${row.label}"](/case/${row.caseId}/timeline)`
				: attachKind === 'ioc'
					? `[IOC "${row.label}"](/case/${row.caseId}/iocs)`
					: attachKind === 'asset'
						? `[Asset "${row.label}"](/case/${row.caseId}/assets)`
						: `[Task "${row.label}"](/case/${row.caseId}/tasks)`;
		body = body ? `${body} ${link}` : link;
		attachOpen = false;
		attachSearch = '';
		composerEl?.focus();
	};

	const startEditTitle = () => {
		titleDraft = root.thread_title ?? '';
		editingTitle = true;
	};

	const saveTitle = async () => {
		titleSaving = true;
		const next = titleDraft.trim() || null;
		const res = await WarRoomChatService.setThreadTitle(warRoomId, root.message_id, next);
		titleSaving = false;
		if (res.ok) {
			// Patch up the parent's view through onChanged — the root row
			// owns the title display in the sidebar, so a refresh there
			// is what makes the rename visible everywhere.
			editingTitle = false;
			onChanged();
		} else {
			toast({ title: 'Could not rename thread', variant: 'destructive' });
		}
	};

	const toggleFollow = async () => {
		following = true;
		const res = followed
			? await WarRoomChatService.unfollowThread(warRoomId, root.message_id)
			: await WarRoomChatService.followThread(warRoomId, root.message_id);
		following = false;
		if (res.ok) {
			followed = !followed;
			onChanged();
		} else {
			toast({ title: 'Could not update follow state', variant: 'destructive' });
		}
	};

	const fmtTime = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString(undefined, {
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	};

	// Kind → icon / color, kept in sync with the main stream so a
	// decision reply looks the same in the thread as it does when
	// posted top-level.
	const systemIcon = (k: ChatMessageKind) => {
		switch (k) {
			case 'note':
			case 'pin':
				return Pin;
			case 'decision':
				return Gavel;
			case 'priority':
				return AlertOctagon;
			case 'system':
				return AlertCircle;
			default:
				return null;
		}
	};

	const systemColor = (k: ChatMessageKind) => {
		switch (k) {
			case 'note':
			case 'pin':
				return 'text-violet-600 dark:text-violet-400';
			case 'decision':
				return 'text-indigo-600 dark:text-indigo-400';
			case 'priority':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-muted-foreground';
		}
	};
</script>

<aside class="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-l bg-card/30">
	<!-- Header: title (editable inline), follow toggle, close. -->
	<header class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
		<div class="min-w-0 flex-1">
			{#if editingTitle}
				<div class="flex items-center gap-1">
					<Input
						value={titleDraft}
						oninput={(e) => (titleDraft = (e.target as HTMLInputElement).value)}
						placeholder="Thread title"
						class="h-7 text-xs"
					/>
					<Button
						size="icon"
						variant="ghost"
						class="h-7 w-7"
						disabled={titleSaving}
						onclick={saveTitle}
						aria-label="Save title"
					>
						<Check class="h-3.5 w-3.5" />
					</Button>
					<Button
						size="icon"
						variant="ghost"
						class="h-7 w-7"
						disabled={titleSaving}
						onclick={() => (editingTitle = false)}
						aria-label="Cancel"
					>
						<X class="h-3.5 w-3.5" />
					</Button>
				</div>
			{:else}
				<button
					type="button"
					class="group flex w-full items-center gap-1 text-left"
					onclick={startEditTitle}
					title="Click to rename"
				>
					<span class="truncate text-sm font-semibold">
						{root.thread_title ?? 'Thread'}
					</span>
					<Pencil class="hidden h-3 w-3 text-muted-foreground group-hover:inline" />
				</button>
				<p class="truncate text-2xs text-muted-foreground">
					{root.reply_count}
					{root.reply_count === 1 ? 'reply' : 'replies'}
				</p>
			{/if}
		</div>
		<Button
			size="icon"
			variant="ghost"
			class="h-7 w-7"
			disabled={following}
			onclick={toggleFollow}
			aria-label={followed ? 'Unfollow thread' : 'Follow thread'}
			title={followed ? 'Unfollow' : 'Follow'}
		>
			{#if followed}
				<Bell class="h-3.5 w-3.5 text-primary" />
			{:else}
				<BellOff class="h-3.5 w-3.5 text-muted-foreground" />
			{/if}
		</Button>
		<Button size="icon" variant="ghost" class="h-7 w-7" onclick={onClose} aria-label="Close thread">
			<X class="h-3.5 w-3.5" />
		</Button>
	</header>

	<!-- Root preview, then replies. -->
	<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
		<div class="rounded-md border bg-muted/30 px-3 py-2">
			<div class="flex items-baseline gap-2">
				<UserAvatar
					userId={root.author_id ?? undefined}
					name={root.author_name ?? root.author_login ?? 'Unknown'}
					size="size-6"
				/>
				<span class="text-xs font-semibold">
					{root.author_name ?? root.author_login ?? 'Unknown'}
				</span>
				<span class="text-2xs text-muted-foreground">{fmtTime(root.created_at)}</span>
			</div>
			{#if root.preview}
				<p class="mt-1 whitespace-pre-wrap break-words text-xs">{root.preview}</p>
			{/if}
		</div>

		<div class="my-3 flex items-center gap-2 text-2xs text-muted-foreground">
			<div class="h-px flex-1 bg-border"></div>
			<span>{root.reply_count} {root.reply_count === 1 ? 'reply' : 'replies'}</span>
			<div class="h-px flex-1 bg-border"></div>
		</div>

		{#if loading}
			<p class="text-center text-xs text-muted-foreground">Loading replies…</p>
		{:else if replies.length === 0}
			<p class="text-center text-xs text-muted-foreground">No replies yet — be the first.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each replies as r (r.message_id)}
					{@const Icon = systemIcon(r.kind)}
					{#if r.kind !== 'message' && Icon}
						<!--
						  Structured trace reply — decision / pin / note /
						  priority / system. Same visual treatment as on the
						  main stream so a decision posted inside a thread
						  reads as "a decision", not a plain chat bubble.
						-->
						<li
							class="group/reply flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-2 text-xs"
						>
							<Icon class={`mt-0.5 h-3.5 w-3.5 shrink-0 ${systemColor(r.kind)}`} />
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-baseline gap-2">
									<span class="text-2xs uppercase tracking-wider text-muted-foreground">
										{r.kind}
									</span>
									<span class="text-xs font-semibold text-foreground">
										{r.author_name ?? r.author_login ?? 'Unknown'}
									</span>
									<span class="text-2xs text-muted-foreground">{fmtTime(r.created_at)}</span>
									{#if r.edited_at}
										<span class="text-2xs italic text-muted-foreground">(edited)</span>
									{/if}
									{#if currentUserId != null && r.author_id === currentUserId}
										<button
											type="button"
											class="invisible ml-auto inline-flex items-center gap-0.5 text-2xs text-destructive hover:text-destructive/80 group-hover/reply:visible"
											onclick={() => requestDelete(r)}
											aria-label="Delete reply"
										>
											<Trash2 class="h-3 w-3" />
										</button>
									{/if}
								</div>
								<div class="mt-1 break-words text-xs">
									<ChatMessageBody
										body={r.body ?? ''}
										attachments={r.attachments}
										{warRoomId}
										{onAttachmentClick}
									/>
								</div>
							</div>
						</li>
					{:else}
						<li class="group/reply flex gap-2">
							<UserAvatar
								userId={r.author_id ?? undefined}
								name={r.author_name ?? r.author_login ?? 'Unknown'}
								size="size-7"
							/>
							<div class="min-w-0 flex-1">
								<div class="flex items-baseline gap-2">
									<span class="text-xs font-semibold">
										{r.author_name ?? r.author_login ?? 'Unknown'}
									</span>
									<span class="text-2xs text-muted-foreground">{fmtTime(r.created_at)}</span>
									{#if r.edited_at}
										<span class="text-2xs italic text-muted-foreground">(edited)</span>
									{/if}
									{#if currentUserId != null && r.author_id === currentUserId}
										<!--
										  Own-reply actions. Grouped in one `ml-auto` box so
										  the row stays right-aligned whether or not the edit
										  affordance applies (system-kind replies are
										  delete-only — the server refuses to edit them).
										-->
										<div class="ml-auto flex items-center gap-1.5">
											{#if canEditReply(r) && editingReplyId !== r.message_id}
												<button
													type="button"
													class="invisible inline-flex items-center gap-0.5 text-2xs text-muted-foreground hover:text-foreground group-hover/reply:visible"
													onclick={() => (editingReplyId = r.message_id)}
													aria-label="Edit reply"
													title="Edit"
												>
													<Pencil class="h-3 w-3" />
												</button>
											{/if}
											<button
												type="button"
												class="invisible inline-flex items-center gap-0.5 text-2xs text-destructive hover:text-destructive/80 group-hover/reply:visible"
												onclick={() => requestDelete(r)}
												aria-label="Delete reply"
												title="Delete"
											>
												<Trash2 class="h-3 w-3" />
											</button>
										</div>
									{/if}
								</div>
								<div class="mt-0.5 break-words text-xs">
									{#if editingReplyId === r.message_id}
										<ChatMessageEditor
											initial={r.body ?? ''}
											saving={editSaving}
											size="xs"
											onSave={(next) => void saveEdit(r.message_id, next)}
											onCancel={cancelEdit}
										/>
										<!--
										  Uploads stay on screen while the text is being
										  rewritten — the edit only ever touches the body.
										-->
										<ChatMessageAttachments attachments={r.attachments} {warRoomId} />
									{:else}
										<ChatMessageBody
											body={r.body ?? ''}
											attachments={r.attachments}
											{warRoomId}
											{onAttachmentClick}
										/>
									{/if}
								</div>
							</div>
						</li>
					{/if}
				{/each}
			</ul>
		{/if}
	</div>

	<!--
	  Reply composer. Same feature set as the main chat composer:
	  attachments picker (events / IOCs / assets / tasks from any
	  attached case), @mentions autocomplete, and the same
	  Enter/Shift+Enter contract.
	-->
	<form
		class="shrink-0 border-t bg-background/80 px-3 py-2"
		onsubmit={(e) => {
			e.preventDefault();
			void send();
		}}
	>
		<div
			class="flex items-end gap-2 rounded-lg border bg-card px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring"
		>
			<Popover.Root bind:open={attachOpen}>
				<Popover.Trigger
					class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Attach a case element"
				>
					<Paperclip size={13} />
				</Popover.Trigger>
				<Popover.Content side="top" align="start" class="w-80 p-0">
					{#if attachedCases.length === 0}
						<div class="p-4 text-center text-xs text-muted-foreground">
							No cases attached to this war room yet — attach one in the Cases tab.
						</div>
					{:else}
						<div class="flex items-center gap-1 border-b p-2">
							{#each [{ k: 'event', l: 'Events' }, { k: 'ioc', l: 'IOCs' }, { k: 'asset', l: 'Assets' }, { k: 'task', l: 'Tasks' }] as t}
								{@const on = attachKind === (t.k as ResourceKind)}
								<button
									type="button"
									class={[
										'flex-1 rounded-md px-2 py-1 text-2xs transition-colors',
										on
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-muted'
									]}
									onclick={() => (attachKind = t.k as ResourceKind)}
								>
									{t.l}
								</button>
							{/each}
						</div>

						<div class="border-b p-2">
							<label
								class="block text-2xs uppercase tracking-wider text-muted-foreground"
								for="thread-attach-case"
							>
								Case
							</label>
							<select
								id="thread-attach-case"
								bind:value={attachCaseId}
								class="mt-1 h-7 w-full rounded border bg-background px-2 text-xs"
							>
								{#each attachedCases as c (c.case_id)}
									<option value={c.case_id}>#{c.case_id} — {c.case_name}</option>
								{/each}
							</select>
						</div>

						<div class="border-b p-2">
							<div class="relative">
								<Search
									class="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									value={attachSearch}
									oninput={(e) => (attachSearch = (e.target as HTMLInputElement).value)}
									placeholder="Search…"
									class="h-7 pl-7 text-xs"
								/>
							</div>
						</div>

						<div class="max-h-72 overflow-y-auto">
							{#if attachLoading}
								<div class="p-3 text-center text-xs text-muted-foreground">Loading…</div>
							{:else if filteredPickerRows.length === 0}
								<div class="p-3 text-center text-xs text-muted-foreground">Nothing here.</div>
							{:else}
								<ul>
									{#each filteredPickerRows as r (r.id)}
										<li>
											<button
												type="button"
												class="flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60"
												onclick={() => insertAttachment(r)}
											>
												<span class="min-w-0 flex-1">
													<span class="block truncate font-medium">{r.label}</span>
													{#if r.sub}
														<span class="block truncate text-2xs text-muted-foreground">
															{r.sub}
														</span>
													{/if}
												</span>
											</button>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					{/if}
				</Popover.Content>
			</Popover.Root>

			<textarea
				bind:this={composerEl}
				value={body}
				oninput={onInput}
				onkeydown={onKey}
				placeholder="Reply in thread… @mentions, /commands, attachments"
				rows="1"
				class="flex-1 resize-none bg-transparent text-xs leading-relaxed outline-none placeholder:text-muted-foreground"
			></textarea>

			<ChatComposerMentions
				bind:this={mentions}
				textarea={composerEl}
				{body}
				{attachedCases}
				{warRoomId}
				onChangeBody={(v) => (body = v)}
			/>

			<Button type="submit" size="sm" class="h-7 gap-1.5" disabled={sending || !body.trim()}>
				{#if sending}
					<Loader2 class="h-3 w-3 animate-spin" />
				{:else}
					<Send class="h-3 w-3" />
				{/if}
				Reply
			</Button>
		</div>
		<p class="mt-1 px-1 text-2xs text-muted-foreground">
			<kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
			to send ·
			<kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd>
			for newline
		</p>
	</form>
</aside>

<ConfirmationDialog
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmText="Delete"
	confirmButtonVariant="destructive"
	onConfirm={runDelete}
/>
