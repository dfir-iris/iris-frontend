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
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import { current_user } from '$lib/stores/auth.store';
	import type { Case } from '$lib/types/resources/case';
	import type { Task } from '$lib/types/resources/task';
	import { ApiService } from '$lib/services/api.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { getInitials } from '$lib/utils';

	const cases = getContext<CasesContext>(CASES_CTX);
	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);
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
			caseAssets.listPaginated({ per_page: 1 }, { fetch }),
			caseIocs.listPaginated({ per_page: 1 }, { fetch }),
			caseTasks.listPaginated({ per_page: 1 }, { fetch }),
			caseEvidences.listPaginated({ per_page: 1 }, { fetch })
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

	// People who have done something in this case, sourced from the legacy
	// /case/activities/list endpoint. No v2 equivalent exists yet; the list
	// is naturally bounded (40 most recent activities) so it's cheap.
	type ActivityRow = {
		user_name?: string;
		name?: string;
		activity_date?: string;
		activity_desc?: string;
	};

	type Contributor = {
		name: string;
		lastSeen: Date | null;
		count: number;
	};

	let myTasks = $state<Task[]>([]);
	let contributors = $state<Contributor[]>([]);

	const loadMyTasks = async () => {
		const userId = $current_user?.user_id ?? $current_user?.id;
		if (!userId) {
			myTasks = [];
			return;
		}

		const res = await CaseTasksService.list(case_id, { per_page: 50 }, { fetch });
		if (!res.ok || res.error || !res.data || typeof res.data === 'string') {
			myTasks = [];
			return;
		}

		myTasks = res.data.data.filter((task) =>
			(task.task_assignees_id ?? []).includes(Number(userId))
		);
	};

	const loadContributors = async () => {
		const res = await ApiService.get<ActivityRow[]>(
			`/api/v2/cases/${case_id}/activities`,
			{ fetch }
		);
		if (!res.ok || res.error || !Array.isArray(res.data)) {
			contributors = [];
			return;
		}

		const map = new Map<string, Contributor>();
		for (const row of res.data) {
			const name = (row.user_name ?? row.name ?? '').trim();
			if (!name) continue;

			const seenAt = row.activity_date ? new Date(row.activity_date) : null;
			const existing = map.get(name);
			if (existing) {
				existing.count += 1;
				if (seenAt && (!existing.lastSeen || seenAt > existing.lastSeen)) {
					existing.lastSeen = seenAt;
				}
			} else {
				map.set(name, { name, lastSeen: seenAt, count: 1 });
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
			count: caseAssets.list.total,
			Icon: ComputerIcon,
			href: `/case/${case_id}/assets`,
			accent: 'text-sky-600 dark:text-sky-400'
		},
		{
			label: 'IOCs',
			count: caseIocs.list.total,
			Icon: BiohazardIcon,
			href: `/case/${case_id}/iocs`,
			accent: 'text-rose-600 dark:text-rose-400'
		},
		{
			label: 'Tasks',
			count: caseTasks.list.total,
			Icon: ClipboardListIcon,
			href: `/case/${case_id}/tasks`,
			accent: 'text-amber-600 dark:text-amber-400'
		},
		{
			label: 'Evidence',
			count: caseEvidences.list.total,
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

		void Promise.all([
			caseAssets.listPaginated({ per_page: 1 }, { fetch }),
			caseIocs.listPaginated({ per_page: 1 }, { fetch }),
			caseTasks.listPaginated({ per_page: 1 }, { fetch }),
			caseEvidences.listPaginated({ per_page: 1 }, { fetch }),
			loadMyTasks(),
			loadContributors()
		]);
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

<div class="flex w-full flex-col gap-4 p-4">
	{#if currentCase}
		<!-- Warm welcome strip -->
		<section
			class="flex flex-col gap-4 rounded-xl border border-border/60 bg-card px-5 py-4 shadow-elevation-1 md:flex-row md:items-center md:gap-6"
		>
			<!-- Greeting -->
			<div class="min-w-0 md:flex-1">
				<h2 class="text-base font-semibold leading-tight">
					{greeting(now)}, {firstName}
				</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Welcome back to the investigation.
				</p>
			</div>

			<!-- Info row, anchored right -->
			<div
				class="flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:gap-0 md:border-l md:border-t-0 md:pl-6 md:pt-0"
			>
				<!-- Your tasks -->
				<button
					type="button"
					onclick={() => goto(`/case/${case_id}/tasks`)}
					class="group flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 sm:min-w-[14rem] sm:max-w-xs"
				>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"
					>
						<ClipboardListIcon size={16} />
					</div>

					<div class="min-w-0 flex-1">
						{#if myTasks.length === 0}
							<p class="text-sm font-medium leading-tight">No tasks for you</p>
							<p class="truncate text-xs text-muted-foreground">Clear runway.</p>
						{:else}
							<p class="text-sm font-medium leading-tight">
								{myTasks.length} task{myTasks.length === 1 ? '' : 's'} for you
							</p>
							<p class="truncate text-xs text-muted-foreground">
								{myTasks[0].task_title}{myTasks.length > 1
									? ` • +${myTasks.length - 1} more`
									: ''}
							</p>
						{/if}
					</div>

					<ArrowRightIcon
						size={14}
						class="shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground"
					/>
				</button>

				<div class="hidden h-8 w-px shrink-0 bg-border/60 sm:block sm:mx-2"></div>

				<!-- People involved -->
				<div
					class="flex min-w-0 items-center gap-3 px-2 py-1.5 sm:min-w-[12rem] sm:max-w-xs"
				>
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400"
					>
						<UsersIcon size={16} />
					</div>

					<div class="min-w-0 flex-1">
						{#if contributors.length === 0}
							<p class="text-sm font-medium leading-tight">No activity yet</p>
							<p class="truncate text-xs text-muted-foreground">
								Be the first to make a move.
							</p>
						{:else}
							<p class="text-sm font-medium leading-tight">
								{contributors.length} {contributors.length === 1 ? 'person' : 'people'} on case
							</p>
							<div class="mt-1 flex items-center gap-2">
								<div class="flex -space-x-1.5">
									{#each contributors.slice(0, 5) as contributor (contributor.name)}
										<Avatar class="h-5 w-5 border-2 border-card">
											<AvatarFallback
												class="bg-muted text-[10px] font-medium"
												title={contributor.name}
											>
												{getInitials(contributor.name)}
											</AvatarFallback>
										</Avatar>
									{/each}
								</div>

								{#if contributors.length > 5}
									<span class="text-xs text-muted-foreground">
										+{contributors.length - 5}
									</span>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>

		<!-- Stat tiles -->
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{#each stats as stat}
				<button
					type="button"
					onclick={() => goto(stat.href)}
					class="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-4 py-3 text-left shadow-elevation-1 transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-elevation-2"
				>
					<div class="min-w-0">
						<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{stat.label}
						</p>
						<p class="mt-0.5 text-2xl font-bold tabular-nums {stat.accent}">
							{stat.count}
						</p>
					</div>

					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60 transition-transform group-hover:scale-110 {stat.accent}"
					>
						<stat.Icon size={18} />
					</div>
				</button>
			{/each}
		</div>

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
						<p class="text-xs text-muted-foreground">
							Shared case brief — paint the picture so the team can dive in.
						</p>
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

			<div class="p-5">
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
	{:else}
		<div class="flex h-32 items-center justify-center text-sm text-muted-foreground">
			Loading…
		</div>
	{/if}
</div>
