<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import CommentsPanel from '$lib/components/common/Comments/CommentsPanel.svelte';

	type Props = {
		children: Snippet;
		class?: string;
	};

	let { children, class: className = '' }: Props = $props();

	const commentsPanel = getContext<CommentsPanelContext | undefined>(COMMENTS_PANEL_CTX);
</script>

<div class="flex h-full w-full gap-3 p-3 sm:gap-4 sm:p-4">
	<div
		class="flex h-full min-w-0 flex-1 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2 {className}"
	>
		{@render children()}
	</div>

	{#if commentsPanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2"
			aria-label="Comments"
		>
			<CommentsPanel />
		</aside>
	{/if}
</div>
