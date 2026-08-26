<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import type { ListCaseTasksParams } from '$lib/services/case-tasks.service';
	import type { Task } from '$lib/types/resources/task';
	import TaskCard from '$lib/components/common/tasks/TaskCard.svelte';
	import TaskDataTable from '$lib/components/common/tasks/TaskDataTable.svelte';
	import { Button } from '$lib/components/ui/button';
	import { AdvancedSearch, type SearchCondition } from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import TaskViewSwitcher from './task-view-switcher.svelte';
	import { matchesTask, taskSearchFields } from '../helpers';

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer: HTMLDivElement | null = null;

	const viewMode = $derived(caseTasks.ui.viewMode);

	const displayTasks = $derived(
		caseTasks.list.ids
			.map((id) => caseTasks.byId[id])
			.filter((t): t is Task => !!t)
			.filter((t) => matchesTask(t, searchTerm.trim(), searchConditions))
	);

	const selectedTaskId = $derived(page.params.task_id ? Number(page.params.task_id) : null);

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

	const openTask = (taskId: number) => goto(`/case/${page.params.case_id}/tasks/${taskId}`);

	onMount(async () => {
		await refreshTasks(1);
		setupObserver();
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
			<TaskViewSwitcher
				value={viewMode}
				onSelect={(mode) => {
					caseTasks.ui.viewMode = mode;
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
		</div>
	</div>

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
						onclick={() => openTask(task.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openTask(task.id);
							}
						}}
					>
						<TaskCard {task} isSelected={selectedTaskId === task.id} />
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
