<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ArrowRightIcon,
		BiohazardIcon,
		CheckCircle2Icon,
		ClipboardListIcon,
		CircleAlertIcon,
		CircleDotIcon,
		ComputerIcon,
		FileLock2Icon,
		FileTextIcon,
		LoaderIcon,
		RefreshCwIcon,
		SaveIcon,
		UsersIcon
	} from 'lucide-svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import { current_user } from '$lib/stores/auth.store';
	import type { Case } from '$lib/types/resources/case';
	import type { Task } from '$lib/types/resources/task';
	import { CaseTasksService } from '$lib/services/case-tasks.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import { CaseEvidencesService } from '$lib/services/case-evidences.service';
	import { CaseActivityService, type CaseActivityRow } from '$lib/services/case-activity.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import CaseWorkspace from './components/CaseWorkspace.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);
	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);

	const case_id = cases.currentCaseId();
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	let caseDescription = $state('');
	let baseDescription = $state('');

	let loadedTime = $state(new Date());
	let now = $state(new Date());

	let loading = $state(false);
	let saving = $state(false);
	let lastError = $state<string | null>(null);
	let savedAt = $state(0);

	let dirty = $derived(caseDescription !== baseDescription);

	const refresh = async () => {
		loading = true;
		lastError = null;

		await Promise.all([
			cases.load({ case_ids: [case_id] }),
			loadCounts({ force: true }),
			loadMyTasks(),
			loadContributors()
		]);

		loadedTime = new Date();
		loading = false;
	};

	const save = async () => {
		if (!currentCase) return;

		saving = true;
		lastError = null;

		await cases.patch(case_id, { case_description: caseDescription });

		baseDescription = caseDescription;
		loadedTime = new Date();
		saving = false;
		savedAt = Date.now();
	};

	const handleRemoteSave = (content: string) => {
		caseDescription = content;
		baseDescription = content;
		loadedTime = new Date();
	};

	const relativeTime = (from: Date, to: Date): string => {
		const diff = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
		if (diff < 5) return 'just now';
		if (diff < 60) return `${diff}s ago`;
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return from.toLocaleDateString();
	};

	const greeting = (date: Date): string => {
		const h = date.getHours();
		if (h < 5) return 'Working late';
		if (h < 12) return 'Good morning';
		if (h < 18) return 'Good afternoon';
		return 'Good evening';
	};

	const firstName = $derived(($current_user?.user_name ?? '').split(/[\s,]/)[0] || 'investigator');

	const lastSyncedRelative = $derived(relativeTime(loadedTime, now));
	const lastSyncedAbsolute = $derived(loadedTime.toLocaleTimeString());

	// People who have done something in this case, sourced from
	// `GET /api/v2/cases/{id}/activities` (40 most recent rows).
	type Contributor = {
		name: string;
		userId: number | null;
		lastSeen: Date | null;
		count: number;
	};

	let myTasks = $state<Task[]>([]);
	let contributors = $state<Contributor[]>([]);

	// Local count cache for the four stat tiles. The case-* contexts already
	// track `list.total`, but only after a `listPaginated` call has populated
	// them — and we don't want to slam those stores with per_page:1 queries
	// every time the user visits the summary because that wipes whatever
	// page the sidebar had loaded. So we keep our own copy here, prime it
	// from the contexts when they happen to be populated, and otherwise
	// issue a single batched fetch.
	let counts = $state<{ assets: number; iocs: number; tasks: number; evidence: number }>({
		assets: 0,
		iocs: 0,
		tasks: 0,
		evidence: 0
	});
	let countsLoaded = false;

	const fetchTotal = async (
		fn: () => Promise<{ data: { total: number } | string | null; ok?: boolean }>
	): Promise<number> => {
		const res = await fn();
		if (!res.ok || !res.data || typeof res.data === 'string') return 0;
		return res.data.total ?? 0;
	};

	const loadCounts = async ({ force = false }: { force?: boolean } = {}) => {
		if (countsLoaded && !force) return;

		// If a context already has a non-zero total (because the user came
		// from that section's list page), reuse it instead of refetching.
		const next = { ...counts };
		const pending: Promise<void>[] = [];

		if (caseAssets.list.total > 0 && !force) next.assets = caseAssets.list.total;
		else
			pending.push(
				fetchTotal(() => CaseAssetsService.list(case_id, { per_page: 1 }, { fetch })).then(
					(t) => {
						next.assets = t;
					}
				)
			);

		if (caseIocs.list.total > 0 && !force) next.iocs = caseIocs.list.total;
		else
			pending.push(
				fetchTotal(() => CaseIocsService.list(case_id, { per_page: 1 }, { fetch })).then(
					(t) => {
						next.iocs = t;
					}
				)
			);

		if (caseEvidences.list.total > 0 && !force) next.evidence = caseEvidences.list.total;
		else
			pending.push(
				fetchTotal(() => CaseEvidencesService.list(case_id, { per_page: 1 }, { fetch })).then(
					(t) => {
						next.evidence = t;
					}
				)
			);

		// Tasks count gets filled by `loadMyTasks` from the same page of data
		// it needs anyway — no separate query for it here.

		await Promise.all(pending);
		counts = next;
		countsLoaded = true;
	};

	const loadMyTasks = async () => {
		const userId = $current_user?.user_id ?? $current_user?.id;

		const res = await CaseTasksService.list(case_id, { per_page: 50 }, { fetch });
		if (!res.ok || res.error || !res.data || typeof res.data === 'string') {
			myTasks = [];
			return;
		}

		counts.tasks = res.data.total ?? res.data.data.length;

		if (!userId) {
			myTasks = [];
			return;
		}

		myTasks = res.data.data.filter((task) =>
			(task.task_assignees_id ?? []).includes(Number(userId))
		);
	};

	const loadContributors = async () => {
		const res = await CaseActivityService.list(case_id, { fetch });
		if (!res.ok || res.error || !Array.isArray(res.data)) {
			contributors = [];
			return;
		}

		const map = new Map<string, Contributor>();
		for (const row of res.data as CaseActivityRow[]) {
			const name = (row.user_name ?? row.name ?? '').trim();
			if (!name) continue;

			const seenAt = row.activity_date ? new Date(row.activity_date) : null;
			const userId = row.user_id ?? null;
			const existing = map.get(name);
			if (existing) {
				existing.count += 1;
				if (seenAt && (!existing.lastSeen || seenAt > existing.lastSeen)) {
					existing.lastSeen = seenAt;
				}
				// Backfill the id once it shows up in any row — earlier
				// rows from the legacy backend dump might be missing it.
				if (existing.userId == null && userId != null) existing.userId = userId;
			} else {
				map.set(name, { name, userId, lastSeen: seenAt, count: 1 });
			}
		}

		contributors = [...map.values()].sort((a, b) => {
			const aT = a.lastSeen?.getTime() ?? 0;
			const bT = b.lastSeen?.getTime() ?? 0;
			return bT - aT;
		});
	};

	type StatTile = {
		label: string;
		count: number;
		Icon: typeof ComputerIcon;
		href: string;
		accent: string;
	};

	const stats = $derived<StatTile[]>([
		{
			label: 'Assets',
			count: counts.assets,
			Icon: ComputerIcon,
			href: `/case/${case_id}/assets`,
			accent: 'text-sky-600 dark:text-sky-400'
		},
		{
			label: 'IOCs',
			count: counts.iocs,
			Icon: BiohazardIcon,
			href: `/case/${case_id}/iocs`,
			accent: 'text-rose-600 dark:text-rose-400'
		},
		{
			label: 'Tasks',
			count: counts.tasks,
			Icon: ClipboardListIcon,
			href: `/case/${case_id}/tasks`,
			accent: 'text-amber-600 dark:text-amber-400'
		},
		{
			label: 'Evidence',
			count: counts.evidence,
			Icon: FileLock2Icon,
			href: `/case/${case_id}/evidence`,
			accent: 'text-emerald-600 dark:text-emerald-400'
		}
	]);

	let tick: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		tick = setInterval(() => {
			now = new Date();
		}, 1000);

		// Load everything in parallel without touching the case-* contexts'
		// list state. `loadMyTasks` doubles as the tasks-count source;
		// `loadCounts` issues at most three batched queries for the other
		// totals (and skips any that are already cached on the contexts).
		void Promise.all([loadCounts(), loadMyTasks(), loadContributors()]);
	});

	onDestroy(() => {
		if (tick) clearInterval(tick);
	});

	$effect(() => {
		if (!currentCase) return;

		baseDescription = currentCase.case_description ?? '';
		caseDescription = baseDescription;

		loadedTime = new Date();
	});
