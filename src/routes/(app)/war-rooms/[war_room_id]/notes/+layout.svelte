<!--
  War-room notes shell. Mirror of `case/[case_id]/notes/+layout.svelte`:
  a resizable pane with the tree sidebar on the left, and whatever the
  child route (landing page or a note detail) wants to render on the right.

  Structural differences vs the case-side layout:
    * Uses `WarRoomNotesContext` (folder_id / title / content shape).
    * No server-side search yet — the sidebar search bar filters the
      in-memory `list.tree` client-side. Case notes hit /notes/search,
      which the war-room REST doesn't expose; adding it later would
      just be a service method + `searchNotes` reducer.
    * Every user with war-room access is currently write-capable, so
      `canEdit` is always true here. If a read-only role appears we
      wire the same check used by case-access.context.
-->
<script lang="ts">
	import { setContext, type Snippet, onDestroy } from 'svelte';
	import { FilePlusIcon, FolderPlusIcon, FileText, SearchIcon, XIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from '$lib/stores/toast.store';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import {
		WAR_ROOM_NOTES_CTX,
		createWarRoomNotesContext,
		type WarRoomNotesContext,
		type WarRoomNoteFolderTreeNode
	} from '$lib/contexts/war-room-notes.context.svelte';
	import type { ContextMenu, ContextMenuSource } from './types';
	import NotesTree, { type DragItem } from './components/notes-tree.svelte';
	import NotesContextMenu from './components/notes-context-menu.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import NotesRenameDialog from './components/notes-rename-dialog.svelte';
	import NotesMoveItemDialog from './components/notes-move-item-dialog.svelte';
	import { getNoteUrl, newNote } from './helpers';
	import NotesNewFolderDialog from './components/notes-new-folder-dialog.svelte';

	let { children }: { children: Snippet } = $props();

	const notes = createWarRoomNotesContext(() => Number(page.params.war_room_id));
	setContext<WarRoomNotesContext>(WAR_ROOM_NOTES_CTX, notes);

	const canEdit = true;

	let showNewFolder = $state<boolean>(false);
	let showConfirmDelete = $state<boolean>(false);
	let showRename = $state<boolean>(false);
	let showMove = $state<boolean>(false);

	let dragItem = $state<DragItem | null>(null);
	let dragOverFolderId = $state<number | null>(null);

	let searchTerm = $state('');

	// In-memory client-side filter — the war-room REST doesn't have a
	// dedicated search endpoint (case notes do). Every note is already
	// in the context via `byId`, so filtering by title+content is a
	// cheap derived. If we ever add a server-side search endpoint,
	// replace this with a debounced call into `notes.searchNotes(term)`.
	const searchResults = $derived.by(() => {
		const q = searchTerm.trim().toLowerCase();
		if (!q) return [];
		return notes.list.noteIds
			.map((id) => notes.byId[id])
			.filter(
				(n): n is NonNullable<typeof n> =>
					!!n && (n.title.toLowerCase().includes(q) || (n.content ?? '').toLowerCase().includes(q))
			);
	});

	const folderNameById = $derived.by(() => {
		const out: Record<number, string> = {};
		for (const id of notes.list.folderIds) {
			const folder = notes.foldersById[id];
			if (folder) out[id] = folder.name;
		}
		return out;
	});

	const clearSearch = () => {
		searchTerm = '';
	};

	const openSearchResult = (noteId: number, folderId?: number | null) => {
		if (folderId != null) notes.selectFolder(folderId);
		notes.selectNote(noteId);
		goto(getNoteUrl(noteId));
	};

	let contextMenu = $state<ContextMenu>({
		open: false,
		x: 0,
		y: 0
	});

	const defaultSidebarSize = 22;
	const minSidebarSize = 12;
	const maxSidebarSize = 50;

	let loadedWarRoomId = $state<number | null>(null);

	$effect(() => {
		const warRoomId = Number(page.params.war_room_id);

		if (!Number.isFinite(warRoomId)) {
			notes.reset();
			loadedWarRoomId = null;
			return;
		}

		// Only reload the tree when the war room actually changes.
		// Navigating between notes within the same war room keeps
		// `page.params.war_room_id` stable but still fires this effect;
		// we don't want to wipe and refetch on every hop.
		if (warRoomId === loadedWarRoomId) return;

		// Reset the tree synchronously on a room switch so the sidebar
		// doesn't flash the previous room's notes while `loadTree()` is
		// in flight. Skip on the initial run — the tree is already empty.
		if (loadedWarRoomId !== null) {
			notes.reset();
		}
		loadedWarRoomId = warRoomId;
		notes.loadTree();
	});

	onDestroy(() => notes.reset());

	const clickFolder = (folderId: number) => {
		notes.selectFolder(folderId);
		notes.selectNote(undefined);
	};

	const closeContextMenu = () => {
		contextMenu.open = false;
		contextMenu.x = 0;
		contextMenu.y = 0;
	};

	const openContextMenu = (
		event: MouseEvent,
		source: ContextMenuSource,
		name: string,
		folderId: number,
		noteId?: number
	) => {
		event.preventDefault();

		if (source === 'note') {
			notes.selectNote(noteId);
			contextMenu.noteId = noteId;
		} else {
			notes.selectNote(undefined);
			contextMenu.noteId = undefined;
		}

		notes.selectFolder(folderId);

		contextMenu.open = true;
		contextMenu.x = event.clientX;
		contextMenu.y = event.clientY;
		contextMenu.source = source;
		contextMenu.folderId = folderId;
		contextMenu.name = name;
	};

	const newFolder = async (name = 'New Folder') => {
		showNewFolder = false;
		closeContextMenu();

		await notes.createFolder({
			name,
			parent_id: notes.ui.selectedFolderId
		});
	};

	const renameItem = (name: string) => {
		if (contextMenu.source === 'folder' && contextMenu.folderId) {
			notes.patchFolder(contextMenu.folderId, { name });
		}

		if (contextMenu.source === 'note' && contextMenu.noteId) {
			notes.patchNote(contextMenu.noteId, { title: name });
		}

		showRename = false;
	};

	const moveItem = (folderId: number | null) => {
		if (contextMenu.source === 'folder' && contextMenu.folderId) {
			notes.patchFolder(contextMenu.folderId, { parent_id: folderId });
		}

		if (contextMenu.source === 'note' && contextMenu.noteId) {
			notes.patchNote(contextMenu.noteId, { folder_id: folderId });
		}

		showMove = false;
	};

	const deleteItem = async () => {
		if (contextMenu.source === 'folder' && contextMenu.folderId) {
			if (await notes.removeFolder(contextMenu.folderId)) {
				toast({ title: 'Folder deleted', variant: 'success' });
			} else {
				toast({
					title: 'Failed to delete folder',
					description: notes.mutation.error ?? 'The folder is still in this war room.',
					variant: 'destructive'
				});
			}
		}

		if (contextMenu.source === 'note' && contextMenu.noteId) {
			if (await notes.removeNote(contextMenu.noteId)) {
				toast({ title: 'Note deleted', variant: 'success' });
			} else {
				toast({
					title: 'Failed to delete note',
					description: notes.mutation.error ?? 'The note is still in this war room.',
					variant: 'destructive'
				});
			}
		}
	};

	const clearDrag = () => {
		dragItem = null;
		dragOverFolderId = null;
	};

	const findFolder = (
		folders: WarRoomNoteFolderTreeNode[],
		folderId: number
	): WarRoomNoteFolderTreeNode | undefined => {
		for (const folder of folders) {
			if (folder.id === folderId) return folder;
			const nested = findFolder(folder.subfolders ?? [], folderId);
			if (nested) return nested;
		}
		return undefined;
	};

	const containsFolder = (folder: WarRoomNoteFolderTreeNode, folderId: number): boolean => {
		for (const subfolder of folder.subfolders ?? []) {
			if (subfolder.id === folderId || containsFolder(subfolder, folderId)) {
				return true;
			}
		}
		return false;
	};

	const dropOnFolder = async (targetFolderId: number) => {
		if (!dragItem) return;

		if (dragItem.type === 'note') {
			// targetFolderId 0 is the synthetic root-notes pseudo-folder;
			// mapping that to null moves the note to the war-room root.
			const folderId = targetFolderId === 0 ? null : targetFolderId;
			await notes.patchNote(dragItem.id, { folder_id: folderId });
			clearDrag();
			return;
		}

		if (dragItem.id === targetFolderId) {
			clearDrag();
			return;
		}

		// Moving a folder onto the root pseudo-folder means "move to root".
		if (targetFolderId === 0) {
			await notes.patchFolder(dragItem.id, { parent_id: null });
			clearDrag();
			return;
		}

		const folder = findFolder(notes.list.tree, dragItem.id);
		if (folder && containsFolder(folder, targetFolderId)) {
			clearDrag();
			return;
		}

		await notes.patchFolder(dragItem.id, { parent_id: targetFolderId });
		clearDrag();
	};
</script>

<svelte:document onclick={closeContextMenu} />

<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
	<Resizable.Pane
		defaultSize={defaultSidebarSize}
		minSize={minSidebarSize}
		maxSize={maxSidebarSize}
		class="relative flex h-full min-h-0 flex-col border-r border-border/50"
	>
		<div class="flex flex-row items-center gap-1 px-3 pb-2 pt-3">
			<h2 class="w-full text-lg font-semibold">Notes</h2>

			{#if canEdit}
				<Button
					variant="ghost"
					size="icon"
					aria-label="Add folder"
					title="New folder"
					class="h-8 w-8"
					onclick={() => (showNewFolder = true)}
				>
					<FolderPlusIcon class="h-4 w-4" />
				</Button>

				<Button
					variant="ghost"
					size="icon"
					aria-label="Add note"
					title="New note"
					class="h-8 w-8"
					onclick={() => newNote(notes)}
				>
					<FilePlusIcon class="h-4 w-4" />
				</Button>
			{/if}
		</div>

		<div class="px-3 pb-2">
			<div class="relative">
				<SearchIcon
					class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<input
					type="text"
					placeholder="Search notes…"
					bind:value={searchTerm}
					class="h-9 w-full rounded-md border border-border/50 bg-background pl-7 pr-7 text-sm focus:border-ring focus:outline-none"
				/>
				{#if searchTerm}
					<button
						type="button"
						aria-label="Clear search"
						class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onclick={clearSearch}
					>
						<XIcon class="size-3.5" />
					</button>
				{/if}
			</div>
		</div>

		<div class="notes-tree-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-4">
			{#if searchTerm.trim()}
				{#if searchResults.length === 0}
					<div class="px-2 py-4 text-center text-xs text-muted-foreground">
						No notes match “{searchTerm}”
					</div>
				{:else}
					<ul class="space-y-0.5">
						{#each searchResults as note (note.note_id)}
							{@const folderName =
								note.folder_id != null ? folderNameById[note.folder_id] : undefined}
							<li>
								<button
									type="button"
									class="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 {notes
										.ui.selectedNoteId === note.note_id
										? 'bg-muted/80 font-medium'
										: ''}"
									onclick={() => openSearchResult(note.note_id, note.folder_id)}
								>
									<FileText
										class="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate">{note.title || 'Untitled note'}</span>
										{#if folderName}
											<span class="block truncate text-xs text-muted-foreground"
												>in {folderName}</span
											>
										{/if}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if notes.list.status === 'loading' && notes.list.tree.length === 0}
				<div class="space-y-2 px-2">
					<Skeleton class="h-7 w-full" />
					<Skeleton class="h-7 w-full" />
					<Skeleton class="h-7 w-full" />
				</div>
			{:else if notes.list.error}
				<div class="px-2 py-2 text-sm text-destructive">
					{notes.list.error}
				</div>
			{:else}
				{#each notes.list.tree as folder (folder.id)}
					<NotesTree
						{folder}
						onClickFolder={clickFolder}
						onContextMenu={openContextMenu}
						{dragItem}
						{dragOverFolderId}
						onDragStartFolder={(folderId) => (dragItem = { type: 'folder', id: folderId })}
						onDragStartNote={(noteId) => (dragItem = { type: 'note', id: noteId })}
						onDragEnd={clearDrag}
						onDragEnterFolder={(folderId) => (dragOverFolderId = folderId)}
						onDragLeaveFolder={(folderId) => {
							if (dragOverFolderId === folderId) {
								dragOverFolderId = null;
							}
						}}
						onDropOnFolder={dropOnFolder}
					/>
				{/each}
			{/if}
		</div>

		{#if contextMenu.open}
			<NotesContextMenu
				{contextMenu}
				{canEdit}
				onNewNote={() => {
					closeContextMenu();
					newNote(notes, contextMenu.folderId);
				}}
				onNewFolder={() => {
					closeContextMenu();
					showNewFolder = true;
				}}
				onCopyLink={(noteId?: number) => {
					navigator.clipboard
						.writeText(getNoteUrl(noteId))
						.then(() => {
							toast({ title: 'Link copied', variant: 'success' });
						})
						.catch((e) => {
							console.error('Clipboard copy error:', e);
							toast({ title: 'Could not copy link', variant: 'destructive' });
						});
				}}
				onCopyMdLink={(noteId?: number) => {
					const title =
						noteId != null && notes.byId[noteId]
							? notes.byId[noteId].title || `Note #${noteId}`
							: `Note #${noteId}`;
					navigator.clipboard
						.writeText(`[${title}](${getNoteUrl(noteId)})`)
						.then(() => {
							toast({ title: 'Link copied', variant: 'success' });
						})
						.catch((e) => {
							console.error('Clipboard copy error:', e);
							toast({ title: 'Could not copy link', variant: 'destructive' });
						});
				}}
				onRename={() => {
					closeContextMenu();
					showRename = true;
				}}
				onMove={() => {
					closeContextMenu();
					showMove = true;
				}}
				onDelete={() => {
					closeContextMenu();
					showConfirmDelete = true;
				}}
			/>
		{/if}
	</Resizable.Pane>

	<Resizable.Handle class="bg-transparent hover:bg-border" />

	<Resizable.Pane class="flex h-full min-h-0 flex-col overflow-hidden">
		{@render children()}
	</Resizable.Pane>
</Resizable.PaneGroup>

<NotesRenameDialog
	bind:open={showRename}
	initialValue={contextMenu.name}
	itemType={contextMenu.source ?? 'folder'}
	onSubmit={(value) => renameItem(value)}
	onCancel={() => (showRename = false)}
/>

<NotesMoveItemDialog
	bind:open={showMove}
	tree={notes.list.tree}
	itemType={contextMenu.source ?? 'folder'}
	onSubmit={moveItem}
	onCancel={() => (showMove = false)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={deleteItem}
	onCancel={() => (showConfirmDelete = false)}
/>

<NotesNewFolderDialog
	bind:open={showNewFolder}
	onSubmit={(name) => newFolder(name)}
	onCancel={() => (showNewFolder = false)}
/>

<style>
	.notes-tree-scroll {
		scrollbar-width: thin;
		scrollbar-color: transparent transparent;
		transition: scrollbar-color 0.2s ease;
	}

	.notes-tree-scroll:hover {
		scrollbar-color: hsl(var(--muted-foreground) / 0.35) transparent;
	}

	.notes-tree-scroll::-webkit-scrollbar {
		width: 6px;
	}

	.notes-tree-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.notes-tree-scroll::-webkit-scrollbar-thumb {
		background-color: transparent;
		border-radius: 999px;
		transition: background-color 0.2s ease;
	}

	.notes-tree-scroll:hover::-webkit-scrollbar-thumb {
		background-color: hsl(var(--muted-foreground) / 0.35);
	}

	.notes-tree-scroll::-webkit-scrollbar-thumb:hover {
		background-color: hsl(var(--muted-foreground) / 0.55);
	}

	:global(.resizable-handle) {
		position: relative;
	}

	:global(.resizable-handle[data-resize-handle-active]) {
		background-color: var(--muted-foreground);
	}
</style>
