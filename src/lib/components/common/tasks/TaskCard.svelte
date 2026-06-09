<script lang="ts">
	import { ClipboardList, Tag } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import type { Task } from '$lib/types/resources/task';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import { TagDisplay } from '$lib/components/common/tag';

	type Props = {
		task: Task;
		isSelected?: boolean;
	};

	let { task, isSelected = false }: Props = $props();

	const hasTags = $derived(Boolean(task.task_tags?.trim()));
	const assigneeNames = $derived(
		task.task_assignees?.map((a) => a.name || a.user).join(', ') ?? ''
	);
</script>

<div
	id={`task-card-${task.id}`}
	class={cn(
		'group w-full rounded-xl border p-3 text-sm transition-all duration-200 ease-in-out',
		isSelected ? 'border-primary/30 bg-accent text-accent-foreground' : 'bg-background'
	)}
>
	<div class="flex items-start justify-between gap-3">
		<div class="flex min-w-0 flex-1 items-center gap-2">
			<div
				class={cn(
					'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
					isSelected ? 'bg-primary/20' : 'bg-muted'
				)}
			>
				<ClipboardList
					size={16}
					class={cn(isSelected ? 'text-primary' : 'text-muted-foreground')}
				/>
			</div>

			<div class="min-w-0 flex-1">
				<span class="line-clamp-2 text-base font-semibold">{task.task_title}</span>

				{#if assigneeNames}
					<div class="truncate text-xs text-muted-foreground">{assigneeNames}</div>
				{/if}
			</div>
		</div>

		{#if task.status}
			<StatusBadge status={task.status.status_name as CaseStatus} />
		{/if}
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2">
		<span class="text-xs text-muted-foreground">{task.task_open_date}</span>

		{#if hasTags}
			<TagDisplay tags={task.task_tags} size="small" />
		{/if}
	</div>
</div>
