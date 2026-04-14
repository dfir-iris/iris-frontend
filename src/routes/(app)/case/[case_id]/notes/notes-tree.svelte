<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import type { Note, NoteFolder } from '$lib/types/resources/note';
	import { FileTextIcon, FolderIcon, FolderOpenIcon } from 'lucide-svelte';
	import Self from './notes-tree.svelte';
	import type { ContextMenuSource } from './types';

	type Props = {
		folder: NoteFolder;
		onClickFolder: (folderId: number) => void;
		onContextMenu: (
			event: MouseEvent,
			source: ContextMenuSource,
			directoryId: number,
			noteId?: number
		) => void;
	};

	let { folder, onClickFolder, onContextMenu }: Props = $props();

	let open = $state(true);

	const subdirectories = $derived(folder.subdirectories ?? []);
	const notes = $derived(folder.notes ?? []);

	const getNoteId = (note: Note): number => note.note_id;
	const getNoteTitle = (note: Note): string => note.note_title;
</script>

<Button
	onclick={() => {
		onClickFolder(folder.id);
		open = !open;
	}}
	oncontextmenu={(event) => onContextMenu(event, 'folder', folder.id)}
	variant="ghost"
	class="w-full justify-start gap-x-1.5 rounded-none px-4"
>
	{@const Icon = open ? FolderOpenIcon : FolderIcon}
	<Icon size={18} />
	<span class="truncate">{folder.name}</span>
</Button>

{#if open}
	<div class="pl-4">
		{#each subdirectories as subfolder (subfolder.id)}
			<Self {onClickFolder} {onContextMenu} folder={subfolder} />
		{/each}

		{#each notes as note (getNoteId(note))}
			<Button
				variant="ghost"
				class="w-full justify-start gap-x-1.5 rounded-none !text-sm"
				href="/case/{page.params.case_id}/notes/{getNoteId(note)}"
				oncontextmenu={(event) => onContextMenu(event, 'note', folder.id, getNoteId(note))}
			>
				<FileTextIcon size={16} />
				<span class="truncate">{getNoteTitle(note)}</span>
			</Button>
		{/each}
	</div>
{/if}
