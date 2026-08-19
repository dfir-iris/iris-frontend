<!--
  Kanban view of the case tasks, one column per configured task status.

  Full-width by design — the tasks layout swaps out the sidebar/detail
  split for this, which is why the view mode lives on the shared context.
  Dragging a card writes `task_status_id`; nothing else about the task is
  touched.

  Unlike the sidebar, this loads every page up front (capped): a board
  that only shows the first 20 of 300 tasks reads as "these are all the
  tasks", which is worse than being slow.
-->
<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { RefreshCwIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import type { Task } from '$lib/types/resources/task';
	import type { TaskStatus } from '$lib/types/resources/task';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import { CaseTasksService } from '$lib/services/case-tasks.service';
	import TaskKanbanBoard from '$lib/components/common/tasks/TaskKanbanBoard.svelte';
	import type { KanbanColumn } from '$lib/components/common/tasks/kanban-types';
	import AssigneesCell from '$lib/components/common/tasks/AssigneesCell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { AdvancedSearch, type SearchCondition } from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import TaskDetailDialog from '../[task_id]/TaskDetailDialog.svelte';
	import TaskViewSwitcher from './task-view-switcher.svelte';
	import { matchesTask, taskSearchFields } from '../helpers';

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);

	const caseId = $derived(Number(page.params.case_id));

	// Ceiling on the up-front load. Past this the board keeps a manual
	// "Load more" so a case with thousands of tasks can't wedge the tab.
	const MAX_AUTOLOAD = 500;

	let statuses = $state<TaskStatus[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);

	let dialogTaskId = $state<number | null>(null);
	let dialogOpen = $state(false);

	const allTasks = $derived(
		caseTasks.list.ids.map((id) => caseTasks.byId[id]).filter((t): t is Task => !!t)
	);

	const displayTasks = $derived(
		allTasks.filter((t) => matchesTask(t, searchTerm.trim(), searchConditions))
	);

	const columns = $derived<KanbanColumn[]>(
		statuses.map((s) => ({ id: s.id, title: s.status_name, bscolor: s.status_bscolor }))
	);

	const appendPage = async (pageNumber: number) => {
		const previousIds = [...caseTasks.list.ids];
		await caseTasks.listPaginated({ page: pageNumber }, { fetch });
		caseTasks.list.ids = [...new Set([...previousIds, ...caseTasks.list.ids])];
	};

	const loadAll = async () => {
		loading = true;
		try {
			await caseTasks.listPaginated({ page: 1 }, { fetch });
			while (caseTasks.list.nextPage !== null && caseTasks.list.ids.length < MAX_AUTOLOAD) {
				await appendPage(caseTasks.list.currentPage + 1);
			}
		} finally {
			loading = false;
		}
	};

	const loadMore = async () => {
		if (caseTasks.list.nextPage === null || loadingMore) return;
		loadingMore = true;
		try {
			await appendPage(caseTasks.list.currentPage + 1);
		} finally {
			loadingMore = false;
		}
	};

	const loadStatuses = async () => {
		const res = await TaskStatusService.list({ fetch });
		if (res.ok && Array.isArray(res.data)) statuses = res.data;
	};

	onMount(() => {
		loadStatuses();
		loadAll();
	});

	/**
	 * The case task update is a PUT over the whole row and the schema
	 * requires `task_title`, `task_status_id` and `task_assignees_id`, so
	 * a status change has to resend the rest of the task unchanged.
	 */
	const assigneeIds = (task: Task): number[] =>
		task.task_assignees_id ?? (task.task_assignees ?? []).map((a) => a.id);

	/**
	 * Goes through the service rather than `caseTasks.patchTask` on
	 * purpose: on failure `patchTask` refetches one page and returns the
	 * optimistically-merged row, so a rejected move is indistinguishable
	 * from a successful one *and* the board silently collapses to that
	 * page. A drag needs an unambiguous answer, so this keeps the raw
	 * response and writes the confirmed row back into the cache itself.
	 */
	const moveTask = async (task: Task, statusId: number | null) => {
		// Case tasks always carry a status, so the board never renders a
		// null column and this can only be a real status id.
		if (statusId === null) return;

		const res = await CaseTasksService.update(
			caseId,
			task.id,
			{
				task_title: task.task_title,
				task_description: task.task_description ?? '',
				task_status_id: statusId,
				task_assignees_id: assigneeIds(task),
				task_tags: task.task_tags ?? ''
			},
			{ fetch }
		);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			caseTasks.byId[task.id] = res.data;
			return;
		}

		toast({
			title: 'Could not move task',
			description: res.error?.message ?? 'The status change was not saved.',
			variant: 'destructive'
		});
	};

	const openTask = (task: Task) => {
		dialogTaskId = task.id;
		dialogOpen = true;
	};

	const tagList = (task: Task): string[] =>
		(task.task_tags ?? '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
</script>

<div class="flex h-full min-h-0 flex-col gap-2 p-2">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Tasks</h2>
		<span class="text-xs text-muted-foreground">
			{displayTasks.length} of {caseTasks.list.total}
		</span>

		<div class="ml-auto flex items-center gap-2">
			<TaskViewSwitcher
				value={caseTasks.ui.viewMode}
				onSelect={(mode) => (caseTasks.ui.viewMode = mode)}
			/>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={loadAll} aria-label="Refresh">
							<RefreshCwIcon size={16} class={loading ? 'animate-spin' : ''} />
						</Button>
					</TooltipTrigger>
					<TooltipContent align="center" side="bottom">Refresh</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

	<AdvancedSearch
		placeholder="Search tasks..."
		bind:value={searchTerm}
		bind:conditions={searchConditions}
		fields={taskSearchFields}
	/>

	{#if loading}
		<div class="flex flex-1 gap-3">
			{#each Array(4) as _}
				<Skeleton class="h-full w-72 shrink-0 rounded-lg" />
			{/each}
		</div>
	{:else if columns.length === 0}
		<p class="p-4 text-sm text-muted-foreground">
			No task statuses are configured, so there is nothing to lay the board out by.
		</p>
	{:else}
		<div class="min-h-0 flex-1">
			<TaskKanbanBoard
				{columns}
				items={displayTasks}
				idOf={(t) => t.id}
				columnIdOf={(t) => t.task_status_id}
				onMove={moveTask}
				onActivate={openTask}
				card={taskCard}
			/>
		</div>

		{#if caseTasks.list.nextPage !== null}
			<div
				class="flex items-center justify-center gap-2 border-t pt-2 text-2xs text-muted-foreground"
			>
				<span>
					Showing {allTasks.length} of {caseTasks.list.total} tasks
				</span>
				<Button variant="outline" size="xs" onclick={loadMore} disabled={loadingMore}>
					{loadingMore ? 'Loading…' : 'Load more'}
				</Button>
			</div>
		{/if}
	{/if}
</div>

{#snippet taskCard(task: Task)}
	<p class="line-clamp-2 text-xs font-medium">{task.task_title}</p>

	<div class="mt-1 flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
		<span>#{task.id}</span>
		{#each tagList(task) as tag}
			<span class="rounded bg-muted px-1">#{tag}</span>
		{/each}
	</div>

	{#if task.task_assignees?.length}
		<div class="mt-1.5">
			<AssigneesCell assignees={task.task_assignees} />
		</div>
	{/if}
{/snippet}

{#if dialogTaskId !== null}
	<TaskDetailDialog {caseId} taskId={dialogTaskId} bind:open={dialogOpen} />
{/if}
