<script lang="ts">
	import {
		DownloadIcon,
		FileSymlinkIcon,
		ForwardIcon,
		HistoryIcon,
		MessagesSquareIcon,
		TrashIcon
	} from 'lucide-svelte';
	import type { Note } from '$lib/types/resources/note';
	import { toast } from '$lib/stores/toast.store';
	import { Button } from '$lib/components/ui/button';
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

	type Props = {
		note: Note;
		onDeleteNote: () => void;
	};

	let { note, onDeleteNote }: Props = $props();

	let showNoteHistory = $state<boolean>(false);
	let showNoteComments = $state<boolean>(false);
	let showConfirmDelete = $state<boolean>(false);
</script>

<div class="flex items-start justify-between">
	<div class="flex flex-col">
		<div class="text-3xl font-bold">{note.note_title}</div>

		<div class="italicgap-4 flex items-center text-sm">
			<span class="opacity-50">#{note.note_id} - {note.note_uuid}</span>

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

	<div class="flex">
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger>
					<Button variant="link" size="xs" onclick={() => (showNoteComments = true)}>
						<MessagesSquareIcon />
					</Button>
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
								.writeText(`[<i class="fa-solid fa-bell"></i> #25](${getNoteUrl(note.note_id)})`)
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
