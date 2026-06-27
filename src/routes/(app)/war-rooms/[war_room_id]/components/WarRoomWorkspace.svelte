<!--
  War-room equivalent of `CaseWorkspace`. Hosts the right-side activity
  and datastore panels at the layout level so toggling them never tears
  down the active sub-page (chat, graph, timelines, …).

  Children render into the main column; opening a panel adds it as a
  sibling on the right. Same chrome rules as the case workspace:
  `bare` skips the rounded card so a child can own its own surface.
-->
<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import {
		WAR_ROOM_ACTIVITY_PANEL_CTX,
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomActivityPanelContext,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import WarRoomActivityPanel from '$lib/components/common/WarRoom/WarRoomActivityPanel.svelte';
	import WarRoomDatastorePanel from '$lib/components/common/WarRoom/WarRoomDatastorePanel.svelte';

	type Props = {
		children: Snippet;
		class?: string;
		bare?: boolean;
	};

	let { children, class: className = '', bare = false }: Props = $props();

	const callerSetsOverflow = $derived(/\boverflow(?:-[xy])?-/.test(className));
	const defaultOverflow = $derived(
		callerSetsOverflow ? '' : bare ? '' : 'overflow-hidden'
	);

	const activityPanel = getContext<WarRoomActivityPanelContext | undefined>(
		WAR_ROOM_ACTIVITY_PANEL_CTX
	);
	const datastorePanel = getContext<WarRoomDatastorePanelContext | undefined>(
		WAR_ROOM_DATASTORE_PANEL_CTX
	);
</script>

<div
	class="flex {bare ? 'min-h-full' : 'h-full'} w-full gap-3 p-3 sm:gap-4 sm:p-4"
>
	<div
		class={`flex min-w-0 flex-1 ${bare ? '' : 'h-full'} ${defaultOverflow} ${
			bare
				? ''
				: 'rounded-2xl border border-border/60 bg-card shadow-elevation-2'
		} ${className}`}
	>
		{@render children()}
	</div>

	{#if activityPanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2"
			aria-label="War room activity"
		>
			<WarRoomActivityPanel />
		</aside>
	{/if}

	{#if datastorePanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2"
			aria-label="War room datastore"
		>
			<WarRoomDatastorePanel />
		</aside>
	{/if}
</div>
