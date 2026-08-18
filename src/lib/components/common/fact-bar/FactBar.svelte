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
		'flex flex-wrap items-center gap-y-0.5 border-b border-border bg-muted/30 px-3.5 py-2',
		className
	)}
>
	{@render children()}
</div>
