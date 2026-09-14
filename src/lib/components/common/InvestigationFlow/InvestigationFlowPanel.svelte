<!--
  Right-side pane rendering the investigation flow (guided triage
  checklist) attached to an alert. Mirrors the shape of CommentsPanel:
  lives at the alerts layout, driven by a workspace context, re-loads
  whenever the panel's entity changes.

  The checklist itself is `InvestigationFlowSteps` — shared with the
  split-view detail pane, which frames it as a tab rather than an aside.
  What stays here is the panel chrome: flow name, refresh, close.
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { CheckSquareIcon, RefreshCwIcon, XIcon } from 'lucide-svelte';
	import {
		INVESTIGATION_FLOW_PANEL_CTX,
		type InvestigationFlowPanelContext
	} from '$lib/contexts/investigation-flow-panel.context.svelte';
	import type { AlertInvestigationOverview } from '$lib/types/resources/investigation-flow';
	import { Button } from '$lib/components/ui/button';
	import InvestigationFlowSteps from './InvestigationFlowSteps.svelte';

	const panel = getContext<InvestigationFlowPanelContext>(INVESTIGATION_FLOW_PANEL_CTX);

	// The checklist owns the fetching; the header only needs the flow name
	// out of it, and a handle to re-run the load behind the refresh button.
	let steps = $state<ReturnType<typeof InvestigationFlowSteps> | null>(null);
	let flowName = $state<string | null>(null);
	let refreshing = $state(false);

	const refresh = async () => {
		refreshing = true;

		try {
			await steps?.load();
		} finally {
			refreshing = false;
		}
	};

	const onLoaded = (overview: AlertInvestigationOverview | null) => {
		flowName = overview?.flow_name ?? null;
	};
</script>

<!--
  No inner background — the host `<aside>` already provides `bg-card`
  (the same white/elevated surface the CommentsPanel sits on). Setting
  `bg-background` here would paint the darker page grey over that card,
  which is what the previous version was doing.
-->
<div class="flex h-full w-full flex-col">
	<!-- ————— Header ————— -->
	<header
		class="flex items-center justify-between border-b border-border px-4 py-3 dark:border-slate-700"
	>
		<div class="flex min-w-0 items-center gap-2">
			<CheckSquareIcon class="h-4 w-4 shrink-0 text-primary" />
			<div class="min-w-0">
				<p class="text-sm font-semibold">Investigation flow</p>
				{#if flowName}
					<p class="truncate text-xs text-muted-foreground">
						{flowName}
					</p>
				{/if}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				onclick={refresh}
				disabled={refreshing}
				aria-label="Refresh"
			>
				<RefreshCwIcon class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
			</Button>
			<Button variant="ghost" size="icon" onclick={panel.close} aria-label="Close">
				<XIcon class="h-4 w-4" />
			</Button>
		</div>
	</header>

	<InvestigationFlowSteps bind:this={steps} alertId={panel.state.entity?.id ?? null} {onLoaded} />
</div>
