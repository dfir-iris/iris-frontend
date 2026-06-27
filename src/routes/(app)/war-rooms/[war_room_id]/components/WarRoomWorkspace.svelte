<!--
  War-room equivalent of `CaseWorkspace`. Hosts the right-side
  datastore panel at the layout level so toggling it never tears
  down the active sub-page (Stream, Graph, Timelines, …).

  Children render into the main column inside a rounded card surface
  (matching the case workspace). When no side panel is open the main
  column takes the full width via `flex-1`. `bare` skips the rounded
  chrome when a child wants to own its own surface.
-->
<script lang="ts">
	import { getContext, type Snippet } from 'svelte';
	import {
		WAR_ROOM_DATASTORE_PANEL_CTX,
		type WarRoomDatastorePanelContext
	} from '$lib/contexts/war-room-panels.context.svelte';
	import WarRoomDatastorePanel from '$lib/components/common/WarRoom/WarRoomDatastorePanel.svelte';

	type Props = {
		children: Snippet;
		class?: string;
		bare?: boolean;
	};

	let { children, class: className = '', bare = false }: Props = $props();

	const datastorePanel = getContext<WarRoomDatastorePanelContext | undefined>(
		WAR_ROOM_DATASTORE_PANEL_CTX
	);
</script>

<div class="flex h-full w-full gap-3 p-3 sm:gap-4 sm:p-4">
	<div
		class={`flex h-full min-w-0 flex-1 overflow-hidden ${
			bare
				? ''
				: 'rounded-2xl border border-border/60 bg-card shadow-elevation-2'
		} ${className}`}
	>
		{@render children()}
	</div>

	{#if datastorePanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2"
			aria-label="War room datastore"
		>
			<WarRoomDatastorePanel />
		</aside>
	{/if}
</div>
