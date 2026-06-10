<!--
  Modal wrapper around NoteDetailView. Reuses the exact same UI as the right
  pane of the notes list — no duplicated rendering. Used by mention chips in
  the markdown editor.

  Heads-up: when this dialog is opened from inside another MarkDownEditor
  (e.g. clicking a note mention while writing a different note), you get two
  editors mounted at once. Each has its own collab socket and works fine
  independently — they just happen to render in the same DOM.
-->
<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import NoteDetailView from './NoteDetailView.svelte';

	let {
		caseId,
		noteId,
		open = $bindable(false)
	}: {
		caseId: number;
		noteId: number;
		open?: boolean;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[80vh] max-h-[90vh] max-w-[1100px] flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-3">
			<Dialog.Title class="text-base font-medium">Note</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-hidden">
			{#if open}
				<NoteDetailView {caseId} {noteId} onAfterDelete={() => (open = false)} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
