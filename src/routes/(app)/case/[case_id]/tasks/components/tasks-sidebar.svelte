<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CASE_TASKS_CTX, type CaseTasksContext } from '$lib/contexts/case-tasks.context.svelte';
	import type { ListCaseTasksParams } from '$lib/services/case-tasks.service';
	import type { Task } from '$lib/types/resources/task';
	import { Button } from '$lib/components/ui/button';
	import {
		AdvancedSearch,
		type SearchField,
		type SearchCondition
	} from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';

	const caseTasks = getContext<CaseTasksContext>(CASE_TASKS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;

	const searchFields: SearchField[] = [
		{ key: 'task_title', label: 'Title', type: 'text' },
		{ key: 'task_description', label: 'Description', type: 'text' },
		{ key: 'task_tags', label: 'Tags', type: 'text' },
		{ key: 'id', label: 'Task ID', type: 'number' }
	];

	const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

	const conditionMatchesTask = (task: Task, c: SearchCondition): boolean => {
		const q = c.value.toLowerCase();

		if (c.field === '_raw') {
			return (
				norm(task.task_title).includes(q) ||
				norm(task.task_description).includes(q) ||
				norm(task.task_tags).includes(q)
			);
		}

		const fieldValue = (() => {
			switch (c.field) {
				case 'task_title':
					return norm(task.task_title);
				case 'task_description':
					return norm(task.task_description);
				case 'task_tags':
					return norm(task.task_tags);
				case 'id':
					return String(task.id);
				default:
					return '';
			}
		})();

		switch (c.operator) {
			case 'like':
				return fieldValue.includes(q);
			case 'eq':
				return fieldValue === q;
			case 'not':
				return fieldValue !== q;
			default:
				return true;
		}
	};

	const matchesTask = (task: Task, term: string, conditions: SearchCondition[]): boolean => {
		if (!term && conditions.length === 0) return true;

		if (conditions.length > 0) {
			return conditions.every((c) => conditionMatchesTask(task, c));
		}

		const q = term.toLowerCase();
		return (
			norm(task.task_title).includes(q) ||
			norm(task.task_description).includes(q) ||
			norm(task.task_tags).includes(q)
		);
	};

	const displayTasks = $derived(
		caseTasks.list.ids
			.map((id) => caseTasks.byId[id])
			.filter((t): t is Task => !!t)
			.filter((t) => matchesTask(t, searchTerm.trim(), searchConditions))
	);

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
		}
	};

	const handleTriggerRef = (node: HTMLDivElement) => {
		loadMoreTrigger = node;
		observer?.observe(node);

		return { destroy: () => observer?.unobserve(node) };
	};

	const openTask = (taskId: number) => goto(`/case/${page.params.case_id}/tasks/${taskId}`);

	onMount(async () => {
		await refreshTasks(1);

		observer = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting) loadMore();
		});

		setTimeout(() => {
			if (loadMoreTrigger) observer?.observe(loadMoreTrigger);
		});
	});

	onDestroy(() => {
		observer?.disconnect();
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-3 p-3">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Tasks</h2>

		<div class="ml-auto flex items-center gap-2">
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
		fields={searchFields}
	/>

	<div class="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
		{#each displayTasks as task (task.id)}
			<button
				class="flex w-full flex-col gap-1 rounded-md border bg-card p-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => openTask(task.id)}
			>
				<div class="flex items-start justify-between gap-2">
					<span class="line-clamp-2 text-sm font-medium">{task.task_title}</span>

					{#if task.status}
						<StatusBadge status={task.status.status_name as CaseStatus} />
					{/if}
				</div>

				<span class="text-xs text-muted-foreground">{task.task_open_date}</span>
			</button>
		{/each}

		<div use:handleTriggerRef class="flex h-20 shrink-0 items-center justify-center">
			{#if isLoading}
				<Skeleton class="h-8 w-8 rounded-full" />
			{:else if caseTasks.list.nextPage !== null}
				<Button onclick={loadMore}>Load More</Button>
			{/if}
		</div>
	</div>
</div>
