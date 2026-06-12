<!--
  Sliding side panel that shows the live activity log for the current case.
  Lives at the case workspace level so it doesn't tear down when the user
  navigates between detail pages. Driven by the `activity-panel.context`
  store; toggled from a button in the case topbar.

  Activity is pulled from `/api/v2/cases/{id}/activities` (see
  `CaseActivityService`). The endpoint already caps the response at the 40
  most recent rows, so a simple polling refresh is cheap.
-->
<script lang="ts">
	import { getContext, onDestroy } from 'svelte';
	import { ActivityIcon, RefreshCwIcon, XIcon } from 'lucide-svelte';
	import {
		ACTIVITY_PANEL_CTX,
		type ActivityPanelContext
	} from '$lib/contexts/activity-panel.context.svelte';
	import { CaseActivityService, type CaseActivityRow } from '$lib/services/case-activity.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { getInitials } from '$lib/utils';

	const panel = getContext<ActivityPanelContext>(ACTIVITY_PANEL_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);

	const POLL_INTERVAL_MS = 15_000;

	let activities = $state<CaseActivityRow[]>([]);
	let loading = $state(false);
	let lastLoadedAt = $state<Date | null>(null);
	let now = $state(new Date());

	let pollHandle: ReturnType<typeof setInterval> | null = null;
	let tickHandle: ReturnType<typeof setInterval> | null = null;
	let lastCaseId: number | null = null;

	const loadActivities = async () => {
		const caseId = cases.currentCaseId();
		if (!caseId) return;

		loading = true;
		try {
			const res = await CaseActivityService.list(caseId, { fetch });
			activities = Array.isArray(res?.data) ? res.data : [];
			lastLoadedAt = new Date();
		} finally {
			loading = false;
		}
	};

	const startPolling = () => {
		stopPolling();
		void loadActivities();
		pollHandle = setInterval(() => void loadActivities(), POLL_INTERVAL_MS);
		tickHandle = setInterval(() => {
			now = new Date();
		}, 1000);
	};

	const stopPolling = () => {
		if (pollHandle) {
			clearInterval(pollHandle);
			pollHandle = null;
		}
		if (tickHandle) {
			clearInterval(tickHandle);
			tickHandle = null;
		}
	};

	const relativeTime = (from: Date, to: Date): string => {
		const diff = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
		if (diff < 5) return 'just now';
		if (diff < 60) return `${diff}s ago`;
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return from.toLocaleDateString();
	};

	const formatActivityDate = (raw: string | undefined): string => {
		if (!raw) return '';
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return raw;
		return relativeTime(d, now);
	};

	const absoluteTime = (raw: string | undefined): string => {
		if (!raw) return '';
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return raw;
		return d.toLocaleString();
	};

	// React to panel open/close and case change. We poll while open and on
	// the currently selected case; close → stop, case change → reload.
	$effect(() => {
		const open = panel.state.open;
		const caseId = cases.currentCaseId();

		if (!open || !caseId) {
			stopPolling();
			lastCaseId = caseId ?? null;
			return;
		}

		if (caseId !== lastCaseId) {
			activities = [];
			lastCaseId = caseId;
		}

		startPolling();
	});

	$effect(() => {
		if (!panel.state.open) return;

		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') panel.close();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});

	onDestroy(stopPolling);

	const lastSyncedRelative = $derived(
		lastLoadedAt ? relativeTime(lastLoadedAt, now) : null
	);
</script>

{#if panel.state.open}
	<div class="flex h-full w-full flex-col">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3 dark:border-slate-700">
			<ActivityIcon class="size-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0 flex-1">
				<div class="text-2xs uppercase tracking-wide text-muted-foreground">Activity</div>
				<div class="truncate text-sm font-semibold">Live case log</div>
			</div>
			{#if lastSyncedRelative}
				<span class="hidden text-2xs text-muted-foreground sm:inline">
					Synced {lastSyncedRelative}
				</span>
			{/if}
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={loadActivities}
				disabled={loading}
				aria-label="Refresh activity"
			>
				<RefreshCwIcon class={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={() => panel.close()}
				aria-label="Close activity panel"
			>
				<XIcon class="size-4" />
			</Button>
		</header>

		<div class="min-h-0 flex-1 overflow-auto px-4 py-3">
			{#if loading && activities.length === 0}
				<div class="flex h-full items-center justify-center text-xs text-muted-foreground">
					Loading…
				</div>
			{:else if activities.length === 0}
				<div
					class="flex h-full items-center justify-center text-center text-xs text-muted-foreground"
				>
					Nothing happening yet — actions on this case will appear here.
				</div>
			{:else}
				<ol class="space-y-2">
					{#each activities as activity (`${activity.activity_date}-${activity.name}-${activity.activity_desc}`)}
						{@const userName = activity.name ?? activity.user_name ?? 'Unknown'}
						<li
							class="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
						>
							<Avatar class="mt-0.5 h-6 w-6 shrink-0">
								<AvatarFallback class="bg-muted text-[10px] font-medium">
									{getInitials(userName)}
								</AvatarFallback>
							</Avatar>

							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-baseline gap-x-2">
									<span class="text-xs font-medium">{userName}</span>
									<span
										class="text-2xs text-muted-foreground"
										title={absoluteTime(activity.activity_date)}
									>
										{formatActivityDate(activity.activity_date)}
									</span>
									{#if activity.is_from_api}
										<span
											class="rounded bg-sky-500/10 px-1 text-[10px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300"
										>
											API
										</span>
									{/if}
								</div>
								<p class="mt-0.5 break-words text-xs text-muted-foreground">
									{activity.activity_desc ?? ''}
								</p>
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
{/if}
