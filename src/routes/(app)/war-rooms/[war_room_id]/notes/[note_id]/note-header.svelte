<!--
  War-room note header. Same layout as the case-notes header —
  editable title, ID line with history icon, save-state badge, action
  toolbar — but wired against `WarRoomNote` instead of `Note`.

  Diverges from the case version on:
    * No comments-panel button (war rooms don't have that surface today
      — the room-wide chat plays the same role).
    * `getNoteUrl` and share-link copy resolve to the war-room route.
-->
<script lang="ts">
	import {
		DownloadIcon,
		FileSymlinkIcon,
		ForwardIcon,
		HistoryIcon,
		SaveIcon,
		TrashIcon
	} from 'lucide-svelte';
	import type { WarRoomNote } from '$lib/services/war-room-notes.service';
	import { stripMentionChipsForExport } from '$lib/components/common/MarkDown/export';
	import { toast } from '$lib/stores/toast.store';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import { getNoteUrl } from '../helpers';
	import NoteHistoryDialog from './note-history-dialog.svelte';
	import NotesRenameDialog from '../components/notes-rename-dialog.svelte';

	type Props = {
		note: WarRoomNote;
		dirty?: boolean;
		saving?: boolean;
		lastError?: string | null;
		typingUser?: string | null;
		canEdit?: boolean;
		onSaveNote: () => void;
		onDeleteNote: () => void;
		/** Fires when the user picks "Restore this revision" inside
		 *  the revisions dialog. The detail view uses this to reset
		 *  the markdown editor draft to the freshly-restored content. */
		onRestoreRevision?: (note: WarRoomNote) => void;
	};

	let {
		note,
		dirty = false,
		saving = false,
		lastError = null,
		typingUser = null,
		canEdit = true,
		onSaveNote,
		onDeleteNote,
		onRestoreRevision
	}: Props = $props();

	let showNoteRename = $state(false);
	let showNoteHistory = $state(false);
	let showConfirmDelete = $state(false);

	// Pulled from the route so we don't have to thread the war-room id
	// through every wrapper for the revisions endpoint.
	const warRoomIdFromRoute = $derived(Number(page.params.war_room_id));

	const renameNote = (name: string) => {
		note.title = name;
		showNoteRename = false;
		onSaveNote();
	};
</script>

<div class="flex items-start justify-between gap-4">
	<div class="flex min-w-0 flex-col">
		{#if canEdit}
			<div
				role="button"
				tabindex="0"
				title={note.title}
				class="cursor-pointer truncate rounded-sm px-1 text-xl font-semibold leading-tight transition-colors hover:bg-muted/60"
				onclick={() => (showNoteRename = true)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						showNoteRename = true;
					}
				}}
			>
				{note.title}
			</div>
		{:else}
			<div title={note.title} class="truncate rounded-sm px-1 text-xl font-semibold leading-tight">
				{note.title}
			</div>
		{/if}

		<div class="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
			<span class="truncate">#{note.note_id}</span>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="link" size="xs" onclick={() => (showNoteHistory = true)}>
							<HistoryIcon class="transition-all hover:opacity-50" />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Revision history</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

	<div class="flex items-center gap-2">
		{#if typingUser}
			<span class="text-xs italic text-muted-foreground">{typingUser} is typing…</span>
		{/if}

		{#if canEdit}
			{#if lastError}
				<Badge variant="compromised" class="flex px-2 py-0.5">Error</Badge>
			{:else if saving}
				<Badge variant="destructive" class="flex px-2 py-0.5">Saving...</Badge>
			{:else if dirty}
				<Badge variant="destructive" class="flex px-2 py-0.5">Unsaved changes</Badge>
			{:else}
				<Badge variant="green" class="flex px-2 py-0.5">Changes saved</Badge>
			{/if}
		{/if}

		{#if canEdit}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="link" size="xs" onclick={() => onSaveNote()}>
							<SaveIcon />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Save note</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/if}

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<Button
						variant="link"
						size="xs"
						onclick={() => {
							navigator.clipboard
								.writeText(getNoteUrl(note.note_id))
								.then(() => {
									toast({ title: 'Link copied', variant: 'success' });
								})
								.catch((e) => {
									console.error('Clipboard copy error:', e);
									toast({ title: 'Could not copy link', variant: 'destructive' });
								});
						}}
					>
						<ForwardIcon />
					</Button>
				</TooltipTrigger>

				<TooltipContent align="center" side="bottom">Copy shared link</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<Button
						variant="link"
						size="xs"
						onclick={() => {
							navigator.clipboard
								.writeText(
									`[${note.title || `Note #${note.note_id}`}](${getNoteUrl(note.note_id)})`
								)
								.then(() => {
									toast({ title: 'Link copied', variant: 'success' });
								})
								.catch((e) => {
									console.error('Clipboard copy error:', e);
									toast({ title: 'Could not copy link', variant: 'destructive' });
								});
						}}
					>
						<FileSymlinkIcon />
					</Button>
				</TooltipTrigger>

				<TooltipContent align="center" side="bottom">Copy MD link</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<Button
						variant="link"
						size="xs"
						onclick={() => {
							const safeName =
								(note.title || 'note').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') ||
								'note';

							const cleanContent = stripMentionChipsForExport(note.content ?? '');
							const blob = new Blob([cleanContent], {
								type: 'text/markdown;charset=utf-8'
							});

							const url = URL.createObjectURL(blob);
							const link = document.createElement('a');

							link.href = url;
							link.download = `${safeName}.md`;
							document.body.appendChild(link);
							link.click();
							document.body.removeChild(link);

							URL.revokeObjectURL(url);
						}}
					>
						<DownloadIcon />
					</Button>
				</TooltipTrigger>

				<TooltipContent align="center" side="bottom">Download as MD</TooltipContent>
			</Tooltip>
		</TooltipProvider>

		{#if canEdit}
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="link" size="xs" onclick={() => (showConfirmDelete = true)}>
							<TrashIcon class="text-red-500" />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Delete note</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		{/if}
	</div>
</div>

<NoteHistoryDialog
	bind:open={showNoteHistory}
	warRoomId={warRoomIdFromRoute}
	{note}
	onClose={() => (showNoteHistory = false)}
	onRestored={(fresh) => onRestoreRevision?.(fresh)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={onDeleteNote}
	onCancel={() => (showConfirmDelete = false)}
/>

<NotesRenameDialog
	bind:open={showNoteRename}
	itemType="note"
	initialValue={note.title}
	onSubmit={renameNote}
	onCancel={() => (showNoteRename = false)}
/>
