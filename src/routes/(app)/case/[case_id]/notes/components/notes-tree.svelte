<script lang="ts">
	import { FileTextIcon, FolderIcon, FolderOpenIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type { Note, NoteFolder } from '$lib/types/resources/note';
	import Self from './notes-tree.svelte';
	import type { ContextMenuSource } from '../types';

	type Props = {
		folder: NoteFolder;
		onClickFolder: (folderId: number) => void;
		onContextMenu: (
			event: MouseEvent,
			source: ContextMenuSource,
			name: string,
			directoryId: number,
			noteId?: number
		) => void;
		selectable?: boolean;
		selectedFolderId?: number;
		onSelectFolder?: (folderId: number) => void;
	};

	let {
		folder,
		onClickFolder,
		onContextMenu,
		selectable = false,
		selectedFolderId,
		onSelectFolder
	}: Props = $props();

	let open = $state(true);

	const subdirectories = $derived(folder.subdirectories ?? []);
	const notes = $derived(folder.notes ?? []);

	const getNoteId = (note: Note): number => note.note_id;
	const getNoteTitle = (note: Note): string => note.note_title;
</script>

<Button
	onclick={() => {
		if (selectable) {
			onSelectFolder?.(folder.id);
			return;
		}

		onClickFolder(folder.id);
		open = !open;
	}}
	oncontextmenu={(event) => {
		if (selectable) return;
		onContextMenu(event, 'folder', folder.name, folder.id);
	}}
	variant="ghost"
	class="w-full justify-start gap-x-1.5 px-4 {selectedFolderId === folder.id ? 'bg-accent' : ''}"
>
	{@const Icon = open ? FolderOpenIcon : FolderIcon}
	<Icon />
	<span class="truncate">{folder.name}</span>
</Button>

{#if open}
	<div class="pl-4">
		{#each subdirectories as subfolder (subfolder.id)}
			<Self
				{onClickFolder}
				{onContextMenu}
				{selectable}
				{selectedFolderId}
				{onSelectFolder}
				folder={subfolder}
			/>
		{/each}

		{#if !selectable}
			{#each notes as note (getNoteId(note))}
				<Button
					variant="ghost"
					class="w-full justify-start gap-x-1.5"
					href="/case/{page.params.case_id}/notes/{getNoteId(note)}"
					oncontextmenu={(event) =>
						onContextMenu(event, 'note', note.note_title, folder.id, getNoteId(note))}
				>
					<FileTextIcon />
					<span class="truncate">{getNoteTitle(note)}</span>
				</Button>
			{/each}
		{/if}
	</div>
{/if}
