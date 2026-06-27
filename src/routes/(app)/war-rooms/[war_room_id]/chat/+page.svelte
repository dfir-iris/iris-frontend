<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/state';
	import {
		Send,
		Filter,
		FileText,
		AlertCircle,
		WaypointsIcon,
		ListChecks,
		Pin,
		FileSearch,
		Loader2
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomChatService,
		type ChatMessage,
		type ChatMessageKind
	} from '$lib/services/war-room-chat.service';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let messages = $state<ChatMessage[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let exhausted = $state(false);
	let body = $state('');
	let sending = $state(false);

	// Filter chips drive client-side filtering only — the server still
	// returns the full stream so toggling stays snappy.
	let filterMessages = $state(true);
	let filterCaseActivity = $state(true);
	let filterTasks = $state(true);
	let filterSitreps = $state(true);
	let filterNotes = $state(true);
	let filterSystem = $state(false);

	let listEl: HTMLDivElement | null = $state(null);
	let inputEl: HTMLTextAreaElement | null = $state(null);

	const visibleMessages = $derived.by(() => {
		return messages.filter((m) => {
			if (m.deleted_at) return false;
			switch (m.kind) {
				case 'message':
					return filterMessages;
				case 'case_activity':
				case 'case_attached':
				case 'case_detached':
					return filterCaseActivity;
				case 'task_assigned':
				case 'task_completed':
					return filterTasks;
				case 'sitrep_published':
					return filterSitreps;
				case 'note':
				case 'pin':
					return filterNotes;
				case 'system':
					return filterSystem;
				default:
					return true;
			}
		});
	});

	const scrollToBottom = async () => {
		await tick();
		if (listEl) listEl.scrollTop = listEl.scrollHeight;
	};

	const load = async () => {
		loading = true;
		const res = await WarRoomChatService.list(warRoomId, { limit: 80 });
		if (res.ok && Array.isArray(res.data)) {
			// Server returns newest-first, we render oldest-first.
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
			const previousScrollHeight = listEl?.scrollHeight ?? 0;
			const previousScrollTop = listEl?.scrollTop ?? 0;
			messages = [...[...res.data].reverse(), ...messages];
			// Preserve scroll anchor so the user doesn't lose their place.
			await tick();
			if (listEl) {
				const delta = listEl.scrollHeight - previousScrollHeight;
				listEl.scrollTop = previousScrollTop + delta;
			}
			if (res.data.length < 80) exhausted = true;
		}
	};

	let pollTimer: ReturnType<typeof setInterval> | null = null;

	const pollNewer = async () => {
		// Cheap interval poll for new messages while we don't have a
		// socket bind on this page yet. The socket channel exists on the
		// backend (`war_room_<id>`); a future iteration will move this
		// to a live-push subscription. Polling every 4s keeps the chat
		// reactive enough for crisis use without saturating the API.
		if (messages.length === 0) {
			return load();
		}
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
		load();
		pollTimer = setInterval(pollNewer, 4000);
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
			inputEl?.focus();
		} else {
			toast({
				title: 'Could not send message',
				description:
					typeof res.data === 'string'
						? res.data
						: (res.data as { message?: string } | null)?.message ??
							res.error?.message ??
							'Unknown error',
				variant: 'destructive'
			});
		}
	};

	const onKey = (e: KeyboardEvent) => {
		// Enter sends, Shift+Enter newlines — chat-app convention.
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	};

	const iconFor = (kind: ChatMessageKind) => {
		switch (kind) {
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
				return FileSearch;
			case 'pin':
				return Pin;
			case 'system':
				return AlertCircle;
			default:
				return null;
		}
	};

	const isSystem = (kind: ChatMessageKind) => kind !== 'message';

	const timeFmt = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleTimeString(undefined, {
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	};
</script>

<div class="grid h-full grid-cols-[180px_1fr] overflow-hidden">
	<aside class="flex flex-col gap-2 border-r bg-card/30 p-3 text-xs">
		<div class="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
			<Filter class="h-3 w-3" />
			Show
		</div>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={filterMessages} class="h-3 w-3" />
			Messages
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={filterCaseActivity} class="h-3 w-3" />
			Case activity
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={filterTasks} class="h-3 w-3" />
			Tasks
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={filterSitreps} class="h-3 w-3" />
			SitReps
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={filterNotes} class="h-3 w-3" />
			Notes / Pins
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={filterSystem} class="h-3 w-3" />
			System
		</label>

		<div class="mt-4 text-2xs text-muted-foreground">
			<p class="mb-1 font-semibold uppercase tracking-wider">Slash commands</p>
			<ul class="space-y-1">
				<li><code>/note</code> jot</li>
				<li><code>/pin</code> highlight</li>
				<li><code>/attach &lt;case_id&gt;</code></li>
				<li><code>/task &lt;title&gt;</code></li>
				<li><code>/sitrep &lt;title&gt;</code></li>
			</ul>
		</div>
	</aside>

	<div class="flex h-full min-h-0 flex-col">
		<div bind:this={listEl} class="flex-1 overflow-y-auto px-4 py-3">
			{#if loading}
				<div class="flex flex-col gap-2">
					{#each Array(5) as _}
						<Skeleton class="h-12 w-full" />
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
							Load older
						</Button>
					</div>
				{/if}

				{#if visibleMessages.length === 0}
					<div class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
						<p class="text-sm">No messages match the current filters.</p>
					</div>
				{:else}
					<ul class="flex flex-col gap-2">
						{#each visibleMessages as m (m.message_id)}
							{@const Icon = iconFor(m.kind)}
							{#if isSystem(m.kind)}
								<li class="flex items-center gap-2 rounded-md border border-dashed bg-card/20 px-3 py-1.5 text-xs text-muted-foreground">
									{#if Icon}
										<Icon class="h-3.5 w-3.5 shrink-0" />
									{/if}
									<span class="min-w-0 flex-1 truncate">{m.body ?? ''}</span>
									<span class="shrink-0 text-2xs">{timeFmt(m.created_at)}</span>
								</li>
							{:else}
								<li class="flex flex-col gap-0.5 rounded-md bg-card/40 px-3 py-2">
									<div class="flex items-center gap-2 text-2xs text-muted-foreground">
										<span class="font-medium text-foreground">
											{m.author_name ?? m.author_login ?? 'Unknown'}
										</span>
										<span>{timeFmt(m.created_at)}</span>
										{#if m.edited_at}
											<span class="italic">(edited)</span>
										{/if}
									</div>
									<p class="whitespace-pre-wrap break-words text-sm">{m.body ?? ''}</p>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
			{/if}
		</div>

		<form
			class="border-t bg-background/80 px-3 py-2"
			onsubmit={(e) => {
				e.preventDefault();
				send();
			}}
		>
			<div class="flex items-end gap-2">
				<textarea
					bind:this={inputEl}
					bind:value={body}
					onkeydown={onKey}
					placeholder="Type a message or /command…"
					rows="2"
					class="flex-1 resize-none rounded-md border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
				></textarea>
				<Button type="submit" disabled={sending || !body.trim()} class="h-9">
					<Send class="mr-1 h-3.5 w-3.5" />
					Send
				</Button>
			</div>
		</form>
	</div>
</div>
