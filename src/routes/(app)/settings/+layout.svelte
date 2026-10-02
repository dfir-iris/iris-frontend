<script lang="ts">
	import { type Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { data: _data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<!--
  The list of settings pages lives in the side bar, as the Settings
  group's sub-menu (`SideNav`), so the page gets the full width.

  `h-full w-full` — NOT `h-screen w-screen`. The settings layout sits
  inside the (app) layout's scroll viewport, which is already
  `viewport - topbar` tall. Claiming `h-screen` makes this container
  taller than its parent by exactly the topbar height; the surplus
  spills out the bottom and forces the parent (app) viewport to
  scroll. `overflow-hidden` plus a real height makes the viewport our
  hard ceiling so each settings page can manage its own internal scroll.
-->
<div class="flex h-full w-full overflow-hidden p-4">
	<!--
	  Main page content. Uses `bg-card` (whiter than the page-level
	  `bg-background` grey) so the pane reads as a raised surface.
	-->
	<div class="shadow-elevation-1 flex h-full min-w-0 flex-1 flex-col rounded-md border bg-card">
		{@render children()}
	</div>
</div>
