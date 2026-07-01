<!--
  Task detail route page. The actual panel UI lives in TaskDetailView so the
  same content can be rendered inside a modal (TaskDetailDialog) reached from
  mention chips in the markdown editor.
-->
<script lang="ts">
	import { fade } from 'svelte/transition';
	import { SearchIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import TaskDetailView from './TaskDetailView.svelte';

	const caseId = $derived(Number(page.params.case_id));
	const taskId = $derived(Number(page.params.task_id));

	const handleAfterDelete = () => {
		goto(`/case/${caseId}/tasks`, { replaceState: true });
	};
</script>

<svelte:head>
	<title>#{caseId} - Task #{taskId}</title>
</svelte:head>

{#if Number.isFinite(taskId)}
	<TaskDetailView {caseId} {taskId} onAfterDelete={handleAfterDelete} />
{:else}
	<div in:fade class="flex h-full flex-col items-center justify-center text-center">
		<SearchIcon class="mb-4 h-16 w-16 text-muted-foreground/50" />

		<h2 class="mb-2 text-xl font-semibold text-muted-foreground">Task Not Found</h2>

		<p class="text-muted-foreground">
			Please select a task from the list on the left, or try refreshing the page.
		</p>

		<Button
			variant="outline"
			class="mt-6"
			onclick={() => goto(`/case/${caseId}/tasks`, { replaceState: true })}
		>
			Go to Tasks List
		</Button>
	</div>
{/if}
