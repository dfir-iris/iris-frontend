<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { WarRoomNoteFolderTreeNode } from '$lib/contexts/war-room-notes.context.svelte';
	import NotesTree from './notes-tree.svelte';
	import type { ContextMenuSource } from '../types';

	type Props = {
		open: boolean;
		itemType: ContextMenuSource;
		tree: WarRoomNoteFolderTreeNode[];

		onSubmit: (folderId: number | null) => void;
		onCancel: () => void;
	};

	let { open = $bindable(), itemType, tree, onSubmit, onCancel }: Props = $props();

	let selectedFolderId = $state<number | null>(null);

	const handleSubmit = async () => {
		onSubmit(selectedFolderId);
	};

	const title = $derived(`Move ${itemType}`);
</script>

<Dialog.Root
	bind:open
	onOpenChange={(open) => {
		if (!open) onCancel();
	}}
>
	<Dialog.Content class="p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title>{title}</Dialog.Title>
		</Dialog.Header>

		<div class="px-6 text-sm text-muted-foreground">Select destination folder</div>

		<div class="overflow-auto px-4 pb-4">
			{#each tree as folder (folder.id)}
				<NotesTree
					{folder}
					selectable
					selectedFolderId={selectedFolderId ?? undefined}
					onSelectFolder={(id) => (selectedFolderId = id)}
					onClickFolder={() => {}}
					onContextMenu={() => {}}
				/>
			{/each}
		</div>

		<Dialog.Footer class="justify-end gap-2 px-6 pb-6 pt-2">
			<Button variant="outline" onclick={onCancel}>Cancel</Button>

			<Button variant="default" onclick={handleSubmit}>Move</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
