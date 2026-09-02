<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon, CheckSquareIcon, DownloadCloudIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import { CaseTasksService, type ListCaseTasksParams } from '$lib/services/case-tasks.service';
	import type { Task, TaskStatus } from '$lib/types/resources/task';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import { AVAILABLE_TASK_EXPORT_COLUMNS, convertTasksToCSV } from '$lib/utils/task.utils';
	import TaskCard from '$lib/components/common/tasks/TaskCard.svelte';
	import TaskDataTable from '$lib/components/common/tasks/TaskDataTable.svelte';
	import { Button } from '$lib/components/ui/button';
	import { AdvancedSearch, type SearchCondition } from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import TaskViewSwitcher from './task-view-switcher.svelte';
	import { matchesTask, taskSearchFields } from '../helpers';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { ChevronDownIcon } from 'lucide-svelte';
	import { TaskStatusService } from '$lib/services/task-status.service';
	import { CaseService, type CaseAccessUserRow } from '$lib/services/case.service';

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer: HTMLDivElement | null = null;

	let selectionMode = $state(false);
	let selectedTasks = $state<Set<number>>(new Set());
	let showConfirmDelete = $state(false);
	let isBulkWorking = $state(false);

	// Reference data for bulk-edit dropdowns
	let taskStatuses = $state<TaskStatus[]>([]);
	let caseUsers = $state<CaseAccessUserRow[]>([]);

	const viewMode = $derived(caseTasks.ui.viewMode);

	const displayTasks = $derived(
		caseTasks.list.ids
			.map((id) => caseTasks.byId[id])
			.filter((t): t is Task => !!t)
			.filter((t) => matchesTask(t, searchTerm.trim(), searchConditions))
	);

	const selectedTaskId = $derived(page.params.task_id ? Number(page.params.task_id) : null);
	const selectedCount = $derived(selectedTasks.size);

	const refreshTasks = async (pageNumber = 1) => {
		if (isRefreshing) return;

		isRefreshing = true;

		try {
			const params: ListCaseTasksParams = {
				page: pageNumber,
				per_page: caseTasks.list.params.per_page
			};
			await caseTasks.listPaginated(params, { fetch });
		} finally {
			isRefreshing = false;
		}
	};

	const loadMore = async () => {
		if (caseTasks.list.nextPage === null || isLoading) return;

		isLoading = true;

		try {
			const previousIds = [...caseTasks.list.ids];
			await caseTasks.listPaginated(
				{ page: caseTasks.list.currentPage + 1, per_page: caseTasks.list.params.per_page },
				{ fetch }
			);
			caseTasks.list.ids = [...new Set([...previousIds, ...caseTasks.list.ids])];
		} finally {
			isLoading = false;

			requestAnimationFrame(() => {
				if (!loadMoreTrigger || !scrollContainer) return;
				if (caseTasks.list.nextPage === null) return;

				const rootRect = scrollContainer.getBoundingClientRect();
				const triggerRect = loadMoreTrigger.getBoundingClientRect();
				const prefetchPx = rootRect.height;

				if (triggerRect.top < rootRect.bottom + prefetchPx) {
					loadMore();
				}
			});
		}
	};

	const setupObserver = () => {
		observer?.disconnect();

		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{
				root: scrollContainer,
				rootMargin: '100% 0px 100% 0px',
				threshold: 0
			}
		);

		setTimeout(() => {
			if (loadMoreTrigger) observer?.observe(loadMoreTrigger);
		}, 0);
	};

	const handleTriggerRef = (node: HTMLDivElement) => {
		loadMoreTrigger = node;
		observer?.observe(node);

		return { destroy: () => observer?.unobserve(node) };
	};

	const handleScrollContainerRef = (node: HTMLDivElement) => {
		scrollContainer = node;
		setupObserver();

		return {
			destroy: () => {
				scrollContainer = null;
			}
		};
	};

	const toggleTaskSelection = (taskId: number) => {
		if (selectedTasks.has(taskId)) {
			selectedTasks.delete(taskId);
		} else {
			selectedTasks.add(taskId);
		}
		selectedTasks = new Set(selectedTasks);
	};

	const selectAll = () => {
		selectedTasks = new Set(displayTasks.map((t) => t.id));
	};

	const cancelSelect = () => {
		selectionMode = false;
		selectedTasks = new Set();
	};

	const deleteSelected = async () => {
		if (!selectedCount) { showConfirmDelete = false; return; }
		isBulkWorking = true;
		const ids = [...selectedTasks];
		await Promise.all(ids.map((id) => caseTasks.removeTask(id)));
		isBulkWorking = false;
		showConfirmDelete = false;
		cancelSelect();
		await refreshTasks(1);
	};

	const setTaskStatus = async (statusId: number) => {
		if (!selectedCount) return;
		isBulkWorking = true;
		const ids = [...selectedTasks];
		await Promise.all(ids.map((id) => caseTasks.patchTask(id, { task_status_id: statusId })));
		isBulkWorking = false;
		cancelSelect();
		await refreshTasks(caseTasks.list.currentPage);
	};

	const setAssignee = async (userId: number) => {
		if (!selectedCount) return;
		isBulkWorking = true;
		const ids = [...selectedTasks];
		await Promise.all(ids.map((id) => caseTasks.patchTask(id, { task_assignees_id: [userId] })));
		isBulkWorking = false;
		cancelSelect();
		await refreshTasks(caseTasks.list.currentPage);
	};

	const openTask = (taskId: number) => goto(`/case/${page.params.case_id}/tasks/${taskId}`);

	let showDownloadModal = $state(false);
	let isDownloading = $state(false);

	const downloadCountVisible = $derived(
		selectionMode && selectedTasks.size > 0 ? selectedTasks.size : displayTasks.length
	);
	const downloadCountAll = $derived(caseTasks.list.total);

	const handleDownloadConfirm = async (
		downloadType: 'visible' | 'all',
		selectedColumnKeys: Set<string>
	) => {
		isDownloading = true;

		try {
			const columns = AVAILABLE_TASK_EXPORT_COLUMNS.filter((c) => selectedColumnKeys.has(c.key));
			let rows: Task[];

			if (downloadType === 'visible' && selectionMode && selectedTasks.size > 0) {
				rows = displayTasks.filter((t) => selectedTasks.has(t.id));
			} else if (downloadType === 'visible') {
				rows = displayTasks;
			} else {
				rows = [];
				let pageNumber = 1;
				let nextPage: number | null = 1;

				while (nextPage !== null) {
					const params: ListCaseTasksParams = { page: pageNumber, per_page: 100 };
					const res = await CaseTasksService.list(Number(page.params.case_id), params, { fetch });
					if (!res.ok || res.error || !res.data || typeof res.data === 'string') break;
					rows.push(...res.data.data);
					nextPage = res.data.next_page;
					pageNumber = nextPage ?? pageNumber;
				}
			}

			const csv = convertTasksToCSV(rows, columns);
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `case-${page.params.case_id}-tasks.csv`;
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			isDownloading = false;
			showDownloadModal = false;
		}
	};

	onMount(async () => {
		await refreshTasks(1);
		setupObserver();

		const [statusRes, users] = await Promise.all([
			TaskStatusService.list(),
			CaseService.listUsers(Number(page.params.case_id))
		]);
		if (statusRes.ok && Array.isArray(statusRes.data)) taskStatuses = statusRes.data as TaskStatus[];
		caseUsers = users;
	});

	onDestroy(() => {
		observer?.disconnect();
	});

	$effect(() => {
		if (selectedTaskId !== null) return;
		if (displayTasks.length === 0) return;

		const first = displayTasks[0];
		if (first) openTask(first.id);
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-2 p-2">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Tasks</h2>

		<div class="ml-auto flex items-center gap-2">
			{#if !selectionMode && viewMode !== 'board'}
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<Button size="icon" variant="ghost" onclick={() => (selectionMode = true)}>
								<CheckSquareIcon size={16} />
							</Button>
						</TooltipTrigger>
						<TooltipContent align="center" side="bottom">Select</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			{/if}

			<TaskViewSwitcher
				value={viewMode}
				onSelect={(mode) => {
					caseTasks.ui.viewMode = mode;
					if (mode === 'board') cancelSelect();
					// See assets-sidebar: card view accumulates pages via
					// infinite scroll; table view expects exactly one
					// server page at a time. The board loads its own pages.
					if (mode !== 'board') refreshTasks(1);
				}}
			/>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => refreshTasks(1)}>
							<RefreshCwIcon size={16} class={isRefreshing ? 'animate-spin' : ''} />
						</Button>
					</TooltipTrigger>
					<TooltipContent align="center" side="bottom">Refresh</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => (showDownloadModal = true)}>
							<DownloadCloudIcon size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent align="center" side="bottom">Download as CSV</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

	{#if selectionMode}
		<div class="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 py-1.5">
			<span class="text-xs text-muted-foreground">{selectedCount} selected</span>

			<Button size="xs" variant="outline" onclick={selectAll}>Select All</Button>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button size="xs" variant="outline" disabled={!selectedCount || isBulkWorking || !taskStatuses.length}>
						Set Status <ChevronDownIcon size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{#each taskStatuses as s}
						<DropdownMenuItem onclick={() => setTaskStatus(s.id)}>{s.status_name}</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button size="xs" variant="outline" disabled={!selectedCount || isBulkWorking || !caseUsers.length}>
						Assign <ChevronDownIcon size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" class="max-h-60 overflow-y-auto">
					{#each caseUsers as u}
						<DropdownMenuItem onclick={() => setAssignee(u.user_id ?? u.id ?? 0)}>{u.user_name}</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				size="xs"
				variant="destructive"
				disabled={!selectedCount || isBulkWorking}
				onclick={() => (showConfirmDelete = true)}
			>
				Delete
			</Button>

			<Button size="xs" variant="ghost" onclick={cancelSelect} class="ml-auto">Cancel</Button>
		</div>
	{/if}

	<AdvancedSearch
		placeholder="Search tasks..."
		bind:value={searchTerm}
		bind:conditions={searchConditions}
		fields={taskSearchFields}
	/>

	<div class="min-h-0 flex-1">
		{#if viewMode === 'table'}
			<TaskDataTable
				className="h-full w-full"
				tasks={displayTasks}
				caseId={page.params.case_id}
				tablePage={caseTasks.list.currentPage}
				totalPages={caseTasks.list.lastPage}
				perPage={caseTasks.list.params.per_page}
				{selectionMode}
				{selectedTasks}
				onToggleSelect={toggleTaskSelection}
				on:pageChange={(e) => refreshTasks(e.detail.page)}
				on:pageSizeChange={(e) => {
					caseTasks.list.params.per_page = e.detail.pageSize;
					refreshTasks(1);
				}}
			/>
		{:else}
			<div use:handleScrollContainerRef class="-mx-2 flex h-full min-h-0 flex-col overflow-y-auto">
				{#each displayTasks as task (task.id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => {
							if (selectionMode) {
								toggleTaskSelection(task.id);
							} else {
								openTask(task.id);
							}
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (selectionMode) {
									toggleTaskSelection(task.id);
								} else {
									openTask(task.id);
								}
							}
						}}
					>
						{#if selectionMode}
							<div class="flex items-center gap-2 px-2">
								<input
									type="checkbox"
									class="size-4 shrink-0 cursor-pointer accent-primary"
									checked={selectedTasks.has(task.id)}
									onclick={(e) => { e.stopPropagation(); toggleTaskSelection(task.id); }}
									onchange={() => {}}
								/>
								<div class="min-w-0 flex-1">
									<TaskCard {task} isSelected={selectedTaskId === task.id} />
								</div>
							</div>
						{:else}
							<TaskCard {task} isSelected={selectedTaskId === task.id} />
						{/if}
					</div>
				{/each}

				<div use:handleTriggerRef class="flex h-20 shrink-0 items-center justify-center">
					{#if isLoading}
						<Skeleton class="h-8 w-8 rounded-full" />
					{:else if caseTasks.list.nextPage !== null}
						<Button onclick={loadMore}>Load More</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<DownloadModal
	open={showDownloadModal}
	title="Download Tasks as CSV"
	itemNounPlural="tasks"
	availableColumns={AVAILABLE_TASK_EXPORT_COLUMNS}
	countVisible={downloadCountVisible}
	countAll={downloadCountAll}
	isProcessing={isDownloading}
	processingMessage="Fetching all tasks…"
	onConfirm={handleDownloadConfirm}
	onOpenChange={(v) => (showDownloadModal = v)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Delete Tasks"
	message="Delete {selectedCount} selected task{selectedCount === 1 ? '' : 's'}? This cannot be undone."
	confirmText="Delete"
	onConfirm={deleteSelected}
/>
