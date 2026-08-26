<!--
  One divider-separated strip of inline facts, sitting directly under the tab
  bar of an entity detail pane.

  There are no columns: a fact that has no value is simply not emitted, so a
  sparse entity produces one short line and its description starts near the
  top of the pane instead of beside a column of "N/A".
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let { children, class: className }: { children: Snippet; class?: string } = $props();
</script>

<div
	class={cn(
		// VISUAL TEST (lighter chrome): the tinted band and its bottom rule
		// are gone. The facts are already delimited from each other by the
		// hairlines in `Fact`, and from the description below by padding —
		// a full-width band on top of that was a third layer of separation.
		'flex flex-wrap items-center gap-y-0.5 px-3.5 pb-1.5 pt-2.5',
		className
	)}
>
	{@render children()}
</div>
