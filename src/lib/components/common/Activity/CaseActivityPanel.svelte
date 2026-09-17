<!--
  Sliding side panel that shows the live activity log for the current case.
  Lives at the case workspace level so it doesn't tear down when the user
  navigates between detail pages. Driven by the `activity-panel.context`
  store; toggled from a button in the case topbar.

  Activity is pulled from `/api/v2/cases/{id}/activities` (see
  `CaseActivityService`). The endpoint already caps the response at the 40
  most recent rows, so a simple polling refresh is cheap.

  The composer at the bottom is the case task log — an analyst records
  something they did outside IRIS and it lands in the same feed. Needs
  full access on the case, so it's hidden for read-only members.
-->
<script lang="ts">
	import { getContext, onDestroy, tick } from 'svelte';
	import { ActivityIcon, PlusIcon, RefreshCwIcon, XIcon } from 'lucide-svelte';
	import {
		ACTIVITY_PANEL_CTX,
		type ActivityPanelContext
	} from '$lib/contexts/activity-panel.context.svelte';
	import { CaseActivityService, type CaseActivityRow } from '$lib/services/case-activity.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from '$lib/components/ui/toast';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';

	const panel = getContext<ActivityPanelContext>(ACTIVITY_PANEL_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);
	// Optional: the panel is only ever mounted inside the case workspace,
	// which provides the context — but don't hard-fail if that changes.
	const caseAccess = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);

	const POLL_INTERVAL_MS = 15_000;

	let activities = $state<CaseActivityRow[]>([]);
	let loading = $state(false);
	let lastLoadedAt = $state<Date | null>(null);
	let now = $state(new Date());

	let composerOpen = $state(false);
	let entryText = $state('');
	let submitting = $state(false);
	let composerEl = $state<HTMLTextAreaElement | null>(null);

	const canAddEntry = $derived(caseAccess?.canEdit() ?? false);

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

	const openComposer = async () => {
		composerOpen = true;
		await tick();
		composerEl?.focus();
	};

	const closeComposer = () => {
		composerOpen = false;
		entryText = '';
	};

	const submitEntry = async () => {
		const caseId = cases.currentCaseId();
		const content = entryText.trim();
		if (!caseId || !content || submitting) return;

		submitting = true;
		try {
			const res = await CaseActivityService.create(caseId, content, { fetch });
			const created = res?.data;
			if (!res?.ok || !created || typeof created !== 'object') {
				// 403 already toasts from ApiService; anything else is on us.
				if (res?.status !== 403) {
					toast({
						title: 'Could not add the log entry',
						description: res?.error?.message,
						variant: 'destructive'
					});
				}
				return;
			}

			// Prepend rather than re-list: the feed is ordered newest-first
			// and the endpoint hands back the row in the same projection.
			activities = [created, ...activities];
			closeComposer();
		} finally {
			submitting = false;
		}
	};

	const onComposerKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void submitEntry();
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
			closeComposer();
			lastCaseId = caseId;
		}

		startPolling();
	});

	$effect(() => {
		if (!panel.state.open) return;

		const handler = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			// Escape backs out of the composer first — closing the whole
			// panel would throw away a half-written entry.
			if (composerOpen) closeComposer();
			else panel.close();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});

	onDestroy(stopPolling);

	const lastSyncedRelative = $derived(lastLoadedAt ? relativeTime(lastLoadedAt, now) : null);
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
			{#if canAddEntry}
				<Button
					variant="ghost"
					size="icon"
					class="size-7"
					onclick={() => (composerOpen ? closeComposer() : openComposer())}
					aria-label="Add a log entry"
					aria-expanded={composerOpen}
					title="Add a log entry"
				>
					<PlusIcon class="size-4" />
				</Button>
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
						<!--
						  No name means no authenticated actor behind the row — a
						  rejected sign-in, a system action, or a since-deleted
						  account. Matches the "No user" wording on the Activities
						  page so the two feeds read the same way.
						-->
						{@const userName = activity.name ?? activity.user_name ?? null}
						{@const displayName = userName ?? 'No user'}
						<li
							class="flex items-start gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
						>
							<!--
							  Pass the raw nullable name, not `displayName`: UserAvatar
							  already degrades to a blank tile + "Unknown user" alt on
							  null, whereas "No user" would render as a misleading "NU"
							  initials tile.
							-->
							<UserAvatar
								userId={activity.user_id ?? null}
								name={userName}
								size="size-6"
								class="mt-0.5 shrink-0"
							/>

							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-baseline gap-x-2">
									<span
										class="text-xs font-medium"
										class:italic={userName === null}
										class:text-muted-foreground={userName === null}
										title={userName === null
											? 'Not attributable to an account — a failed sign-in, a system action, or a since-deleted user.'
											: undefined}>{displayName}</span
									>
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

		{#if canAddEntry && composerOpen}
			<footer class="border-t border-border px-4 py-3 dark:border-slate-700">
				<Textarea
					bind:ref={composerEl}
					bind:value={entryText}
					rows={3}
					class="text-xs"
					placeholder="What did you do? e.g. pulled the memory image off the host"
					disabled={submitting}
					onkeydown={onComposerKeydown}
					aria-label="Log entry"
				/>
				<div class="mt-2 flex items-center justify-end gap-2">
					<Button size="sm" variant="ghost" onclick={closeComposer} disabled={submitting}>
						Cancel
					</Button>
					<Button size="sm" onclick={submitEntry} disabled={submitting || !entryText.trim()}>
						{submitting ? 'Adding…' : 'Add entry'}
					</Button>
				</div>
			</footer>
		{/if}
	</div>
{/if}
