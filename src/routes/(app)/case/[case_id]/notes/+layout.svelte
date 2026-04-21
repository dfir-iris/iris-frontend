<script lang="ts">
	import { setContext, type Snippet, onDestroy } from 'svelte';
	import { FilePlusIcon, FolderPlusIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { toast } from '$lib/stores/toast.store';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import type { NoteFolder } from '$lib/types/resources/note';
	import type { ContextMenu, ContextMenuSource } from './types';
	import NotesTree, { type DragItem } from './components/notes-tree.svelte';
	import NotesContextMenu from './components/notes-context-menu.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import NotesRenameDialog from './components/notes-rename-dialog.svelte';
	import NotesMoveItemDialog from './components/notes-move-item-dialog.svelte';
	import { getNoteUrl, newNote } from './helpers';
	import NotesNewFolderDialog from './components/notes-new-folder-dialog.svelte';

	let { children }: { children: Snippet } = $props();

	const notes = createCaseNotesContext(() => Number(page.params.case_id));

	setContext<CaseNotesContext>(CASE_NOTES_CTX, notes);

	let previousCaseId = $state<number | null>(null);

	let showNewFolder = $state<boolean>(false);
	let showConfirmDelete = $state<boolean>(false);
	let showRename = $state<boolean>(false);
	let showMove = $state<boolean>(false);

	let dragItem = $state<DragItem | null>(null);
	let dragOverFolderId = $state<number | null>(null);

	let contextMenu = $state<ContextMenu>({
		open: false,
		x: 0,
		y: 0
	});

	$effect(() => {
		const caseId = Number(page.params.case_id);

		if (!Number.isFinite(caseId)) {
			notes.reset();
			previousCaseId = null;

			return;
		}

		if (previousCaseId !== caseId) {
			previousCaseId = caseId;
			notes.loadTree();
		}
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
			notes.patchNote(contextMenu.noteId, { note_title: name });
		}

		showRename = false;
	};

	const moveItem = (folderId: number | null) => {
		if (contextMenu.source === 'folder' && contextMenu.folderId) {
			notes.patchFolder(contextMenu.folderId, { parent_id: folderId ?? undefined });
		}

		if (contextMenu.source === 'note' && contextMenu.noteId) {
			notes.patchNote(contextMenu.noteId, { directory_id: folderId ?? undefined });
		}

		showMove = false;
	};

	const deleteItem = () => {
		if (contextMenu.source === 'folder' && contextMenu.folderId) {
			notes.removeFolder(contextMenu.folderId);
		}

		if (contextMenu.source === 'note' && contextMenu.noteId) {
			notes.removeNote(contextMenu.noteId);
		}
	};

	const clearDrag = () => {
		dragItem = null;
		dragOverFolderId = null;
	};

	const findFolder = (folders: NoteFolder[], folderId: number): NoteFolder | undefined => {
		for (const folder of folders) {
			if (folder.id === folderId) {
				return folder;
			}

			return findFolder(folder.subdirectories ?? [], folderId);
		}
	};

	const containsFolder = (folder: NoteFolder, folderId: number): boolean => {
		for (const subfolder of folder.subdirectories ?? []) {
			if (subfolder.id === folderId || containsFolder(subfolder, folderId)) {
				return true;
			}
		}

		return false;
	};

	const dropOnFolder = async (targetFolderId: number) => {
		if (!dragItem) {
			return;
		}

		if (dragItem.type === 'note') {
			await notes.patchNote(dragItem.id, { directory_id: targetFolderId });

			clearDrag();

			return;
		}

		if (dragItem.id === targetFolderId) {
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

<div class="flex h-full w-full flex-row overflow-hidden">
	<div class="relative flex h-full min-h-0 w-1/4 max-w-[250px] flex-col border-r">
		<div class="flex flex-row items-center gap-2 px-4 pt-4">
			<h2 class="w-full">Notes</h2>

			<Button
				variant="ghost"
				size="icon"
				aria-label="Add folder"
				onclick={() => (showNewFolder = true)}
			>
				<FolderPlusIcon />
			</Button>

			<Button variant="ghost" size="icon" aria-label="Add note" onclick={() => newNote(notes)}>
				<FilePlusIcon />
			</Button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-4 py-2">
			{#if notes.list.status === 'loading' && notes.list.tree.length === 0}
				<div class="space-y-2 px-4">
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-8 w-full" />
				</div>
			{:else if notes.list.error}
				<div class="px-4 py-2 text-sm text-destructive">
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
							toast({
								title: 'Link copied',
								variant: 'success'
							});
						})
						.catch((e) => {
							console.error('Clipboard copy error:', e);

							toast({
								title: 'Could not copy link',
								variant: 'destructive'
							});
						});
				}}
				onCopyMdLink={(noteId?: number) => {
					navigator.clipboard
						.writeText(`[<i class="fa-solid fa-bell"></i> #25](${getNoteUrl(noteId)})`)
						.then(() => {
							toast({
								title: 'Link copied',
								variant: 'success'
							});
						})
						.catch((e) => {
							console.error('Clipboard copy error:', e);

							toast({
								title: 'Could not copy link',
								variant: 'destructive'
							});
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
	</div>

	<div class="h-full w-full overflow-auto bg-background">
		{@render children()}
	</div>
</div>

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
