<script lang="ts">
	import { tick } from 'svelte';
	import type { Note } from '$lib/types/resources/note';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Comments } from '$lib/components/common/Comments';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';

	type Props = {
		open: boolean;
		onClose: () => void;
		note: Note;
	};

	let { open = $bindable(), onClose, note }: Props = $props();

	let comments = $state<Comment[]>([]);
	let comment_text = $state('');
	let editing_comment_id = <number | null>$state(null);
	let commentsContainer: HTMLDivElement | undefined = $state();
	let lastLoadedNoteId = $state<number | null>(null);
	let wasOpen = $state(false);

	const scrollToBottom = async () => {
		await tick();

		if (!commentsContainer) return;

		commentsContainer.scrollTop = commentsContainer.scrollHeight;
	};

	const getCommentById = (comment_id: number): Comment =>
		comments.find((comment) => comment.comment_id === comment_id) as Comment;

	const editComment = async (comment_id: number) => {
		comment_text = getCommentById(comment_id).comment_text ?? '';

		editing_comment_id = comment_id;
	};

	const deleteComment = async (comment_id: number) => {
		if (note) {
			await CommentsService.remove('notes', note.note_id, comment_id);

			return refresh();
		}
	};

	const refresh = async () => {
		if (!note) {
			comments = [];

			return;
		}

		const commentsResponse = await CommentsService.list('notes', note.note_id, {
			per_page: 10000
		});

		const data = commentsResponse.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];

		lastLoadedNoteId = note.note_id;

		await scrollToBottom();
	};

	const saveComment = async () => {
		const text = comment_text.trim();
		if (!text || !note) return;

		if (editing_comment_id) {
			const comment = getCommentById(editing_comment_id);
			await CommentsService.update('notes', note.note_id, editing_comment_id, {
				...comment,
				comment_text
			});
		} else {
			await CommentsService.create('notes', note.note_id, {
				comment_text: text
			});
		}

		comment_text = '';
		editing_comment_id = null;

		await refresh();
	};

	$effect(() => {
		const noteId = note?.note_id ?? null;

		if (!open) {
			comments = [];
			comment_text = '';
			lastLoadedNoteId = null;
			wasOpen = false;
			return;
		}

		const justOpened = !wasOpen;
		const noteChanged = noteId !== null && noteId !== lastLoadedNoteId;

		wasOpen = true;

		if (noteId !== null && (justOpened || noteChanged)) {
			void refresh();
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(open) => {
		if (!open) {
			onClose();
		}
	}}
>
	<Dialog.Content class="flex max-h-[80vh] max-w-[640px] flex-col gap-0 p-0">
		{#if note}
			<Dialog.Header class="border-b border-border/50 px-4 py-3">
				<Dialog.Title class="text-sm font-medium"
					>Comments on <span class="font-semibold">Note #{note.note_id}</span></Dialog.Title
				>
			</Dialog.Header>

			<div bind:this={commentsContainer} class="flex-1 overflow-auto px-4 py-3">
				<Comments
					{comments}
					onEdit={editComment}
					onDelete={deleteComment}
					selected={editing_comment_id}
				/>
			</div>

			<div class="border-t border-border/30 px-4 pt-3">
				<MarkDownEditor
					value={comment_text}
					onChange={(value) => (comment_text = value)}
					onSave={saveComment}
				/>
			</div>

			<Dialog.Footer class="w-full justify-between px-4 pb-3 pt-2">
				<Button variant="outline" size="sm" onclick={refresh}>Refresh</Button>

				<Button variant="default" size="sm" onclick={saveComment}
					>{editing_comment_id ? 'Save' : 'Comment'}</Button
				>
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
