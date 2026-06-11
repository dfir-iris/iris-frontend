<!--
  Modal wrapper around EvidenceDetailView. Reuses the exact same UI as the right
  pane of the evidence list — no duplicated rendering. Used by mention chips in
  the markdown editor.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import EvidenceDetailView from './EvidenceDetailView.svelte';

	let {
		caseId,
		evidenceId,
		open = $bindable(false)
	}: {
		caseId: number;
		evidenceId: number;
		open?: boolean;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[80vh] max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-3">
			<Dialog.Title class="text-base font-medium">Evidence details</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-hidden">
			{#if open}
				<EvidenceDetailView {caseId} {evidenceId} onAfterDelete={() => (open = false)} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
