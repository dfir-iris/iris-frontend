<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { ContextMenu } from '../types';

	type Props = {
		contextMenu: ContextMenu;
		/** When false, mutating entries (new/rename/move/delete) are hidden.
		 *  Read-only users still get the copy-link/copy-md-link entries. */
		canEdit?: boolean;
		onNewNote: (folderId?: number) => void;
		onNewFolder: (folderId?: number) => void;
		onCopyLink: (noteId?: number) => void;
		onCopyMdLink: (noteId?: number) => void;
		onRename: () => void;
		onMove: () => void;
		onDelete: () => void;
		/** Opens the share-with-cases dialog. Omitted = entry hidden. */
		onShare?: () => void;
	};

	let {
		contextMenu,
		canEdit = true,
		onNewNote,
		onNewFolder,
		onCopyLink,
		onCopyMdLink,
		onRename,
		onMove,
		onDelete,
		onShare
	}: Props = $props();

	// The synthetic root bucket (folderId 0) is not a real folder.
	const shareable = $derived(
		!!onShare &&
			((contextMenu.source === 'note' && contextMenu.noteId != null) ||
				(contextMenu.source === 'folder' && !!contextMenu.folderId))
	);
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
	{#if contextMenu.source === 'folder' && contextMenu.folderId && canEdit}
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

	{#if shareable}
		<hr class="my-1" />

		<Button variant="ghost" class="w-full justify-start" onclick={() => onShare?.()}>
			Share with cases…
		</Button>
	{/if}

	{#if canEdit}
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
	{/if}
</div>
