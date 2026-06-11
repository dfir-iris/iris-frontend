<script lang="ts">
	import { ClipboardList } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { Task, TaskAssignee } from '$lib/types/resources/task';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import { TagDisplay } from '$lib/components/common/tag';
	import Chip from '$lib/components/common/MarkDown/Chip.svelte';
	import { current_user } from '$lib/stores/auth.store';

	type Props = {
		task: Task;
		isSelected?: boolean;
	};

	let { task, isSelected = false }: Props = $props();

	const hasTags = $derived(Boolean(task.task_tags?.trim()));
	const currentUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);
	const isMine = $derived(
		currentUserId !== null &&
			(task.task_assignees ?? []).some((a) => a.id === currentUserId)
	);

	const labelFor = (a: TaskAssignee) =>
		currentUserId !== null && a.id === currentUserId ? 'You' : a.name || a.user;
</script>

<div
	id={`task-card-${task.id}`}
	class={cn(
		'group relative w-full overflow-hidden rounded-lg border p-2.5 text-sm transition-colors duration-150',
		isSelected
			? 'border-l-4 border-l-primary border-primary/40 bg-primary/10 text-foreground shadow-sm'
			: isMine
				? 'border-l-4 border-l-amber-500 border-amber-500/40 bg-amber-500/[0.06] hover:bg-amber-500/10 dark:bg-amber-500/[0.08]'
				: 'border-border/60 bg-card hover:border-border hover:bg-muted/40'
	)}
>
	<div class="flex items-start justify-between gap-2">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<div
				class={cn(
					'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
					isSelected ? 'bg-primary/20' : isMine ? 'bg-amber-500/20' : 'bg-muted'
				)}
			>
				<ClipboardList
					size={14}
					class={cn(
						isSelected
							? 'text-primary'
							: isMine
								? 'text-amber-600 dark:text-amber-400'
								: 'text-muted-foreground'
					)}
				/>
			</div>

			<div class="min-w-0 flex-1">
				<span class="line-clamp-2 text-base font-semibold">{task.task_title}</span>

				{#if task.task_assignees?.length}
					<div class="mt-1 flex flex-wrap items-center gap-1">
						{#each task.task_assignees as assignee (assignee.id)}
							<Chip
								kind="user"
								id={assignee.id}
								label={labelFor(assignee)}
								title={assignee.name || assignee.user}
							/>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		{#if task.status}
			<StatusBadge status={task.status.status_name as CaseStatus} />
		{/if}
	</div>

	{#if task.task_open_date || hasTags}
		<div class="mt-1.5 flex flex-wrap items-center gap-1">
			<span class="text-xs text-muted-foreground">{task.task_open_date}</span>

			{#if hasTags}
				<TagDisplay tags={task.task_tags} size="small" />
			{/if}
		</div>
	{/if}
</div>
