<!--
  A comments thread for one entity: the list, the composer, and the
  fetch / create / edit / delete lifecycle that goes with them. No
  chrome of its own — `CommentsPanel` wraps it in the side-panel header,
  the alerts split view drops it straight into a detail tab.

  Callers only hand it an `entity`; it reloads whenever that changes and
  empties itself when it goes null. `onChange` fires after any write so
  a host can refresh its own comment-count badge.
-->
<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { CommentsPanelEntity } from '$lib/contexts/comments-panel.context.svelte';
	import type { RequestResponse } from '$lib/services/api.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import Comments from './Comments.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import Button from '$lib/components/ui/button/button.svelte';
	import { toast } from '$lib/components/ui/toast';

	type Props = {
		entity: CommentsPanelEntity | null;
		/** Mirrors the in-flight state so the host can drive its own spinner. */
		loading?: boolean;
		/** Shown in place of the thread when there is no entity. */
		emptyLabel?: string;
		/** Fired after a comment was created, edited or deleted. */
		onChange?: () => void;
		class?: string;
	};

	let {
		entity,
		loading = $bindable(false),
		emptyLabel = 'Select an item to view its comments.',
		onChange,
		class: className = ''
	}: Props = $props();

	const showError = (msg: string, detail?: string) =>
		toast({ title: msg, description: detail, variant: 'destructive' });

	let comments = $state<Comment[]>([]);
	let commentText = $state('');
	let editingCommentId = $state<number | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);

	const scrollToBottom = async () => {
		await tick();
		if (!scrollEl) return;
		scrollEl.scrollTop = scrollEl.scrollHeight;
	};

	const loadComments = async () => {
		if (!entity) {
			comments = [];
			return;
		}

		loading = true;
		try {
			const res = await CommentsService.list(entity.type, entity.id, { per_page: 10000 });
			if (!res.ok) {
				showError('Failed to load comments', res.error?.message);
				return;
			}

			const data = res.data;
			comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];
			await scrollToBottom();
		} finally {
			loading = false;
		}
	};

	/** Lets a host re-fetch the thread — the panel's refresh button. */
	export const reload = loadComments;

	const getCommentById = (id: number): Comment | undefined =>
		comments.find((c) => c.comment_id === id);

	const editComment = (id: number) => {
		const c = getCommentById(id);
		if (!c) return;
		commentText = c.comment_text ?? '';
		editingCommentId = id;
	};

	const deleteComment = async (id: number) => {
		if (!entity) return;

		const res = await CommentsService.remove(entity.type, entity.id, id);
		if (!res.ok) {
			showError('Failed to delete comment', res.error?.message);
			return;
		}

		await loadComments();
		onChange?.();
	};

	const saveComment = async () => {
		const text = commentText.trim();
		if (!entity || !text) return;

		let res: RequestResponse<Comment>;
		if (editingCommentId) {
			const existing = getCommentById(editingCommentId);
			if (!existing) return;

			res = await CommentsService.update(entity.type, entity.id, editingCommentId, {
				...existing,
				comment_text: text
			});
		} else {
			res = await CommentsService.create(entity.type, entity.id, { comment_text: text });
		}

		if (!res.ok) {
			showError(
				editingCommentId ? 'Failed to save comment' : 'Failed to post comment',
				res.error?.message
			);
			return;
		}

		commentText = '';
		editingCommentId = null;
		await loadComments();
		onChange?.();
	};

	// React to entity changes only. `loadedKey` is a plain binding, not
	// $state, so the effect never re-triggers on its own bookkeeping; the
	// untrack() keeps `comments` / `commentText` mutations out of the
	// dependency set for the same reason.
	let loadedKey: string | null = null;

	$effect(() => {
		const key = entity ? `${entity.type}:${entity.id}` : null;

		untrack(() => {
			if (key === loadedKey) return;
			loadedKey = key;
			commentText = '';
			editingCommentId = null;

			if (key === null) {
				comments = [];
				return;
			}

			void loadComments();
		});
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col {className}">
	<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-auto px-4 py-3">
		{#if !entity}
			<div
				class="flex h-full items-center justify-center text-center text-xs text-muted-foreground"
			>
				{emptyLabel}
			</div>
		{:else if loading && comments.length === 0}
			<div class="flex h-full items-center justify-center text-xs text-muted-foreground">
				Loading…
			</div>
		{:else if comments.length === 0}
			<div
				class="flex h-full items-center justify-center text-center text-xs text-muted-foreground"
			>
				No comments yet. Be the first to leave one.
			</div>
		{:else}
			<Comments
				{comments}
				onEdit={editComment}
				onDelete={deleteComment}
				selected={editingCommentId}
			/>
		{/if}
	</div>

	{#if entity}
		<footer class="border-t border-border px-4 py-3 dark:border-slate-700">
			<MarkDownEditor
				value={commentText}
				onChange={(v) => (commentText = v)}
				onSave={saveComment}
				initialMode="edit"
			/>
			<div class="mt-2 flex items-center justify-end gap-2">
				{#if editingCommentId}
					<Button
						size="sm"
						variant="ghost"
						onclick={() => {
							commentText = '';
							editingCommentId = null;
						}}
					>
						Cancel
					</Button>
				{/if}
				<Button size="sm" onclick={saveComment} disabled={!commentText.trim()}>
					{editingCommentId ? 'Save' : 'Comment'}
				</Button>
			</div>
		</footer>
	{/if}
</div>
