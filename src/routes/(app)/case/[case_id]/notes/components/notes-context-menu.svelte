<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { ContextMenu } from '../types';

	type Props = {
		contextMenu: ContextMenu;
		onNewNote: (folderId?: number) => void;
		onNewFolder: (folderId?: number) => void;
		onCopyLink: (noteId?: number) => void;
		onCopyMdLink: (noteId?: number) => void;
		onRename: () => void;
		onMove: () => void;
		onDelete: () => void;
	};

	let {
		contextMenu,
		onNewNote,
		onNewFolder,
		onCopyLink,
		onCopyMdLink,
		onRename,
		onMove,
		onDelete
	}: Props = $props();
</script>

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
			onclick={() => onNewNote(contextMenu.folderId)}
		>
			New note
		</Button>

		<Button
			variant="ghost"
			class="w-full justify-start"
			onclick={() => onNewFolder(contextMenu.folderId)}
		>
			New folder
		</Button>
	{:else if contextMenu.source === 'note'}
		<Button
			variant="ghost"
			class="w-full justify-start"
			onclick={() => onCopyLink(contextMenu.noteId)}>Copy link</Button
		>

		<Button
			variant="ghost"
			class="w-full justify-start"
			onclick={() => onCopyMdLink(contextMenu.noteId)}
		>
			Copy MD link
		</Button>
	{/if}

	<hr class="my-1" />

	<Button variant="ghost" class="w-full justify-start" onclick={onRename}>Rename</Button>

	<Button variant="ghost" class="w-full justify-start" onclick={onMove}>Move</Button>

	<hr class="my-1" />

	<Button
		variant="ghost"
		class="w-full justify-start text-red-500 hover:text-red-600"
		onclick={onDelete}
	>
		Delete
	</Button>
</div>
