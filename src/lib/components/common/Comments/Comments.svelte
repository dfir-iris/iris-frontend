<script lang="ts">
	import type { Comment } from '$lib/services/comments.service';
	import { getInitials } from '$lib/utils';
	import { SquarePenIcon, Trash2Icon } from 'lucide-svelte';
	import Preview from '../Ace/Preview.svelte';

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

<ul class="flex flex-col gap-4">
	{#each sortedComments as comment}
		<li class="flex flex-col">
			<div class="relative flex min-h-24 w-full justify-end">
				<div
					class="absolute left-0 top-6 flex h-12 w-12 items-center justify-center rounded-full bg-blue-400 text-xl text-white"
				>
					{getInitials(comment.user.user_name)}
				</div>

				<div class="relative flex items-center gap-4 text-xs">
					<button
						class="flex transition-all hover:opacity-50"
						onclick={() => onEdit(comment.comment_id)}
					>
						<SquarePenIcon size="14" />
					</button>

					<button
						class="flex transition-all hover:opacity-50"
						onclick={() => onDelete(comment.comment_id)}
					>
						<Trash2Icon size="14" />
					</button>

					<div class="flex">
						{new Date(comment.comment_date).toLocaleDateString()}
						{new Date(comment.comment_date).toLocaleTimeString()}
					</div>
				</div>
			</div>

			<div
				class={`relative -mt-6 ml-6 flex rounded-es-2xl border-b border-l  px-6 pb-4 ${selected && selected === comment.comment_id ? 'border-orange-300' : 'border-gray-300'}`}
			>
				<Preview markdown={comment.comment_text} />
			</div>
		</li>
	{/each}
</ul>
