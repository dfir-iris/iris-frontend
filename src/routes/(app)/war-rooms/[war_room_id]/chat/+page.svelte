<!--
  War-room chat. Slack-ish stream: bubbles for operator messages,
  inline system rows for activity. A composer with an attachments
  popover that lets the operator paste a reference to an event / IOC /
  asset / task from any of the war-room's attached cases without
  leaving the chat — the picker reads the existing case sub-resource
  APIs (no new backend) and inserts a markdown stub the chat renders.
-->
<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/state';
	import {
		AlertCircle,
		ClockIcon,
		FileText,
		Filter,
		Loader2,
		Paperclip,
		Pin,
		ListChecks,
		Search,
		Send,
		Slash,
		WaypointsIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Popover from '$lib/components/ui/popover';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import ChatMessageBody from './components/ChatMessageBody.svelte';
	import ChatComposerMentions from './components/ChatComposerMentions.svelte';
	import AttachmentPreviewDialog, {
		type AttachmentTarget
	} from './components/AttachmentPreviewDialog.svelte';
	import {
		WarRoomChatService,
		type ChatMessage,
		type ChatMessageKind
	} from '$lib/services/war-room-chat.service';
	import {
		WarRoomsService,
		type WarRoomCaseAttachment
	} from '$lib/services/war-rooms.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let messages = $state<ChatMessage[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let exhausted = $state(false);
	let body = $state('');
	let sending = $state(false);
	let composerEl: HTMLTextAreaElement | null = $state(null);
	let listEl: HTMLDivElement | null = $state(null);

	// Filter set lives in a single bitmask so toggling is cheap and
	// rendering doesn't have to re-run six boolean checks per row. The
	// labels and default state of each chip are declared in `FILTERS`.
	const FILTERS = [
		{ key: 'message', label: 'Messages', kinds: ['message'] as const },
		{
			key: 'activity',
			label: 'Case activity',
			kinds: ['case_activity', 'case_attached', 'case_detached'] as const
		},
		{
			key: 'tasks',
			label: 'Tasks',
			kinds: ['task_assigned', 'task_completed'] as const
		},
		{ key: 'sitreps', label: 'SitReps', kinds: ['sitrep_published'] as const },
		{ key: 'notes', label: 'Notes / Pins', kinds: ['note', 'pin'] as const },
		{ key: 'system', label: 'System', kinds: ['system'] as const }
	];

	let visibleFilters = $state<Set<string>>(
		new Set(['message', 'activity', 'tasks', 'sitreps', 'notes'])
	);

	const kindToFilter = (k: ChatMessageKind): string | null => {
		for (const f of FILTERS) {
			if ((f.kinds as readonly string[]).includes(k)) return f.key;
		}
		return null;
	};

	const visibleMessages = $derived.by(() =>
		messages.filter((m) => {
			if (m.deleted_at) return false;
			const key = kindToFilter(m.kind);
			return key ? visibleFilters.has(key) : true;
		})
	);

	// Attached cases drive the attachments picker (events / IOCs / assets
	// / tasks come from these).
	let attachedCases = $state<WarRoomCaseAttachment[]>([]);
	const loadAttachedCases = async () => {
		const res = await WarRoomsService.listCases(warRoomId);
		if (res.ok && Array.isArray(res.data)) {
			attachedCases = res.data;
		}
	};

	const scrollToBottom = async () => {
		await tick();
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	};

	const load = async () => {
		loading = true;
		const res = await WarRoomChatService.list(warRoomId, { limit: 80 });
		if (res.ok && Array.isArray(res.data)) {
			messages = [...res.data].reverse();
			if (res.data.length < 80) exhausted = true;
		}
		loading = false;
		scrollToBottom();
	};

	const loadOlder = async () => {
		if (loadingMore || exhausted || messages.length === 0) return;
		loadingMore = true;
		const before = messages[0].message_id;
		const res = await WarRoomChatService.list(warRoomId, { before, limit: 80 });
		loadingMore = false;
		if (res.ok && Array.isArray(res.data)) {
			if (res.data.length === 0) {
				exhausted = true;
				return;
			}
			const prevHeight = listEl?.scrollHeight ?? 0;
			const prevTop = listEl?.scrollTop ?? 0;
			messages = [...[...res.data].reverse(), ...messages];
			await tick();
			if (listEl) {
				const delta = listEl.scrollHeight - prevHeight;
				listEl.scrollTop = prevTop + delta;
			}
			if (res.data.length < 80) exhausted = true;
		}
	};

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	const pollNewer = async () => {
		if (messages.length === 0) return load();
		const newest = messages[messages.length - 1].message_id;
		const res = await WarRoomChatService.list(warRoomId, { limit: 50 });
		if (res.ok && Array.isArray(res.data)) {
			const fresh = res.data.filter((m) => m.message_id > newest);
			if (fresh.length > 0) {
				const wasAtBottom =
					listEl != null &&
					listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 80;
				messages = [...messages, ...[...fresh].reverse()];
				if (wasAtBottom) scrollToBottom();
			}
		}
	};

	onMount(() => {
		void load();
		void loadAttachedCases();
		pollTimer = setInterval(() => void pollNewer(), 4000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	const send = async () => {
		const text = body.trim();
		if (!text) return;
		sending = true;
		const res = await WarRoomChatService.post(warRoomId, text);
		sending = false;
		if (res.ok) {
			body = '';
			await pollNewer();
			scrollToBottom();
			composerEl?.focus();
		} else {
			toast({
				title: 'Could not send message',
				description:
					typeof res.data === 'string'
						? res.data
						: ((res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error'),
				variant: 'destructive'
			});
		}
	};

	// The mention component owns Up/Down/Enter/Esc when its popup is
	// open — we hand the event over first and only fall through to the
	// default Enter-sends behaviour when the mention picker didn't claim
	// the key.
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

	// Attachment preview state. The chip click fires `onAttachmentClick`
	// with `{type, label, href}` and we extract the caseId from the href
	// (`/case/<id>/<sub>`) so the preview modal can fetch directly.
	let previewOpen = $state(false);
	let previewTarget = $state<AttachmentTarget | null>(null);

	const openPreview = (t: {
		type: 'event' | 'ioc' | 'asset' | 'task';
		label: string;
		href: string;
	}) => {
		const m = t.href.match(/^\/case\/(\d+)\//);
		if (!m) {
			window.location.assign(t.href);
			return;
		}
		previewTarget = {
			kind: t.type,
			caseId: Number(m[1]),
			label: t.label
		};
		previewOpen = true;
	};

	const toggleFilter = (key: string) => {
		const next = new Set(visibleFilters);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		visibleFilters = next;
	};

	const SLASH_COMMANDS = [
		{ cmd: '/note', desc: 'Pin a quick note in the chat' },
		{ cmd: '/pin', desc: 'Highlight a message' },
		{ cmd: '/attach <case_id>', desc: 'Attach a case to the war room' },
		{ cmd: '/task <title>', desc: 'Create a war-room task' },
		{ cmd: '/sitrep <title>', desc: 'Start a SitRep draft' }
	];

	// --- Attachments picker --------------------------------------------------
	// One picker covers four resource types pulled from the attached
	// cases. We pre-load per case on first open to avoid a flash of
	// loading state when the user switches the inner tab.

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
		// Re-run when kind or selected case change. The fetch is cheap
		// because it pages the v2 endpoint at 25 rows max for the picker.
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
						label: String((i as { ioc_value?: string }).ioc_value ?? '') || `IOC #${(i as { ioc_id: number }).ioc_id}`,
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
			(r) =>
				r.label.toLowerCase().includes(needle) ||
				(r.sub ?? '').toLowerCase().includes(needle)
		);
	});

	const insertAttachment = (row: Picker) => {
		// Append a markdown reference into the composer. The chat
		// itself doesn't try to live-render these (the rest of the
		// stream is plain text), but the link is clickable and the
		// human-readable label makes the intent obvious.
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

	// --- Rendering helpers ---------------------------------------------------

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

	const systemIcon = (k: ChatMessageKind) => {
		switch (k) {
			case 'task_assigned':
			case 'task_completed':
				return ListChecks;
			case 'case_attached':
			case 'case_detached':
			case 'case_activity':
				return WaypointsIcon;
			case 'sitrep_published':
				return FileText;
			case 'note':
			case 'pin':
				return Pin;
			case 'system':
				return AlertCircle;
			default:
				return null;
		}
	};

	const systemColor = (k: ChatMessageKind) => {
		switch (k) {
			case 'task_assigned':
			case 'task_completed':
				return 'text-emerald-600 dark:text-emerald-400';
			case 'case_attached':
			case 'case_detached':
			case 'case_activity':
				return 'text-sky-600 dark:text-sky-400';
			case 'sitrep_published':
				return 'text-amber-600 dark:text-amber-400';
			case 'note':
			case 'pin':
				return 'text-violet-600 dark:text-violet-400';
			default:
				return 'text-muted-foreground';
		}
	};

	// Determine whether to render an avatar / header for this message
	// vs. an inline continuation of the previous bubble. Groups
	// consecutive messages from the same author within a 5min window
	// for a less noisy timeline.
	const groups = $derived.by(() => {
		type Group = { key: string; date: string; rows: ChatMessage[] };
		const out: Group[] = [];
		let lastAuthor: number | null = null;
		let lastTs = 0;
		let lastDate = '';
		for (const m of visibleMessages) {
			const ts = m.created_at ? new Date(m.created_at).getTime() : 0;
			const date = m.created_at
				? new Date(m.created_at).toLocaleDateString()
				: 'Unknown';
			if (date !== lastDate) {
				out.push({ key: `date-${date}-${m.message_id}`, date, rows: [] });
				lastDate = date;
				lastAuthor = null;
			}
			const tail = out[out.length - 1];
			tail.rows.push(m);
			lastAuthor = m.author_id;
			lastTs = ts;
		}
		return out;
	});

	const isContinuation = (
		m: ChatMessage,
		prev: ChatMessage | undefined
	): boolean => {
		if (!prev) return false;
		if (prev.kind !== 'message' || m.kind !== 'message') return false;
		if (prev.author_id !== m.author_id) return false;
		if (!prev.created_at || !m.created_at) return false;
		const dt =
			new Date(m.created_at).getTime() - new Date(prev.created_at).getTime();
		return dt < 5 * 60 * 1000;
	};

	const filterCount = $derived(visibleFilters.size);
</script>

<!--
	Left sidebar (filters + slash command reference) kept on lg+ — it
	gives the operator at-a-glance control over what's in the stream.
	Hidden under lg; the filter chips become a compact horizontal row
	above the stream so tight viewports still get full control.
-->
<div class="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)]">
	<aside
		class="hidden flex-col border-r bg-card/40 lg:flex"
		aria-label="Chat filters"
	>
		<div class="border-b px-4 py-3">
			<p class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Filter class="h-3 w-3" />
				Show
			</p>
		</div>

		<ul class="flex flex-col gap-0.5 p-2">
			{#each FILTERS as f (f.key)}
				{@const on = visibleFilters.has(f.key)}
				<li>
					<button
						type="button"
						class={[
							'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors',
							on
								? 'bg-muted/60 text-foreground'
								: 'text-muted-foreground hover:bg-muted/40'
						]}
						onclick={() => toggleFilter(f.key)}
						aria-pressed={on}
					>
						<span>{f.label}</span>
						<span
							class={[
								'h-2 w-2 rounded-full transition-colors',
								on ? 'bg-primary' : 'bg-border'
							]}
							aria-hidden="true"
						></span>
					</button>
				</li>
			{/each}
		</ul>

		<div class="border-t px-4 py-3">
			<p class="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				<Slash class="h-3 w-3" />
				Slash commands
			</p>
			<ul class="space-y-1.5">
				{#each SLASH_COMMANDS as c}
					<li class="text-2xs">
						<code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
							{c.cmd}
						</code>
						<p class="mt-0.5 pl-1 text-muted-foreground">{c.desc}</p>
					</li>
				{/each}
			</ul>
		</div>
	</aside>

	<div class="flex h-full min-h-0 min-w-0 flex-col">
		<!-- Compact filter chip row visible only when sidebar is hidden. -->
		<div class="flex items-center gap-2 overflow-x-auto border-b px-4 py-2 lg:hidden">
			<Filter class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			{#each FILTERS as f (f.key)}
				{@const on = visibleFilters.has(f.key)}
				<button
					type="button"
					class={[
						'shrink-0 rounded-full border px-2 py-0.5 text-2xs transition-colors',
						on
							? 'border-primary bg-primary/10 text-primary'
							: 'border-border text-muted-foreground hover:text-foreground'
					]}
					onclick={() => toggleFilter(f.key)}
				>
					{f.label}
				</button>
			{/each}
		</div>

		<!-- Stream. min-w-0 above keeps long messages from forcing the
		     column wider than the grid track allows. -->
		<div bind:this={listEl} class="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
			{#if loading}
				<div class="flex flex-col gap-3">
					{#each Array(4) as _}
						<div class="flex items-start gap-3">
							<Skeleton class="h-8 w-8 rounded-full" />
							<div class="flex-1 space-y-1.5">
								<Skeleton class="h-3 w-32" />
								<Skeleton class="h-3 w-3/4" />
							</div>
						</div>
					{/each}
				</div>
			{:else}
				{#if !exhausted}
					<div class="flex justify-center pb-3">
						<Button
							variant="ghost"
							size="sm"
							class="h-7 text-2xs"
							onclick={loadOlder}
							disabled={loadingMore}
						>
							{#if loadingMore}
								<Loader2 class="mr-1 h-3 w-3 animate-spin" />
							{/if}
							Load earlier messages
						</Button>
					</div>
				{/if}

				{#if visibleMessages.length === 0}
					<div class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
						<Send class="h-6 w-6 opacity-30" />
						<p class="text-sm">
							{messages.length === 0
								? 'No messages yet. Drop the first SitRep.'
								: 'No messages match the current filters.'}
						</p>
						{#if filterCount < FILTERS.length}
							<Button
								size="sm"
								variant="ghost"
								class="h-7 text-2xs"
								onclick={() => (visibleFilters = new Set(FILTERS.map((f) => f.key)))}
							>
								Show everything
							</Button>
						{/if}
					</div>
				{:else}
					<div class="space-y-5">
						{#each groups as g (g.key)}
							<!-- Date separator -->
							<div class="flex items-center gap-3" aria-hidden="true">
								<div class="h-px flex-1 bg-border"></div>
								<span class="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
									{g.date}
								</span>
								<div class="h-px flex-1 bg-border"></div>
							</div>

							<ul class="flex flex-col gap-1">
								{#each g.rows as m, i (m.message_id)}
									{@const prev = g.rows[i - 1]}
									{@const cont = isContinuation(m, prev)}
									{@const Icon = systemIcon(m.kind)}

									{#if m.kind !== 'message'}
										<li
											class="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-card/40 px-3 py-1.5 text-xs"
										>
											{#if Icon}
												<Icon class={`h-3.5 w-3.5 shrink-0 ${systemColor(m.kind)}`} />
											{/if}
											<span class="min-w-0 flex-1 break-words text-muted-foreground">
												<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
											</span>
											{#if m.ref_case_id}
												<a
													href={`/case/${m.ref_case_id}`}
													class="shrink-0 text-2xs text-primary hover:underline"
												>
													Case #{m.ref_case_id}
												</a>
											{/if}
											<span class="shrink-0 text-2xs text-muted-foreground">
												{fmtTime(m.created_at)}
											</span>
										</li>
									{:else if cont}
										<li class="flex gap-3 pl-11">
											<p class="min-w-0 flex-1 break-words text-sm">
												<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
											</p>
										</li>
									{:else}
										<li class="flex gap-3 pt-2">
											<UserAvatar
												userId={m.author_id ?? undefined}
												name={m.author_name ?? m.author_login ?? 'Unknown'}
												size="size-8"
											/>
											<div class="min-w-0 flex-1">
												<div class="flex items-baseline gap-2">
													<span class="text-sm font-semibold text-foreground">
														{m.author_name ?? m.author_login ?? 'Unknown'}
													</span>
													<span class="text-2xs text-muted-foreground">
														{fmtTime(m.created_at)}
													</span>
													{#if m.edited_at}
														<span class="text-2xs italic text-muted-foreground">
															(edited)
														</span>
													{/if}
												</div>
												<p class="mt-0.5 break-words text-sm">
													<ChatMessageBody body={m.body ?? ''} onAttachmentClick={openPreview} />
												</p>
											</div>
										</li>
									{/if}
								{/each}
							</ul>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<!-- Composer -->
		<form
			class="border-t bg-background/80 px-4 py-3"
			onsubmit={(e) => {
				e.preventDefault();
				void send();
			}}
		>
			<div class="flex items-end gap-2 rounded-xl border bg-card px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
				<Popover.Root bind:open={attachOpen}>
					<Popover.Trigger
						class="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Attach a case element"
					>
						<Paperclip size={15} />
					</Popover.Trigger>
					<Popover.Content side="top" align="start" class="w-96 p-0">
						{#if attachedCases.length === 0}
							<div class="p-4 text-center text-xs text-muted-foreground">
								No cases attached to this war room yet — attach one in the Cases tab.
							</div>
						{:else}
							<!-- Kind chips -->
							<div class="flex items-center gap-1 border-b p-2">
								{#each [{ k: 'event', l: 'Events' }, { k: 'ioc', l: 'IOCs' }, { k: 'asset', l: 'Assets' }, { k: 'task', l: 'Tasks' }] as t}
									{@const on = attachKind === (t.k as ResourceKind)}
									<button
										type="button"
										class={[
											'flex-1 rounded-md px-2 py-1 text-2xs transition-colors',
											on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
										]}
										onclick={() => (attachKind = t.k as ResourceKind)}
									>
										{t.l}
									</button>
								{/each}
							</div>

							<!-- Case selector -->
							<div class="border-b p-2">
								<label class="block text-2xs uppercase tracking-wider text-muted-foreground" for="attach-case">
									Case
								</label>
								<select
									id="attach-case"
									bind:value={attachCaseId}
									class="mt-1 h-7 w-full rounded border bg-background px-2 text-xs"
								>
									{#each attachedCases as c (c.case_id)}
										<option value={c.case_id}>#{c.case_id} — {c.case_name}</option>
									{/each}
								</select>
							</div>

							<!-- Search -->
							<div class="border-b p-2">
								<div class="relative">
									<Search class="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={attachSearch}
										oninput={(e) => (attachSearch = (e.target as HTMLInputElement).value)}
										placeholder="Search…"
										class="h-7 pl-7 text-xs"
									/>
								</div>
							</div>

							<!-- Results -->
							<div class="max-h-72 overflow-y-auto">
								{#if attachLoading}
									<div class="p-3 text-center text-xs text-muted-foreground">
										Loading…
									</div>
								{:else if filteredPickerRows.length === 0}
									<div class="p-3 text-center text-xs text-muted-foreground">
										Nothing here.
									</div>
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
					placeholder="Type a message, /command, @user or #resource…"
					rows="1"
					class="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
				></textarea>

				<ChatComposerMentions
					bind:this={mentions}
					textarea={composerEl}
					{body}
					{attachedCases}
					onChangeBody={(v) => (body = v)}
				/>

				<Button
					type="submit"
					size="sm"
					class="h-8 gap-1.5"
					disabled={sending || !body.trim()}
				>
					{#if sending}
						<Loader2 class="h-3.5 w-3.5 animate-spin" />
					{:else}
						<Send class="h-3.5 w-3.5" />
					{/if}
					Send
				</Button>
			</div>

			<p class="mt-1.5 px-1 text-2xs text-muted-foreground">
				<kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
				to send · <kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Shift+Enter</kbd>
				for newline · <kbd class="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">/</kbd>
				for commands
			</p>
		</form>
	</div>
</div>

<AttachmentPreviewDialog
	bind:open={previewOpen}
	target={previewTarget}
	onOpenChange={(v) => (previewOpen = v)}
/>
