<!--
  Sliding side panel that surfaces the war-room activity stream — the
  same chat messages the war-room Chat tab shows, filtered down to
  system-kind events (case activity, task assignments, sitrep publishes,
  case attach/detach). Mirrors the case-side CaseActivityPanel's chrome.

  Lives at the war-room layout level so toggling it doesn't tear down
  the active sub-page. Cheap 15s polling refresh matches the case
  activity panel cadence.
-->
<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { ActivityIcon, RefreshCwIcon, XIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import {
		WAR_ROOM_ACTIVITY_PANEL_CTX,
		type WarRoomActivityPanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import {
		WarRoomChatService,
		type ChatMessage
	} from '$lib/services/war-room-chat.service';
	import Button from '$lib/components/ui/button/button.svelte';

	const panel = getContext<WarRoomActivityPanelContext>(WAR_ROOM_ACTIVITY_PANEL_CTX);

	const POLL_INTERVAL_MS = 15_000;

	let messages = $state<ChatMessage[]>([]);
	let loading = $state(false);
	let lastLoadedAt = $state<Date | null>(null);

	const warRoomId = $derived(Number(page.params.war_room_id));

	let pollHandle: ReturnType<typeof setInterval> | null = null;
	let lastWarRoomId: number | null = null;

	// System kinds — these are the rows that count as "activity". Plain
	// operator messages stay in the Chat tab; they don't belong in the
	// activity feed.
	const ACTIVITY_KINDS = [
		'case_activity',
		'case_attached',
		'case_detached',
		'task_assigned',
		'task_completed',
		'sitrep_published',
		'system'
	] as const;

	const load = async () => {
		if (!warRoomId) return;
		loading = true;
		try {
			const res = await WarRoomChatService.list(warRoomId, {
				limit: 60,
				kinds: ACTIVITY_KINDS as unknown as ChatMessage['kind'][]
			});
			messages = res.ok && Array.isArray(res.data) ? (res.data as ChatMessage[]) : [];
			lastLoadedAt = new Date();
		} finally {
			loading = false;
		}
	};

	const stopPolling = () => {
		if (pollHandle) {
			clearInterval(pollHandle);
			pollHandle = null;
		}
	};

	const startPolling = () => {
		stopPolling();
		void load();
		pollHandle = setInterval(() => void load(), POLL_INTERVAL_MS);
	};

	$effect(() => {
		if (!panel.state.open) {
			stopPolling();
			return;
		}
		if (warRoomId !== lastWarRoomId) {
			lastWarRoomId = warRoomId;
			startPolling();
		} else if (!pollHandle) {
			startPolling();
		}
	});

	onDestroy(stopPolling);

	const kindLabel = (k: ChatMessage['kind']) => {
		switch (k) {
			case 'case_activity':
				return 'Case activity';
			case 'case_attached':
				return 'Case attached';
			case 'case_detached':
				return 'Case detached';
			case 'task_assigned':
				return 'Task';
			case 'task_completed':
				return 'Task closed';
			case 'sitrep_published':
				return 'SitRep';
			case 'system':
				return 'System';
			default:
				return k;
		}
	};

	const kindColor = (k: ChatMessage['kind']) => {
		switch (k) {
			case 'case_activity':
			case 'case_attached':
			case 'case_detached':
				return 'bg-sky-500/15 text-sky-300';
			case 'task_assigned':
			case 'task_completed':
				return 'bg-emerald-500/15 text-emerald-300';
			case 'sitrep_published':
				return 'bg-amber-500/15 text-amber-300';
			default:
				return 'bg-muted text-muted-foreground';
		}
	};

	const fmtTime = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	};
</script>

<div class="flex h-full flex-col">
	<header class="flex items-center justify-between gap-2 border-b px-3 py-2">
		<div class="flex items-center gap-2">
			<ActivityIcon class="h-3.5 w-3.5 text-muted-foreground" />
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Activity
			</h3>
		</div>
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={load}
				aria-label="Refresh"
				disabled={loading}
			>
				<RefreshCwIcon class={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="h-7 w-7"
				onclick={() => panel.close()}
				aria-label="Close activity panel"
			>
				<XIcon class="h-3.5 w-3.5" />
			</Button>
		</div>
	</header>

	<div class="flex-1 overflow-y-auto">
		{#if messages.length === 0 && !loading}
			<p class="px-3 py-6 text-center text-xs text-muted-foreground">
				No activity yet on this war room.
			</p>
		{:else}
			<ul class="flex flex-col">
				{#each messages as m (m.message_id)}
					<li class="border-b px-3 py-2 last:border-b-0">
						<div class="mb-1 flex items-center gap-2">
							<span
								class={[
									'rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
									kindColor(m.kind)
								]}
							>
								{kindLabel(m.kind)}
							</span>
							<span class="text-2xs text-muted-foreground">{fmtTime(m.created_at)}</span>
						</div>
						<p class="break-words text-xs">{m.body ?? ''}</p>
						{#if m.ref_case_id}
							<a
								class="mt-0.5 inline-block text-2xs text-primary hover:underline"
								href={`/case/${m.ref_case_id}`}
							>
								Case #{m.ref_case_id}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	{#if lastLoadedAt}
		<footer class="border-t px-3 py-1.5 text-2xs text-muted-foreground">
			Updated {lastLoadedAt.toLocaleTimeString()}
		</footer>
	{/if}
</div>
