<script lang="ts" module>
	export type DragItem = { type: 'note'; id: number } | { type: 'folder'; id: number };
</script>

<script lang="ts">
	import { FileLockIcon, FileTextIcon, FolderIcon, FolderOpenIcon, LockIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type { Note, NoteFolder } from '$lib/types/resources/note';
	import Self from './notes-tree.svelte';
	import type { ContextMenuSource } from '../types';
	import { isLockedNoteFolder, isMirroredNote } from '$lib/utils/note-mirror';

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
		/** Set by the parent when an ancestor is a locked mirror folder. */
		inLockedFolder?: boolean;
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
		onDropOnFolder,
		inLockedFolder = false
	}: Props = $props();

	let open = $state(true);

	const subdirectories = $derived(folder.subdirectories ?? []);
	const notes = $derived(folder.notes ?? []);
	const isDropTarget = $derived(dragOverFolderId === folder.id);
	const isDraggedFolder = $derived(dragItem?.type === 'folder' && dragItem.id === folder.id);

	const getNoteId = (note: Note): number => note.note_id;
	const getNoteTitle = (note: Note): string => note.note_title;

	// "War room · <name>" directories hold read-only mirrors: no drag,
	// no drop, no rename/delete. Everything under them is locked too.
	const locked = $derived(inLockedFolder || isLockedNoteFolder(folder));
	const isNoteLocked = (note: Note): boolean => locked || isMirroredNote(note);
</script>

<Button
	draggable={!selectable && !locked}
	ondragstart={() => {
		if (!locked) onDragStartFolder?.(folder.id);
	}}
	ondragend={() => onDragEnd?.()}
	ondragenter={(event) => {
		if (selectable || locked) return;

		event.preventDefault();
		event.stopPropagation();
		onDragEnterFolder?.(folder.id);
	}}
	ondragover={(event) => {
		if (selectable || locked) return;

		event.preventDefault();
		event.stopPropagation();
		onDragEnterFolder?.(folder.id);
	}}
	ondragleave={(event) => {
		if (selectable || locked) return;

		event.stopPropagation();
		onDragLeaveFolder?.(folder.id);
	}}
	ondrop={(event) => {
		if (selectable || locked) return;

		event.preventDefault();
		event.stopPropagation();
		onDropOnFolder?.(folder.id);
	}}
	onclick={() => {
		if (selectable) {
			// A locked mirror folder is never a valid move destination.
			if (!locked) onSelectFolder?.(folder.id);
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
	size="sm"
	title={locked ? `${folder.name} (read-only, mirrored from a war room)` : folder.name}
	data-locked={locked ? 'true' : undefined}
	class="h-8 w-full justify-start gap-x-1.5 px-2 text-sm font-medium {selectedFolderId === folder.id
		? 'bg-accent'
		: ''} {!isDraggedFolder && isDropTarget ? 'bg-accent/50 ring-1 ring-primary' : ''}"
>
	{@const Icon = open ? FolderOpenIcon : FolderIcon}
	<Icon class="h-4 w-4 shrink-0 {locked ? 'text-red-600' : 'text-muted-foreground'}" />
	<span class="truncate">{folder.name}</span>
	{#if isLockedNoteFolder(folder)}
		<LockIcon class="ml-auto size-3 shrink-0 text-muted-foreground" aria-label="Locked" />
	{/if}
</Button>

{#if open}
	<div class="ml-2 border-l border-border/60 pl-1">
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
				inLockedFolder={locked}
				folder={subfolder}
			/>
		{/each}

		{#if !selectable}
			{#each notes as note (getNoteId(note))}
				{@const isActive = Number(page.params.note_id) === getNoteId(note)}
				{@const noteLocked = isNoteLocked(note)}
				<Button
					draggable={!noteLocked}
					ondragstart={() => {
						if (!noteLocked) onDragStartNote?.(getNoteId(note));
					}}
					ondragend={() => onDragEnd?.()}
					variant="ghost"
					size="sm"
					title={getNoteTitle(note)}
					class="h-8 w-full justify-start gap-x-1.5 px-2 text-sm font-normal {isActive
						? 'bg-accent text-accent-foreground'
						: ''}"
					href="/case/{page.params.case_id}/notes/{getNoteId(note)}"
					oncontextmenu={(event) =>
						onContextMenu(event, 'note', note.note_title, folder.id, getNoteId(note))}
				>
					{#if noteLocked}
						<FileLockIcon
							class="h-4 w-4 shrink-0 text-muted-foreground"
							aria-label="Read-only mirror"
						/>
					{:else}
						<FileTextIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
					{/if}
					<span class="truncate">{getNoteTitle(note)}</span>
				</Button>
			{/each}
		{/if}
	</div>
{/if}
