<script lang="ts">
	import ActivityHistory from '$lib/components/common/ActivityHistory.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { Note } from '$lib/types/resources/note';

	type Props = {
		open: boolean;
		onClose: () => void;
		note?: Note;
	};

	let { open = $bindable(), onClose, note }: Props = $props();
</script>

<Dialog.Root
	bind:open
	onOpenChange={(open) => {
		if (!open) {
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[80vh] max-w-[980px] flex-col p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Note revisions</Dialog.Title>
		</Dialog.Header>

		<div class="flex-1 overflow-auto p-8">
			{#if note && note.modification_history}
				<ActivityHistory modificationHistory={note.modification_history} entityType="alert" />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
