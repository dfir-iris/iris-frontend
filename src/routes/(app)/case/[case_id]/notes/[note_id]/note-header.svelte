<script lang="ts">
	import {
		DownloadIcon,
		FileSymlinkIcon,
		ForwardIcon,
		HistoryIcon,
		MessagesSquareIcon,
		SaveIcon,
		TrashIcon
	} from 'lucide-svelte';
	import type { Note } from '$lib/types/resources/note';
	import { username } from '$lib/stores/auth.store';
	import { toast } from '$lib/stores/toast.store';
	import type { HistoryEventBase } from '$lib/components/common/ActivityHistory.svelte';
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
	import NoteCommentsDialog from './note-comments-dialog.svelte';
	import NoteHistoryDialog from './note-history-dialog.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import NotesRenameDialog from '../components/notes-rename-dialog.svelte';
	import { CommentsService } from '$lib/services/comments.service';

	interface LastSaved extends HistoryEventBase {
		date: Date;
	}

	type Props = {
		note: Note;
		dirty?: boolean;
		saving?: boolean;
		lastError?: string | null;
		typingUser?: string | null;
		onSaveNote: () => void;
		onDeleteNote: () => void;
	};

	let {
		note,
		dirty = false,
		saving = false,
		lastError = null,
		typingUser = null,
		onSaveNote,
		onDeleteNote
	}: Props = $props();

	let showNoteRename = $state(false);
	let showNoteHistory = $state(false);
	let showNoteComments = $state(false);
	let showConfirmDelete = $state(false);

	let entered = $state(new Date());

	let comments = $state(0);

	const getModificationDate = (date: string): Date => new Date(Math.floor(Number(date) * 1000));

	const lastSaved = $derived.by<LastSaved | null>(() => {
		if (!note.modification_history) return null;

		const lastModification = Object.keys(note.modification_history)
			.sort((a: string, b: string) =>
				getModificationDate(b).getDate() < getModificationDate(a).getTime() ? 1 : -1
			)
			.pop();

		if (!lastModification) return null;

		const lastModificationHistoryEvent = (
			note.modification_history as Record<string, HistoryEventBase>
		)[lastModification];

		return {
			...lastModificationHistoryEvent,
			date: getModificationDate(lastModification)
		};
	});

	const renameNote = (name: string) => {
		note.note_title = name;
		showNoteRename = false;
		onSaveNote();
	};

	let loadedCommentsForNoteId = $state<number | undefined>(undefined);

	const loadComments = async (noteId: number) => {
		const commentsResponse = await CommentsService.list('notes', noteId, {
			per_page: 10000
		});

		const data = commentsResponse.data;
		comments = (data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [])
			.length;
	};

	$effect(() => {
		// Only reload comments when the note id actually changes — not on every
		// reassignment of `note` (which happens after each save).
		const id = note.note_id;

		if (id === loadedCommentsForNoteId) return;

		loadedCommentsForNoteId = id;
		loadComments(id);
	});
</script>

<div class="flex items-start justify-between gap-4">
	<div class="flex min-w-0 flex-col">
		<div
			role="button"
			tabindex="0"
			title={note.note_title}
			class="cursor-pointer truncate rounded-sm px-1 text-xl font-semibold leading-tight transition-colors hover:bg-muted/60"
			onclick={() => (showNoteRename = true)}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					showNoteRename = true;
				}
			}}
		>
			{note.note_title}
		</div>

		<div class="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
			<span class="truncate">#{note.note_id} · {note.note_uuid}</span>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button variant="link" size="xs" onclick={() => (showNoteHistory = true)}>
							<HistoryIcon class="transition-all hover:opacity-50" />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Modification History</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

	<div class="flex items-center gap-2">
		{#if typingUser}
			<span class="text-xs italic text-muted-foreground">{typingUser} is typing…</span>
		{/if}

		{#if lastError}
			<Badge variant="compromised" class="flex px-2 py-0.5">Error</Badge>
		{:else if saving}
			<Badge variant="destructive" class="flex px-2 py-0.5">Saving...</Badge>
		{:else if dirty}
			<Badge variant="destructive" class="flex px-2 py-0.5">Unsaved changes</Badge>
		{:else}
			<Badge variant="green" class="flex px-2 py-0.5">Changes saved</Badge>
		{/if}

		{#if lastSaved && lastSaved.date > entered}
			<div class="flex items-center text-xs opacity-50">
				Last Saved: {mediumDateTimeFormatter(lastSaved.date)} by {lastSaved.user === $username
					? 'you'
					: lastSaved.user}
			</div>
		{/if}

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

		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<div class="relative">
						<Button variant="link" size="xs" onclick={() => (showNoteComments = true)}>
							<MessagesSquareIcon />

							{#if comments > 0}
								<div
									class="absolute right-[0.025rem] top-[.025rem] flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-2xs text-white"
								>
									{comments}
								</div>
							{/if}
						</Button>
					</div>
				</TooltipTrigger>

				<TooltipContent align="center" side="bottom">Comments</TooltipContent>
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
								.writeText(getNoteUrl(note.note_id))
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
									`[<i class="fa-solid fa-bell"></i> #(${getNoteUrl(note.note_id)})](${getNoteUrl(note.note_id)})`
								)
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
								(note.note_title || 'note')
									.replace(/[^a-zA-Z0-9]+/g, '_')
									.replace(/^_+|_+$/g, '') || 'note';

							const blob = new Blob([note.note_content ?? ''], {
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
	</div>
</div>

<NoteHistoryDialog bind:open={showNoteHistory} {note} onClose={() => (showNoteHistory = false)} />

<NoteCommentsDialog
	bind:open={showNoteComments}
	{note}
	onClose={() => (showNoteComments = false)}
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
	initialValue={note.note_title}
	onSubmit={renameNote}
	onCancel={() => (showNoteRename = false)}
/>
