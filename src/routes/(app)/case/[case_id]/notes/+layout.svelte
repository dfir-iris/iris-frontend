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
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import { getContext } from 'svelte';
	import type { NoteFolder } from '$lib/types/resources/note';
	import type { ContextMenu, ContextMenuSource } from './types';
	import NotesTree, { type DragItem } from './components/notes-tree.svelte';
	import NotesContextMenu from './components/notes-context-menu.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import NotesRenameDialog from './components/notes-rename-dialog.svelte';
	import NotesMoveItemDialog from './components/notes-move-item-dialog.svelte';
	import { getNoteUrl, newNote } from './helpers';
	import NotesNewFolderDialog from './components/notes-new-folder-dialog.svelte';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';

	let { children }: { children: Snippet } = $props();

	const notes = createCaseNotesContext(() => Number(page.params.case_id));
	const caseAccess = getContext<CaseAccessContext>(CASE_ACCESS_CTX);

	setContext<CaseNotesContext>(CASE_NOTES_CTX, notes);

	const canEdit = $derived(caseAccess?.canEdit() ?? false);

	let showNewFolder = $state<boolean>(false);
	let showConfirmDelete = $state<boolean>(false);
	let showRename = $state<boolean>(false);
	let showMove = $state<boolean>(false);

	let dragItem = $state<DragItem | null>(null);
	let dragOverFolderId = $state<number | null>(null);

	let searchTerm = $state('');
	let searchDebounceTimer: number | undefined;

	const searchResults = $derived(
		notes.list.searchResultIds
			.map((id) => notes.byId[id])
			.filter((n): n is NonNullable<typeof n> => !!n)
	);

	const folderNameById = $derived.by(() => {
		const out: Record<number, string> = {};
		for (const id of notes.list.directoryIds) {
			const folder = notes.foldersById[id];
			if (folder) out[id] = folder.name;
		}
		return out;
	});

	$effect(() => {
		const term = searchTerm;

		clearTimeout(searchDebounceTimer);

		searchDebounceTimer = window.setTimeout(() => {
			notes.searchNotes(term);
		}, 250);
	});

	const clearSearch = () => {
		searchTerm = '';
		notes.searchNotes('');
	};

	const openSearchResult = (noteId: number, directoryId?: number) => {
		if (directoryId !== undefined) notes.selectFolder(directoryId);
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

	let loadedCaseId = $state<number | null>(null);

	$effect(() => {
		const caseId = Number(page.params.case_id);

		if (!Number.isFinite(caseId)) {
			notes.reset();
			loadedCaseId = null;
			return;
		}

		// Only reload the tree when the case id actually changes. Navigating between
		// notes within the same case keeps `page.params.case_id` stable but still
		// re-runs this effect — we don't want to wipe and refetch the tree then.
		if (caseId === loadedCaseId) return;

		// Reset the tree synchronously on a case switch so the sidebar
		// doesn't flash the previous case's notes while `loadTree()` is
		// in flight. `loadedCaseId === -1` on the very first run — no
		// need to reset then (the tree is already empty).
		if (loadedCaseId !== null) {
			notes.reset();
		}
		loadedCaseId = caseId;
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

	const deleteItem = async () => {
		if (contextMenu.source === 'folder' && contextMenu.folderId) {
			if (await notes.removeFolder(contextMenu.folderId)) {
				toast({ title: 'Folder deleted', variant: 'success' });
			} else {
				toast({
					title: 'Failed to delete folder',
					description: 'The folder is still in this case.',
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
					description: 'The note is still in this case.',
					variant: 'destructive'
				});
			}
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

<CaseWorkspace>
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
				{#if notes.list.searchTerm}
					{#if notes.list.searchStatus === 'loading'}
						<div class="space-y-2 px-2">
							<Skeleton class="h-7 w-full" />
							<Skeleton class="h-7 w-full" />
						</div>
					{:else if notes.list.searchError}
						<div class="px-2 py-2 text-sm text-destructive">{notes.list.searchError}</div>
					{:else if searchResults.length === 0}
						<div class="px-2 py-4 text-center text-xs text-muted-foreground">
							No notes match “{notes.list.searchTerm}”
						</div>
					{:else}
						<ul class="space-y-0.5">
							{#each searchResults as note (note.note_id)}
								{@const folderName =
									note.directory_id !== undefined ? folderNameById[note.directory_id] : undefined}
								<li>
									<button
										type="button"
										class="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60 {notes
											.ui.selectedNoteId === note.note_id
											? 'bg-muted/80 font-medium'
											: ''}"
										onclick={() => openSearchResult(note.note_id, note.directory_id)}
									>
										<FileText
											class="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-foreground"
										/>
										<span class="min-w-0 flex-1">
											<span class="block truncate">{note.note_title || 'Untitled note'}</span>
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
		</Resizable.Pane>

		<Resizable.Handle class="bg-transparent hover:bg-border" />

		<Resizable.Pane class="flex h-full min-h-0 flex-col overflow-hidden">
			{@render children()}
		</Resizable.Pane>
	</Resizable.PaneGroup>
</CaseWorkspace>

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
	/* Keep the sidebar scrollbar out of the way until the user hovers the pane. */
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

	:global(.resizable-handle-with-handle) {
		position: relative;
		width: 2px;
		transition: background-color 0.2s;
	}

	:global(.resizable-handle-with-handle::before) {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 4px;
		height: 24px;
		border-radius: 2px;
		background-color: var(--muted-foreground);
		opacity: 0.5;
		transition: opacity 0.2s;
	}

	:global(.resizable-handle-with-handle:hover::before),
	:global(.resizable-handle-with-handle[data-resize-handle-active]::before) {
		opacity: 1;
	}
</style>
