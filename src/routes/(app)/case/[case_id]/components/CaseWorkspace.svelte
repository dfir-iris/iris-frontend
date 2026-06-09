<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
		class?: string;
	};

	let { children, class: className = '' }: Props = $props();
</script>

<div class="h-full w-full p-3 sm:p-4">
	<div
		class="flex h-full w-full overflow-hidden rounded-2xl border border-border/60 bg-card shadow-elevation-2 {className}"
	>
		{@render children()}
	</div>
</div>
