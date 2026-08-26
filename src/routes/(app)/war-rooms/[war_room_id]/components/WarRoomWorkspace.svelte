<!--
  War-room equivalent of `CaseWorkspace`. Hosts the right-side
  datastore panel at the layout level so toggling it never tears
  down the active sub-page (Stream, Graph, Timelines, …).

  Children render into the main column, which spans the full workspace
  (matching the case workspace). When no side panel is open the main
  column takes the full width via `flex-1`. `bare` skips the `bg-card`
  surface when a child wants to own its own background.
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

<!--
  VISUAL TEST (full-bleed): outer padding and the inter-column gap are
  gone, so page content sits flush against the sidebar, the war-room tabs
  and the viewport edges. The main column keeps `bg-card` as its surface
  but drops the rounded/bordered/shadowed chrome; the datastore panel is
  separated by a `border-l` hairline instead of a gap. Mirrors the same
  change in `CaseWorkspace`.
-->
<div class="flex h-full w-full">
	<div class={`flex h-full min-w-0 flex-1 overflow-hidden ${bare ? '' : 'bg-card'} ${className}`}>
		{@render children()}
	</div>

	{#if datastorePanel?.state.open}
		<aside
			class="h-full w-full max-w-md shrink-0 overflow-hidden border-l border-border/60 bg-card"
			aria-label="War room datastore"
		>
			<WarRoomDatastorePanel />
		</aside>
	{/if}
</div>
