<!--
  Modal wrapper around TaskDetailView. Reuses the exact same UI as the right
  pane of the task list — no duplicated rendering. Used by mention chips in
  the markdown editor.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import TaskDetailView from './TaskDetailView.svelte';

	let {
		caseId,
		taskId,
		open = $bindable(false)
	}: {
		caseId: number;
		taskId: number;
		open?: boolean;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[80vh] max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-3">
			<Dialog.Title class="text-base font-medium">Task details</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-hidden">
			{#if open}
				<TaskDetailView {caseId} {taskId} onAfterDelete={() => (open = false)} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
