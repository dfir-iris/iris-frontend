<script lang="ts" module>
	export type DragItem = { type: 'note'; id: number } | { type: 'folder'; id: number };
</script>

<script lang="ts">
	import { FileTextIcon, FolderIcon, FolderOpenIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type {
		WarRoomNote,
		WarRoomNoteFolder
	} from '$lib/services/war-room-notes.service';
	import type { WarRoomNoteFolderTreeNode } from '$lib/contexts/war-room-notes.context.svelte';
	import Self from './notes-tree.svelte';
	import type { ContextMenuSource } from '../types';

	type Props = {
		folder: WarRoomNoteFolderTreeNode;
		onClickFolder: (folderId: number) => void;
		onContextMenu: (
			event: MouseEvent,
			source: ContextMenuSource,
			name: string,
			folderId: number,
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

	const subfolders = $derived(folder.subfolders ?? []);
	const notes = $derived(folder.notes ?? []);
	const isDropTarget = $derived(dragOverFolderId === folder.id);
	const isDraggedFolder = $derived(dragItem?.type === 'folder' && dragItem.id === folder.id);
	// Root-notes pseudo-folder gets id 0 and no name. Rendered without
	// the folder header so root-level notes appear at the top-level.
	const isRootBucket = $derived(folder.id === 0);

	const getNoteId = (note: WarRoomNote): number => note.note_id;
	const getNoteTitle = (note: WarRoomNote): string => note.title;
</script>

{#if !isRootBucket}
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
		size="sm"
		title={folder.name}
		class="h-8 w-full justify-start gap-x-1.5 px-2 text-sm font-medium {selectedFolderId ===
		folder.id
			? 'bg-accent'
			: ''} {!isDraggedFolder && isDropTarget ? 'bg-accent/50 ring-1 ring-primary' : ''}"
	>
		{@const Icon = open ? FolderOpenIcon : FolderIcon}
		<Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
		<span class="truncate">{folder.name}</span>
	</Button>
{/if}

{#if open || isRootBucket}
	<div class={isRootBucket ? '' : 'ml-2 border-l border-border/60 pl-1'}>
		{#each subfolders as subfolder (subfolder.id)}
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
				{@const isActive = Number(page.params.note_id) === getNoteId(note)}
				<Button
					draggable={true}
					ondragstart={() => onDragStartNote?.(getNoteId(note))}
					ondragend={() => onDragEnd?.()}
					variant="ghost"
					size="sm"
					title={getNoteTitle(note)}
					class="h-8 w-full justify-start gap-x-1.5 px-2 text-sm font-normal {isActive
						? 'bg-accent text-accent-foreground'
						: ''}"
					href="/war-rooms/{page.params.war_room_id}/notes/{getNoteId(note)}"
					oncontextmenu={(event) =>
						onContextMenu(event, 'note', note.title, folder.id, getNoteId(note))}
				>
					<FileTextIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
					<span class="truncate">{getNoteTitle(note)}</span>
				</Button>
			{/each}
		{/if}
	</div>
{/if}
