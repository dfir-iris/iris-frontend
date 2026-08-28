<script lang="ts">
	import { SquarePenIcon, Trash2Icon } from 'lucide-svelte';
	import type { Comment } from '$lib/services/comments.service';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import { MarkDownPreview } from '../MarkDown';

	type Props = {
		comments: Comment[];
		onDelete: (commentId: number) => void;
		onEdit: (commentId: number) => void;
		selected?: number | null;
	};

	let { comments, onDelete, onEdit, selected }: Props = $props();

	let sortedComments = $derived(
		[...comments].sort(
			(a, b) => new Date(a.comment_date).getTime() - new Date(b.comment_date).getTime()
		)
	);
</script>

<ul class="flex flex-col gap-2">
	{#each sortedComments as comment}
		<li
			class={`rounded-lg border bg-muted/20 px-3 py-2.5 transition-colors ${selected === comment.comment_id ? 'border-orange-400/60 bg-orange-50/10' : 'border-border/40'}`}
		>
			<div class="flex items-center justify-between gap-2">
				<div class="flex items-center gap-2">
					<UserAvatar
						userId={comment.user.user_id ?? comment.user.id}
						name={comment.user.user_name}
						size="size-6"
					/>

					<span class="text-2xs font-medium text-foreground">{comment.user.user_name}</span>

					<span class="text-2xs text-muted-foreground">
						{new Date(comment.comment_date).toLocaleDateString()}
						{new Date(comment.comment_date).toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit'
						})}
					</span>
				</div>

				<div class="flex items-center gap-1.5">
					<button
						class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onclick={() => onEdit(comment.comment_id)}
					>
						<SquarePenIcon size="12" />
					</button>

					<button
						class="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-500"
						onclick={() => onDelete(comment.comment_id)}
					>
						<Trash2Icon size="12" />
					</button>
				</div>
			</div>

			<div class="mt-1.5 pl-8 text-xs [&_.prose]:text-xs">
				<MarkDownPreview markdown={comment.comment_text} />
			</div>
		</li>
	{/each}
</ul>
