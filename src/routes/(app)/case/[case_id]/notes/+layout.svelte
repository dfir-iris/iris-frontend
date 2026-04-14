<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { FilePlusIcon, FolderPlusIcon } from 'lucide-svelte';
	import {
		CASE_NOTES_CTX,
		createCaseNotesContext,
		type CaseNotesContext
	} from '$lib/contexts/case-notes.context.svelte';
	import NotesTree from './notes-tree.svelte';
	import type { ContextMenu, ContextMenuSource } from './types';

	let { children }: { children: Snippet } = $props();

	const notes = createCaseNotesContext(() => Number(page.params.case_id));

	setContext<CaseNotesContext>(CASE_NOTES_CTX, notes);

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
		contextMenu.source = undefined;
		contextMenu.noteId = undefined;
		contextMenu.folderId = undefined;
	};

	const openContextMenu = (
		event: MouseEvent,
		source: ContextMenuSource,
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
	};

	const newFolder = async (parentId?: number) => {
		closeContextMenu();

		await notes.createFolder({
			name: 'New folder',
			parent_id: parentId
		});
	};

	const newNote = async (folderId?: number) => {
		closeContextMenu();

		const targetFolderId = folderId ?? notes.ui.selectedFolderId ?? notes.list.tree[0]?.id ?? null;

		if (targetFolderId === null) return;

		const note = await notes.createNote({
			note_title: 'New note',
			note_content: '',
			directory_id: targetFolderId
		});

		if (note) {
			await goto(`/case/${page.params.case_id}/notes/${note.note_id}`);
		}
	};
</script>

<svelte:document onclick={closeContextMenu} />

<div class="flex h-full w-full flex-row overflow-hidden">
	<div class="relative flex h-full min-h-0 w-1/4 max-w-[250px] flex-col border-r bg-background/60">
		<div class="flex flex-row items-center gap-2 px-4 pb-2 pt-4">
			<h2 class="w-full">Notes</h2>

			<Button
				variant="ghost"
				size="icon"
				aria-label="Add folder"
				onclick={() => newFolder(notes.ui.selectedFolderId)}
			>
				<FolderPlusIcon size={18} class="!stroke-[1.75]" />
			</Button>

			<Button variant="ghost" size="icon" aria-label="Add note" onclick={() => newNote()}>
				<FilePlusIcon size={18} class="!stroke-[1.75]" />
			</Button>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto pb-4">
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
			<div
				class="fixed z-50 min-w-[180px] rounded-md border bg-background p-1 shadow-md"
				style:left="{contextMenu.x}px"
				style:top="{contextMenu.y}px"
				tabindex="0"
				role="menu"
				onclick={(event) => event.stopPropagation()}
				onkeydown={(event) => event.stopPropagation()}
			>
				{#if contextMenu.source === 'folder' && contextMenu.folderId}
					<Button
						variant="ghost"
						class="w-full justify-start"
						onclick={() => newNote(contextMenu.folderId)}
					>
						New note
					</Button>

					<Button
						variant="ghost"
						class="w-full justify-start"
						onclick={() => newFolder(contextMenu.folderId)}
					>
						New folder
					</Button>
				{:else if contextMenu.source === 'note'}
					<Button
						variant="ghost"
						class="w-full justify-start"
						onclick={() => newNote(contextMenu.folderId)}
					>
						New note
					</Button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="h-full w-full overflow-hidden p-8">
		<div class="flex h-full w-full flex-col rounded border bg-background shadow">
			{@render children()}
		</div>
	</div>
</div>
