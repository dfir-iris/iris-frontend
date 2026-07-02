<!--
  Alerts layout. Mounts a workspace-wide `CommentsPanel` so the alert
  list page and the alert detail page can share the same side panel UX
  as the case workspace. Pages call `commentsPanel.open({ type: 'alerts',
  id, label })` instead of toggling a per-alert modal.

  When the panel closes after a comment was created / edited / deleted,
  we refresh the alert it was attached to so the comment-count badge on
  the card stays accurate without the caller having to thread a manual
  callback through.
-->
<script lang="ts">
	import { getContext, setContext, type Snippet } from 'svelte';
	import {
		COMMENTS_PANEL_CTX,
		createCommentsPanelContext,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import {
		INVESTIGATION_FLOW_PANEL_CTX,
		createInvestigationFlowPanelContext,
		type InvestigationFlowPanelContext
	} from '$lib/contexts/investigation-flow-panel.context.svelte';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import CommentsPanel from '$lib/components/common/Comments/CommentsPanel.svelte';
	import InvestigationFlowPanel from '$lib/components/common/InvestigationFlow/InvestigationFlowPanel.svelte';

	let { children }: { children: Snippet } = $props();

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	const commentsPanel = createCommentsPanelContext();
	setContext<CommentsPanelContext>(COMMENTS_PANEL_CTX, commentsPanel);

	const investigationFlowPanel = createInvestigationFlowPanelContext();
	setContext<InvestigationFlowPanelContext>(INVESTIGATION_FLOW_PANEL_CTX, investigationFlowPanel);

	// Refresh the alert whenever the panel closes against an entity, so
	// the comment count badge on the AlertCard reflects any change the
	// user made while the panel was open. We track the last entity so the
	// reload triggers on the open → closed transition and not on every
	// state read.
	let trackedAlertId = $state<number | null>(null);

	$effect(() => {
		const open = commentsPanel.state.open;
		const entity = commentsPanel.state.entity;

		if (open && entity?.type === 'alerts') {
			trackedAlertId = entity.id;
			return;
		}

		if (!open && trackedAlertId !== null) {
			const id = trackedAlertId;
			trackedAlertId = null;
			void alerts.get(id);
		}
	});
</script>

<!--
  Side-by-side row that fills the (app) scroll viewport. The page on
  the left owns its own internal scroll for the alert list so that the
  filter strip and bulk-action bar stay fixed while the cards scroll;
  the comments aside stays full-height alongside it.

  `h-full` (not `min-h-full`) is intentional: the alerts page sets up
  an internal flex column with `overflow-auto` on the alert list, and
  that only kicks in when its parent has a bounded height. Letting the
  row grow with content would just push the whole row past the
  viewport and rely on the ancestor's scroll, which is what the old
  layout did.
-->
<div class="flex h-full w-full grow gap-3 sm:gap-4">
	{#if investigationFlowPanel.state.open}
		<aside
			class="my-3 ml-3 h-[calc(100%-1.5rem)] w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2 sm:my-4 sm:ml-4 sm:h-[calc(100%-2rem)]"
			aria-label="Investigation flow"
		>
			<InvestigationFlowPanel />
		</aside>
	{/if}

	<div class="flex min-h-0 min-w-0 flex-1 flex-col">
		{@render children()}
	</div>

	{#if commentsPanel.state.open}
		<aside
			class="my-3 mr-3 h-[calc(100%-1.5rem)] w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2 sm:my-4 sm:mr-4 sm:h-[calc(100%-2rem)]"
			aria-label="Comments"
		>
			<CommentsPanel />
		</aside>
	{/if}
</div>
