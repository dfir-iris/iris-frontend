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
	import { stripMentionChipsForExport } from '$lib/components/common/MarkDown/export';
	import { username } from '$lib/stores/auth.store';
	import { toast } from '$lib/stores/toast.store';
	import type { HistoryEventBase } from '$lib/components/common/ActivityHistory.svelte';
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
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import NotesRenameDialog from '../components/notes-rename-dialog.svelte';
	import { CommentsService } from '$lib/services/comments.service';
	import { getContext } from 'svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';

	const commentsPanel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);

	interface LastSaved extends HistoryEventBase {
		date: Date;
	}

	type Props = {
		note: Note;
		dirty?: boolean;
		saving?: boolean;
		lastError?: string | null;
		typingUser?: string | null;
		/** When false, the header hides the Save / Rename / Delete affordances.
		 *  Read-only users still see the metadata, history, and share/export
		 *  actions because those don't mutate server state. */
		canEdit?: boolean;
		onSaveNote: () => void;
		onDeleteNote: () => void;
		/** Fires when the user picks "Restore this revision" inside
		 *  the revisions dialog. The detail view uses this to reset
		 *  the markdown editor draft to the freshly-restored content. */
		onRestoreRevision?: (note: Note) => void;
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

	// Pulled from the URL rather than threaded through props — the
	// case id is invariant across this whole route, and dragging it
	// through every parent (`NoteDetailView`, dialog wrappers, etc.)
	// just for the revisions endpoint felt heavier than reading the
	// route params here.
	const caseIdFromRoute = $derived(Number(page.params.case_id));

	const openNoteComments = () =>
		commentsPanel.open({
			type: 'notes',
			id: note.note_id,
			label: note.note_title || `Note #${note.note_id}`
		});

	let entered = $state(new Date());

	let comments = $state(0);

	const getModificationDate = (date: string): Date => new Date(Math.floor(Number(date) * 1000));

	const lastSaved = $derived.by<LastSaved | null>(() => {
		if (!note.modification_history) return null;

		// The keys are epoch seconds as strings, so compare them as numbers and
		// take the last. The previous comparator read `getDate()` (day of the
		// month, 1-31) on one side and `getTime()` (epoch ms) on the other, so
		// the test was never true and the sort returned -1 for every pair —
		// leaving the order untouched and `pop()` returning whichever key the
		// object happened to enumerate last.
		const lastModification = Object.keys(note.modification_history)
			.sort((a: string, b: string) => Number(a) - Number(b))
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
		{#if canEdit}
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
		{:else}
			<div
				title={note.note_title}
				class="truncate rounded-sm px-1 text-xl font-semibold leading-tight"
			>
				{note.note_title}
			</div>
		{/if}

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

		{#if lastSaved && lastSaved.date > entered}
			<div class="flex items-center text-xs opacity-50">
				Last Saved: {mediumDateTimeFormatter(lastSaved.date)} by {lastSaved.user === $username
					? 'you'
					: lastSaved.user}
			</div>
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
					<div class="relative">
						<Button variant="link" size="xs" onclick={openNoteComments}>
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

							const cleanContent = stripMentionChipsForExport(note.note_content ?? '');
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
	caseId={caseIdFromRoute}
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
	initialValue={note.note_title}
	onSubmit={renameNote}
	onCancel={() => (showNoteRename = false)}
/>
