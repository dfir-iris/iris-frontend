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
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
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
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import CaseWorkspace from './components/CaseWorkspace.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);
	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);
	const caseAccess = getContext<CaseAccessContext>(CASE_ACCESS_CTX);

	const canEdit = $derived(caseAccess.canEdit());

	// Must stay reactive: SvelteKit reuses this page component when the
	// user navigates between two `[case_id]` routes (e.g. case 1 → Overview
	// → case 2), so a `const case_id = …` captured at script init would
	// stick to the first case forever — counts, chip hrefs, and the
	// "N people on case" avatars would all keep pointing at case #1.
	const case_id = $derived(cases.currentCaseId());
	const currentCase = $derived<Case | null>(cases.currentCase() ?? null);

	// Closing note block — see the markup between the tools bar and the editor.
	const closingNote = $derived(currentCase?.closing_note?.trim() ?? '');
	const isClosed = $derived(currentCase?.state?.state_name === 'Closed');

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
				fetchTotal(() => CaseAssetsService.list(case_id, { per_page: 1 }, { fetch })).then((t) => {
					next.assets = t;
				})
			);

		if (caseIocs.list.total > 0 && !force) next.iocs = caseIocs.list.total;
		else
			pending.push(
				fetchTotal(() => CaseIocsService.list(case_id, { per_page: 1 }, { fetch })).then((t) => {
					next.iocs = t;
				})
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
	});

	// Reload the per-case data whenever the URL case_id changes. This
	// fires once on mount and again on every case switch (which reuses
	// this page component instead of remounting it). We zero the local
	// caches synchronously so the chips can't flash the previous case's
	// numbers before the new fetches resolve — same reason we blank
	// the description here: `currentCase` doesn't update until
	// `cases.load(...)` resolves, and the {#key case_id} remount below
	// would otherwise seed the new editor with the previous case's
	// summary until Yjs sync-init overwrites it.
	let lastLoadedCaseId = -1;
	$effect(() => {
		const id = case_id;
		if (!Number.isFinite(id) || id === lastLoadedCaseId) return;
		lastLoadedCaseId = id;

		counts = { assets: 0, iocs: 0, tasks: 0, evidence: 0 };
		countsLoaded = false;
		myTasks = [];
		contributors = [];
		caseDescription = '';
		baseDescription = '';

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
	<title>#{case_id} - Summary</title>
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
		<!--
		  VISUAL TEST (full-bleed): the summary is the only surface on this
		  page now — the greeting strip that used to sit above it is gone, and
		  the two things worth keeping from it (section counts, who's on the
		  case) moved into the summary header below. `grow` lets that surface
		  fill the workspace vertically.
		-->
		<div class="flex w-full grow flex-col bg-card">
			<!-- Case summary card -->
			<section class="flex min-h-0 grow flex-col bg-card text-card-foreground">
				<!--
				  No title on the left: this header used to repeat the case name,
				  which the case topbar directly above already shows. The space
				  goes to the section counts and the people-on-case signal
				  instead — the only parts of the old greeting strip that carried
				  information.
				-->
				<header
					class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-5 py-2.5"
				>
					<div class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
						<!-- Inline section counts — each chip links to its section -->
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

						<div class="hidden h-6 w-px shrink-0 bg-border/60 sm:block" aria-hidden="true"></div>

						<div class="flex min-w-0 items-center gap-2 text-xs">
							<div
								class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400"
							>
								<UsersIcon size={12} />
							</div>
							<div class="flex min-w-0 items-center gap-2">
								<span class="whitespace-nowrap font-medium">
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

						<!--
						  Kept from the old greeting strip, but compacted: the row is
						  denser here, so the first task's title moved into the
						  tooltip instead of trailing the label inline.
						-->
						{#if myTasks.length > 0}
							<button
								type="button"
								onclick={() => goto(`/case/${case_id}/tasks`)}
								class="group inline-flex min-w-0 items-center gap-2 rounded-md text-left text-xs transition-colors hover:bg-muted/50"
								title={myTasks.map((t) => t.task_title).join('\n')}
							>
								<div
									class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400"
								>
									<ClipboardListIcon size={12} />
								</div>
								<span class="whitespace-nowrap font-medium">
									{myTasks.length} task{myTasks.length === 1 ? '' : 's'} for you
								</span>
								<ArrowRightIcon
									size={11}
									class="shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
								/>
							</button>
						{/if}
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

							{#if canEdit}
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
							{/if}
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
				  Closing note, full-width between the tools bar and the summary
				  editor. The topbar chip only carries a one-line teaser; a
				  post-mortem is the thing you most want to read first on a
				  closed case, so it gets real estate here rather than a popover.

				  Rendered whenever a note exists, not only when closed: reopening
				  preserves the note, and an open case carrying one still needs to
				  explain itself — the heading and palette shift to say so.
				-->
				{#if closingNote || (isClosed && canEdit)}
					<section
						class="shrink-0 border-b px-5 py-4 {isClosed
							? 'border-red-500/30 bg-red-50/70 dark:bg-red-950/20'
							: 'border-border/60 bg-muted/30'}"
					>
						<div class="mb-2 flex items-center justify-between gap-3">
							<h3
								class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide {isClosed
									? 'text-red-700 dark:text-red-300'
									: 'text-muted-foreground'}"
							>
								<FileLock2Icon size={13} />
								{isClosed ? 'Closing note' : 'Closing note (from a previous closure)'}
							</h3>

							{#if canEdit}
								<Button
									variant="ghost"
									size="xs"
									onclick={() => (cases.ui.closingNoteDialog = 'edit')}
								>
									{closingNote ? 'Edit' : 'Add'}
								</Button>
							{/if}
						</div>

						{#if closingNote}
							<!--
							  This section sits outside the editor's scroll container,
							  so an unbounded note would push the summary off screen.
							  Cap it and let the note scroll within itself instead.
							-->
							<div class="max-h-[40vh] overflow-y-auto">
								<!--
								  Type scale mirrors MarkDownEditor's ProseMirror class
								  (MarkDownEditor.svelte) so the note reads at the same
								  size as the summary directly beneath it. Left to its
								  own `prose prose-sm` defaults it renders noticeably
								  larger than everything around it.
								-->
								<MarkDownPreview
									markdown={closingNote}
									class="text-sm leading-normal [&>:first-child]:mt-0 [&_code]:text-xs [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_li]:text-sm [&_p]:text-sm [&_pre]:text-xs"
								/>
							</div>
						{:else}
							<p class="text-xs text-muted-foreground">
								This case was closed without recording why.
							</p>
						{/if}
					</section>
				{/if}

				<!--
				  VISUAL TEST (full-bleed): the editor body now takes whatever
				  height is left in the workspace (`grow` + `min-h-0`) instead
				  of a `max-h-[calc(100vh-…)]` guess, so the surface reaches the
				  bottom of the viewport. Long summaries still scroll WITHIN
				  this container rather than pushing the page off screen —
				  same behaviour as notes.
				-->
				<div class="min-h-0 grow overflow-y-auto p-5">
					<!--
					  SvelteKit reuses this page component when navigating between
					  two `[case_id]` routes, so the MarkDownEditor's Yjs binding
					  (captured with `untrack()` at construction) would stay wired
					  to the previous case-summary doc — the operator would see
					  the last case's description on the new case. Keying on
					  `case_id` forces a full remount, which tears down the old
					  provider and joins the new `case-summary:<id>` room.
					-->
					{#key case_id}
						<MarkDownEditor
							value={caseDescription}
							onChange={(v) => (caseDescription = v)}
							onSave={() => save()}
							caseId={case_id}
							{savedAt}
							onRemoteSave={handleRemoteSave}
							readOnly={!canEdit}
						/>
					{/key}
				</div>
			</section>
		</div>
	{:else}
		<div class="flex h-32 w-full items-center justify-center text-sm text-muted-foreground">
			Loading…
		</div>
	{/if}
</CaseWorkspace>
