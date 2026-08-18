<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<div>
	<h4 class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
		{title}
	</h4>

	{@render children()}
</div>
