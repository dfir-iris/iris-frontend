<script lang="ts">
	import { ClipboardList } from 'lucide-svelte';
	import type { Task, TaskAssignee } from '$lib/types/resources/task';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import EntityRow from '$lib/components/common/EntityRow.svelte';
	import Chip from '$lib/components/common/MarkDown/Chip.svelte';
	import { current_user } from '$lib/stores/auth.store';

	type Props = {
		task: Task;
		isSelected?: boolean;
	};

	let { task, isSelected = false }: Props = $props();

	const currentUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);
	const isMine = $derived(
		currentUserId !== null && (task.task_assignees ?? []).some((a) => a.id === currentUserId)
	);

	const labelFor = (a: TaskAssignee) =>
		currentUserId !== null && a.id === currentUserId ? 'You' : a.name || a.user;
</script>

<EntityRow
	id={`task-card-${task.id}`}
	title={task.task_title}
	Icon={ClipboardList}
	{isSelected}
	accent={isMine ? 'warning' : 'none'}
	tags={task.task_tags ?? []}
>
	{#snippet badges()}
		{#if task.status}
			<StatusBadge status={task.status.status_name as CaseStatus} />
		{/if}
	{/snippet}

	{#snippet meta()}
		{#if task.task_assignees?.length}
			<span class="flex flex-wrap items-center gap-1">
				{#each task.task_assignees as assignee (assignee.id)}
					<Chip
						kind="user"
						id={assignee.id}
						label={labelFor(assignee)}
						title={assignee.name || assignee.user}
					/>
				{/each}
			</span>
		{/if}

		{#if task.task_open_date}
			<span class="whitespace-nowrap">{task.task_open_date}</span>
		{/if}
	{/snippet}
</EntityRow>
