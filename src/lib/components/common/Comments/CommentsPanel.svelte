<!--
  Sliding side panel that hosts a comments thread for any case entity
  (event / asset / IOC / note / task / alert / evidence). Lives at the
  case workspace level so it doesn't tear down when the user navigates
  between detail pages. Driven by the `comments-panel.context` store.

  The panel handles its own data lifecycle: when `entity` changes it
  re-fetches comments, clears the composer, and resets the scroll. A
  caller only needs to call `commentsPanel.open({ type, id, label })`
  — no clean-up callbacks required.
-->
<script lang="ts">
	import { tick, getContext, untrack } from 'svelte';
	import { XIcon, RefreshCwIcon, MessageSquareIcon } from 'lucide-svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import type { RequestResponse } from '$lib/services/api.service';
	import { CommentsService, type Comment } from '$lib/services/comments.service';
	import { Comments } from '$lib/components/common/Comments';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import Button from '$lib/components/ui/button/button.svelte';
	import { toast } from '$lib/components/ui/toast';

	const panel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);

	const showError = (msg: string, detail?: string) =>
		toast({ title: msg, description: detail, variant: 'destructive' });

	let comments = $state<Comment[]>([]);
	let commentText = $state('');
	let editingCommentId = $state<number | null>(null);
	let loading = $state(false);
	let scrollEl = $state<HTMLDivElement | null>(null);

	const scrollToBottom = async () => {
		await tick();
		if (!scrollEl) return;
		scrollEl.scrollTop = scrollEl.scrollHeight;
	};

	const loadComments = async () => {
		const entity = panel.state.entity;
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

	const getCommentById = (id: number): Comment | undefined =>
		comments.find((c) => c.comment_id === id);

	const editComment = (id: number) => {
		const c = getCommentById(id);
		if (!c) return;
		commentText = c.comment_text ?? '';
		editingCommentId = id;
	};

	const deleteComment = async (id: number) => {
		const entity = panel.state.entity;
		if (!entity) return;

		const res = await CommentsService.remove(entity.type, entity.id, id);
		if (!res.ok) {
			showError('Failed to delete comment', res.error?.message);
			return;
		}

		await loadComments();
	};

	const saveComment = async () => {
		const entity = panel.state.entity;
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
	};

	// React to entity changes. The untrack() prevents this effect from
	// re-running when loadComments mutates `comments` (we only want it to
	// fire when the entity identity actually changes).
	$effect(() => {
		const entity = panel.state.entity;
		untrack(() => {
			commentText = '';
			editingCommentId = null;
			if (entity && panel.state.open) {
				void loadComments();
			} else if (!entity) {
				comments = [];
			}
		});
	});

	// Escape-to-close
	$effect(() => {
		if (!panel.state.open) return;

		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') panel.close();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	});
</script>

{#if panel.state.open}
	<!--
	  Rendered inside CaseWorkspace as a sibling rounded card. The host
	  component owns the outer aside + corners; we just fill it.
	-->
	<div class="flex h-full w-full flex-col">
		<header class="flex items-center gap-2 border-b border-border px-4 py-3 dark:border-slate-700">
			<MessageSquareIcon class="size-4 shrink-0 text-muted-foreground" />
			<div class="min-w-0 flex-1">
				<div class="text-2xs uppercase tracking-wide text-muted-foreground">Comments</div>
				{#if panel.state.entity}
					<div class="truncate text-sm font-semibold">{panel.state.entity.label}</div>
				{:else}
					<div class="truncate text-sm italic text-muted-foreground">No selection</div>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={loadComments}
				disabled={!panel.state.entity || loading}
				aria-label="Refresh comments"
			>
				<RefreshCwIcon class={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				class="size-7"
				onclick={() => panel.close()}
				aria-label="Close comments panel"
			>
				<XIcon class="size-4" />
			</Button>
		</header>

		<div bind:this={scrollEl} class="min-h-0 flex-1 overflow-auto px-4 py-3">
			{#if !panel.state.entity}
				<div
					class="flex h-full items-center justify-center text-center text-xs text-muted-foreground"
				>
					Select an item to view its comments.
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

		{#if panel.state.entity}
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
{/if}
