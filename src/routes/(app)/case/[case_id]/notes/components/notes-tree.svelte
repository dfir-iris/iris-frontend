<script lang="ts">
	import { FileTextIcon, FolderIcon, FolderOpenIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type { Note, NoteFolder } from '$lib/types/resources/note';
	import Self from './notes-tree.svelte';
	import type { ContextMenuSource } from '../types';

	export type DragItem = { type: 'note'; id: number } | { type: 'folder'; id: number };

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
		dragItem?: DragItem | null;
		dragOverFolderId?: number | null;
		onDragStartFolder?: (folderId: number) => void;
		onDragStartNote?: (noteId: number) => void;
		onDragEnd?: () => void;
		onDragEnterFolder?: (folderId: number) => void;
		onDragLeaveFolder?: (folderId: number) => void;
		onDropOnFolder?: (folderId: number) => void;
	};

	let {
		folder,
		onClickFolder,
		onContextMenu,
		selectable = false,
		selectedFolderId,
		onSelectFolder,
		dragItem = null,
		dragOverFolderId = null,
		onDragStartFolder,
		onDragStartNote,
		onDragEnd,
		onDragEnterFolder,
		onDragLeaveFolder,
		onDropOnFolder
	}: Props = $props();

	let open = $state(true);

	const subdirectories = $derived(folder.subdirectories ?? []);
	const notes = $derived(folder.notes ?? []);
	const isDropTarget = $derived(dragOverFolderId === folder.id);
	const isDraggedFolder = $derived(dragItem?.type === 'folder' && dragItem.id === folder.id);

	const getNoteId = (note: Note): number => note.note_id;
	const getNoteTitle = (note: Note): string => note.note_title;
</script>

<Button
	draggable={!selectable}
	ondragstart={() => onDragStartFolder?.(folder.id)}
	ondragend={() => onDragEnd?.()}
	ondragenter={(event) => {
		if (selectable) return;

		event.preventDefault();
		event.stopPropagation();
		onDragEnterFolder?.(folder.id);
	}}
	ondragover={(event) => {
		if (selectable) return;

		event.preventDefault();
		event.stopPropagation();
		onDragEnterFolder?.(folder.id);
	}}
	ondragleave={(event) => {
		if (selectable) return;

		event.stopPropagation();
		onDragLeaveFolder?.(folder.id);
	}}
	ondrop={(event) => {
		if (selectable) return;

		event.preventDefault();
		event.stopPropagation();
		onDropOnFolder?.(folder.id);
	}}
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
	class="w-full justify-start gap-x-1.5 px-4 {selectedFolderId === folder.id
		? 'bg-accent'
		: ''} {!isDraggedFolder && isDropTarget ? 'bg-accent/50 ring-1 ring-primary' : ''}"
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
				{dragItem}
				{dragOverFolderId}
				{onDragStartFolder}
				{onDragStartNote}
				{onDragEnd}
				{onDragEnterFolder}
				{onDragLeaveFolder}
				{onDropOnFolder}
				folder={subfolder}
			/>
		{/each}

		{#if !selectable}
			{#each notes as note (getNoteId(note))}
				<Button
					draggable={true}
					ondragstart={() => onDragStartNote?.(getNoteId(note))}
					ondragend={() => onDragEnd?.()}
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