</script>

<svelte:head>
	<title>Case #{case_id} | IRIS</title>
</svelte:head>

<!--
  `bare` skips the outer rounded card from CaseWorkspace so the inner
  welcome / stats / summary cards aren't visually nested inside another
  card. Side panels (comments + activity) still mount normally.

  Scrolling: we deliberately do NOT install a per-column overflow-auto
  here. The page-level scroll lives on the layout's content wrapper
  (`(app)/+layout.svelte`, the `overflow-auto` div that wraps {@render
  children()}). Letting the natural flow grow past the viewport and
  scroll there avoids the "h-full → flex-1 min-h-0 → overflow-y-auto"
  chain being broken by any single ancestor that resolves its height
  wrong — every previous attempt to scroll inside CaseWorkspace
  silently failed because at least one ancestor was either unbounded
  or had a content-fit min-height. The simplest reliable fix is to let
  the outer scroll container do its job.
-->
<CaseWorkspace bare>
	{#if currentCase}
		<div class="flex w-full flex-col gap-4">
			<!--
			  Unified summary header: greeting, the four section counts, and the
			  two signals ("X tasks for you" + "Y people on case") all sit on a
			  single tight row. Counts are inline chips — readable at a glance,
			  no oversized hero numbers. Each chip is a link to its section.
			-->
			<section
				class="flex flex-col gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 shadow-elevation-1 lg:flex-row lg:items-center lg:gap-4"
			>
				<div class="flex min-w-0 items-baseline gap-2 lg:flex-1">
					<h2 class="truncate text-sm font-semibold leading-none">
						{greeting(now)}, {firstName}
					</h2>
					<span class="hidden truncate text-xs text-muted-foreground md:inline">
						· Welcome back
					</span>
				</div>

				<!-- Inline section counts -->
				<div class="flex flex-wrap items-center gap-1.5">
					{#each stats as stat}
						<button
							type="button"
							onclick={() => goto(stat.href)}
							class="group inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/40 px-2 py-1 text-xs transition-colors hover:border-border hover:bg-muted/70"
						>
							<stat.Icon size={12} class={stat.accent} />
							<span class="text-muted-foreground">{stat.label}</span>
							<span class="font-semibold tabular-nums">{stat.count}</span>
						</button>
					{/each}
				</div>

				<div class="hidden h-6 w-px shrink-0 bg-border/60 lg:block" aria-hidden="true"></div>

				<!-- Signals: tasks-for-you + people-on-case -->
				<div class="flex flex-wrap items-center gap-3">
					{#if myTasks.length > 0}
						<button
							type="button"
							onclick={() => goto(`/case/${case_id}/tasks`)}
							class="group inline-flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/50"
							title={myTasks.map((t) => t.task_title).join('\n')}
						>
							<div
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400"
							>
								<ClipboardListIcon size={12} />
							</div>
							<div class="min-w-0">
								<span class="font-medium">
									{myTasks.length} task{myTasks.length === 1 ? '' : 's'} for you
								</span>
								<span class="ml-1 truncate text-muted-foreground">
									· {myTasks[0].task_title}{myTasks.length > 1
										? ` +${myTasks.length - 1}`
										: ''}
								</span>
							</div>
							<ArrowRightIcon
								size={11}
								class="shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
							/>
						</button>
					{/if}

					<div class="flex min-w-0 items-center gap-2 px-1.5 py-1 text-xs">
						<div
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400"
						>
							<UsersIcon size={12} />
						</div>
						<div class="flex min-w-0 items-center gap-2">
							<span class="font-medium whitespace-nowrap">
								{contributors.length}
								{contributors.length === 1 ? 'person' : 'people'} on case
							</span>
							{#if contributors.length > 0}
								<div class="flex -space-x-1.5">
									{#each contributors.slice(0, 4) as contributor (contributor.name)}
										<UserAvatar
											userId={contributor.userId}
											name={contributor.name}
											size="size-5"
											class="border border-card ring-0"
											title={contributor.name}
										/>
									{/each}

									{#if contributors.length > 4}
										<span
											class="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-muted text-[9px] font-semibold text-muted-foreground"
										>
											+{contributors.length - 4}
										</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</section>

			<!-- Case summary card -->
			<section
				class="overflow-hidden rounded-xl border border-border/60 bg-card text-card-foreground shadow-elevation-2 transition-shadow duration-200"
			>
				<header
					class="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-5 py-3"
				>
					<div class="flex min-w-0 items-center gap-2">
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
						>
							<FileTextIcon size={16} />
						</div>

						<div class="min-w-0">
							<h2 class="truncate text-sm font-semibold leading-tight">
								{currentCase.case_name}
							</h2>
						</div>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						{#if lastError}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
							>
								<CircleAlertIcon size={12} />
								Error
							</span>
						{:else if saving}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"
							>
								<LoaderIcon size={12} class="animate-spin" />
								Saving…
							</span>
						{:else if dirty}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
							>
								<CircleDotIcon size={12} />
								Unsaved changes
							</span>
						{:else}
							<span
								class="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
							>
								<CheckCircle2Icon size={12} />
								All changes saved
							</span>
						{/if}

						<span
							class="hidden text-xs text-muted-foreground sm:inline"
							title={`Last synced at ${lastSyncedAbsolute}`}
						>
							Synced {lastSyncedRelative}
						</span>

						<div class="flex items-center gap-1">
							<Button
								variant="ghost"
								size="xs"
								disabled={loading}
								onclick={refresh}
								title="Refresh"
							>
								<RefreshCwIcon size={12} class={loading ? 'animate-spin' : ''} />
								<span class="ml-1 hidden sm:inline">Refresh</span>
							</Button>

							<Button
								variant="default"
								size="xs"
								disabled={saving || !dirty}
								onclick={save}
								title="Save"
							>
								<SaveIcon size={12} />
								<span class="ml-1 hidden sm:inline">Save</span>
							</Button>
						</div>
					</div>
				</header>

				{#if lastError}
					<div
						class="border-b border-destructive/30 bg-destructive/5 px-5 py-2 text-xs text-destructive"
					>
						{lastError}
					</div>
				{/if}

				<!--
				  Cap the editor body height so long summaries scroll WITHIN
				  the card rather than pushing the rest of the page off
				  screen. `max-h-[calc(100vh-18rem)]` reserves room for the
				  topbar (~3.5rem), the welcome strip (~3.5rem), the summary
				  card header (~3.5rem), and surrounding gaps/padding — the
				  remaining viewport is given to the editor scroll area.
				  Mirrors the pattern notes use (their own scroll container)
				  so behaviour is consistent across the app.
				-->
				<div class="max-h-[calc(100vh-18rem)] min-h-[20rem] overflow-y-auto p-5">
					<MarkDownEditor
						value={caseDescription}
						onChange={(v) => (caseDescription = v)}
						onSave={() => save()}
						caseId={case_id}
						{savedAt}
						onRemoteSave={handleRemoteSave}
					/>
				</div>
			</section>
		</div>
	{:else}
		<div class="flex h-32 w-full items-center justify-center text-sm text-muted-foreground">
			Loading…
		</div>
	{/if}
</CaseWorkspace>
