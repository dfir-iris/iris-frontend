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
	import {
		DATASTORE_PANEL_CTX,
		type DatastorePanelContext
	} from '$lib/contexts/datastore-panel.context.svelte';
	import CommentsPanel from '$lib/components/common/Comments/CommentsPanel.svelte';
	import CaseActivityPanel from '$lib/components/common/Activity/CaseActivityPanel.svelte';
	import CaseDatastorePanel from '$lib/components/common/Datastore/CaseDatastorePanel.svelte';

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

	// Overflow handling differs between `bare` and the default card mode:
	//   • Card mode wants `overflow-hidden` so the rounded chrome clips
	//     its inner header / content cleanly.
	//   • `bare` mode has no chrome to clip and is meant to let the
	//     page-level scroll container ((app)/+layout.svelte's
	//     overflow-auto div) handle scrolling. Forcing `overflow-hidden`
	//     here clips long content (e.g. the case-summary editor with a
	//     large pasted document) with no visible scrollbar.
	// In either case, a page may still pass an explicit overflow-* class
	// via `class` to override the default; we skip ours then to avoid two
	// competing overflow rules on the same element (Tailwind's class
	// order is by generated-CSS position, not by class-attribute order,
	// so the "later wins" intuition doesn't hold).
	const callerSetsOverflow = $derived(/\boverflow(?:-[xy])?-/.test(className));
	const defaultOverflow = $derived(callerSetsOverflow ? '' : bare ? '' : 'overflow-hidden');

	const commentsPanel = getContext<CommentsPanelContext | undefined>(COMMENTS_PANEL_CTX);
	const activityPanel = getContext<ActivityPanelContext | undefined>(ACTIVITY_PANEL_CTX);
	const datastorePanel = getContext<DatastorePanelContext | undefined>(DATASTORE_PANEL_CTX);
</script>

<!--
  Height handling: in `bare` mode we let content size the wrapper so the
  page-level scroll container (in (app)/+layout.svelte) can scroll past
  the viewport. In card mode we keep `h-full` so the main column fills
  its slot. Side panels always need `h-full` themselves so they don't
  collapse — they live as siblings below.
-->
<!--
  VISUAL TEST (full-bleed): the outer padding and the inter-column gap are
  gone in BOTH modes, so page content sits flush against the sidebar, the
  case topbar and the viewport edges. The main column keeps `bg-card` as
  its surface but drops the rounded/bordered/shadowed chrome; side panels
  are separated by a `border-l` hairline instead of a gap.
-->
<div class="flex {bare ? 'min-h-full' : 'h-full'} w-full">
	<div
		class={`flex min-w-0 flex-1 ${bare ? '' : 'h-full'} ${defaultOverflow} ${bare ? '' : 'bg-card'} ${className}`}
	>
		{@render children()}
	</div>

	{#if commentsPanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden border-l border-border/60 bg-card"
			aria-label="Comments"
		>
			<CommentsPanel />
		</aside>
	{/if}

	{#if activityPanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden border-l border-border/60 bg-card"
			aria-label="Case activity"
		>
			<CaseActivityPanel />
		</aside>
	{/if}

	{#if datastorePanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden border-l border-border/60 bg-card"
			aria-label="DataStore"
		>
			<CaseDatastorePanel />
		</aside>
	{/if}
</div>
