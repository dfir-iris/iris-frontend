<!--
  Right-hand rail of scalar properties for a detail pane.

  Detail panes used to stack every value vertically in padded cards, which
  spent ~600px of height on a handful of short strings and left the pane's
  width unused. The rail parks all the scalars in a fixed column so the main
  column keeps its full width for the things that actually grow — markdown
  descriptions, tags, attachments.

  Compose with PropertyGroup / PropertyItem.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	let { children, class: className }: { children: Snippet; class?: string } = $props();
</script>

<aside
	class={cn(
		'flex shrink-0 flex-col gap-3 border-l border-border bg-muted/25 px-3 py-2.5',
		className
	)}
>
	{@render children()}
</aside>
