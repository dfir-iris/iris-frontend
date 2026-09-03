<script lang="ts">
	import { tick } from 'svelte';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { Comments } from '$lib/components/common/Comments';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { Button } from '$lib/components/ui/button';
	import { CommentsService, type Comment } from '$lib/services/comments.service';

	let { ioc, onRefresh }: { ioc: Ioc; onRefresh: () => void } = $props();

	let comments = $state<Comment[]>([]);
	let comment_text = $state('');
	let editing_comment_id = $state<number | null>(null);
	let commentsContainer = $state<HTMLDivElement | undefined>();
	let lastLoadedIocId = $state<number | null>(null);

	const scrollToBottom = async () => {
		await tick();

		if (commentsContainer) {
			commentsContainer.scrollTop = commentsContainer.scrollHeight;
		}
	};

	const getCommentById = (commentId: number) =>
		comments.find((comment) => comment.comment_id === commentId);

	const editComment = (commentId: number) => {
		const comment = getCommentById(commentId);
		if (!comment) return;

		comment_text = comment.comment_text ?? '';
		editing_comment_id = commentId;
	};

	const deleteComment = async (commentId: number) => {
		await CommentsService.remove('iocs', ioc.ioc_id, commentId);
		await refresh();
	};

	const refresh = async () => {
		const res = await CommentsService.list('iocs', ioc.ioc_id);

		const data = res.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];

		lastLoadedIocId = ioc.ioc_id;

		await scrollToBottom();

		onRefresh();
	};

	const saveComment = async () => {
		const text = comment_text.trim();
		if (!text) return;

		if (editing_comment_id) {
			const comment = getCommentById(editing_comment_id);
			if (!comment) return;

			await CommentsService.update('iocs', ioc.ioc_id, editing_comment_id, {
				...comment,
				comment_text: text
			});
		} else {
			await CommentsService.create('iocs', ioc.ioc_id, {
				comment_text: text
			});
		}

		comment_text = '';
		editing_comment_id = null;

		await refresh();
	};

	$effect(() => {
		if (ioc.ioc_id !== lastLoadedIocId) {
			void refresh();
		}
	});
</script>

<div class="flex h-full min-h-0 flex-col">
	<div bind:this={commentsContainer} class="min-h-0 flex-1 overflow-auto px-4 py-3">
		<Comments
			{comments}
			onEdit={editComment}
			onDelete={deleteComment}
			selected={editing_comment_id}
		/>
	</div>

	<div class="shrink-0 border-t border-border/30 px-4 pt-3">
		<!--
			Opens ready to type. Leaving this in 'view' mode meant every
			comment started with a double-click on a "Double-click to edit…"
			placeholder — a click that carried no meaning, in a box that
			exists only to be written in. The comments side panel has always
			seeded 'edit' for the same reason.
		-->
		<MarkDownEditor
			value={comment_text}
			onChange={(value) => (comment_text = value)}
			onSave={saveComment}
			initialMode="edit"
		/>
	</div>

	<div class="flex shrink-0 justify-end gap-2 px-4 py-3">
		<Button variant="outline" size="sm" onclick={refresh}>Refresh</Button>

		<Button variant="default" size="sm" onclick={saveComment}>
			{editing_comment_id ? 'Save' : 'Comment'}
		</Button>
	</div>
</div>
