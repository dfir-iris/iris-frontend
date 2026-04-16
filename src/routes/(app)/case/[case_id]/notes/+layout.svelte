<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
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
	import type { ContextMenu, ContextMenuSource } from './types';
	import NotesTree from './components/notes-tree.svelte';
	import NotesContextMenu from './components/notes-context-menu.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import NotesRenameDialog from './components/notes-rename-dialog.svelte';
	import NotesMoveItemDialog from './components/notes-move-item-dialog.svelte';
	import { getNoteUrl, newNote } from './helpers';

	let { children }: { children: Snippet } = $props();

	const notes = createCaseNotesContext(() => Number(page.params.case_id));

	setContext<CaseNotesContext>(CASE_NOTES_CTX, notes);

	let showConfirmDelete = $state<boolean>(false);
	let showRename = $state<boolean>(false);
	let showMove = $state<boolean>(false);

	let contextMenu = $state<ContextMenu>({
		open: false,
		x: 0,
		y: 0
	});

	$effect(() => {
		const caseId = Number(page.params.case_id);

		if (!Number.isFinite(caseId)) {
			notes.reset();
			return;
		}

		void notes.loadTree();

		return () => notes.reset();
	});

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

	const newFolder = async (parentId?: number) => {
		closeContextMenu();

		await notes.createFolder({
			name: 'New folder',
			parent_id: parentId
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
</script>

<svelte:document onclick={closeContextMenu} />

<div class="flex h-full w-full flex-row overflow-hidden">
	<div class="relative flex h-full min-h-0 w-1/4 max-w-[250px] flex-col border-r">
		<div class="flex flex-row items-center gap-2 px-4 pb-2 pt-4">
			<h2 class="w-full">Notes</h2>

			<Button
				variant="ghost"
				size="icon"
				aria-label="Add folder"
				onclick={() => newFolder(notes.ui.selectedFolderId)}
			>
				<FolderPlusIcon />
			</Button>

			<Button variant="ghost" size="icon" aria-label="Add note" onclick={() => newNote(notes)}>
				<FilePlusIcon />
			</Button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
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
					<NotesTree {folder} onClickFolder={clickFolder} onContextMenu={openContextMenu} />
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
				onNewFolder={newFolder}
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

	<div class="h-full w-full overflow-hidden p-8">
		<div class="flex h-full w-full flex-col rounded border bg-background shadow">
			{@render children()}
		</div>
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
