<script lang="ts">
	import type { TaskAssignee } from '$lib/types/resources/task';
	import Chip from '$lib/components/common/MarkDown/Chip.svelte';
	import { current_user } from '$lib/stores/auth.store';

	let { assignees }: { assignees: TaskAssignee[] | null | undefined } = $props();

	const currentUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);

	const labelFor = (a: TaskAssignee) =>
		currentUserId !== null && a.id === currentUserId ? 'You' : a.name || a.user;
</script>

{#if assignees && assignees.length > 0}
	<div class="flex flex-wrap items-center gap-1">
		{#each assignees as assignee (assignee.id)}
			<Chip
				kind="user"
				id={assignee.id}
				label={labelFor(assignee)}
				title={assignee.name || assignee.user}
			/>
		{/each}
	</div>
{:else}
	<span class="text-muted-foreground">-</span>
{/if}
