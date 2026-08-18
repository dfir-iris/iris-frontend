<!--
  Field board for an entity detail pane: a tinted band of aligned
  label/value pairs that runs horizontally under the tab bar, above the
  prose.

  Columns rather than a side rail because an analyst clicking down a list of
  assets compares the *same* field over and over — a fixed x-position for
  "IP" is worth more than the vertical space a rail saves, and a rail leaves
  the prose column empty whenever the entity is sparse.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';

	type Props = {
		children: Snippet;
		class?: string;
	};

	let { children, class: className }: Props = $props();
</script>

<dl
	class={cn(
		'm-0 grid grid-cols-1 gap-x-6 border-b border-border bg-muted/30 px-4 pb-1.5 pt-2 sm:grid-cols-2 xl:grid-cols-3',
		className
	)}
>
	{@render children()}
</dl>
