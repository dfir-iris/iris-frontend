<script lang="ts">
	import { tick } from 'svelte';
	import type { Evidence } from '$lib/types/resources/evidence';
	import { Comments } from '$lib/components/common/Comments';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import type { RequestResponse } from '$lib/services/api.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';

	let { evidence, onRefresh }: { evidence: Evidence; onRefresh: () => void } = $props();

	let comments = $state<Comment[]>([]);
	let comment_text = $state('');
	let editing_comment_id = $state<number | null>(null);
	let commentsContainer = $state<HTMLDivElement | undefined>();
	let lastLoadedEvidenceId = $state<number | null>(null);

	const showError = (msg: string, detail?: string) =>
		toast({ title: msg, description: detail, variant: 'destructive' });

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
		const res = await CommentsService.remove('evidences', evidence.id, commentId);
		if (!res.ok) {
			showError('Failed to delete comment', res.error?.message);
			return;
		}

		await refresh();
	};

	const refresh = async () => {
		const res = await CommentsService.list('evidences', evidence.id);
		if (!res.ok) {
			showError('Failed to load comments', res.error?.message);
			return;
		}

		const data = res.data;
		comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];

		lastLoadedEvidenceId = evidence.id;

		await scrollToBottom();

		onRefresh();
	};

	const saveComment = async () => {
		const text = comment_text.trim();
		if (!text) return;

		let res: RequestResponse<Comment>;
		if (editing_comment_id) {
			const comment = getCommentById(editing_comment_id);
			if (!comment) return;

			res = await CommentsService.update('evidences', evidence.id, editing_comment_id, {
				...comment,
				comment_text: text
			});
		} else {
			res = await CommentsService.create('evidences', evidence.id, {
				comment_text: text
			});
		}

		if (!res.ok) {
			showError(
				editing_comment_id ? 'Failed to save comment' : 'Failed to post comment',
				res.error?.message
			);
			return;
		}

		comment_text = '';
		editing_comment_id = null;

		await refresh();
	};

	$effect(() => {
		if (evidence.id !== lastLoadedEvidenceId) {
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
		<MarkDownEditor
			value={comment_text}
			onChange={(value) => (comment_text = value)}
			onSave={saveComment}
		/>
	</div>

	<div class="flex shrink-0 justify-end gap-2 px-4 py-3">
		<Button variant="outline" size="sm" onclick={refresh}>Refresh</Button>

		<Button variant="default" size="sm" onclick={saveComment}>
			{editing_comment_id ? 'Save' : 'Comment'}
		</Button>
	</div>
</div>
