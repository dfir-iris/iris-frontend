<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import {
		ACTIVITY_PANEL_CTX,
		type ActivityPanelContext
	} from '$lib/contexts/activity-panel.context.svelte';
	import CommentsPanel from '$lib/components/common/Comments/CommentsPanel.svelte';
	import CaseActivityPanel from '$lib/components/common/Activity/CaseActivityPanel.svelte';

	type Props = {
		children: Snippet;
		class?: string;
		// When `bare`, the workspace renders its children directly without the
		// rounded card chrome (border + background + shadow). Use this when the
		// children already own their own card surfaces — otherwise you end up
		// with a card-in-a-card stack. The side panels are unaffected.
		bare?: boolean;
	};

	let { children, class: className = '', bare = false }: Props = $props();

	const commentsPanel = getContext<CommentsPanelContext | undefined>(COMMENTS_PANEL_CTX);
	const activityPanel = getContext<ActivityPanelContext | undefined>(ACTIVITY_PANEL_CTX);
</script>

<div class="flex h-full w-full gap-3 p-3 sm:gap-4 sm:p-4">
	<div
		class={`flex h-full min-w-0 flex-1 overflow-hidden ${bare ? '' : 'rounded-2xl border border-border/60 bg-card shadow-elevation-2'} ${className}`}
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

	{#if activityPanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2"
			aria-label="Case activity"
		>
			<CaseActivityPanel />
		</aside>
	{/if}
</div>
