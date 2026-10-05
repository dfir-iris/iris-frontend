<!--
  One block of an editor tab. On wide screens the title and hint sit in
  a left column and the fields on the right, the usual settings layout;
  narrower, they stack. Blocks are separated by a rule, not boxed.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		title: string;
		description?: string;
		/** Under the title: a switch, a badge… */
		actions?: Snippet;
		children: Snippet;
		testId?: string;
	};

	let { title, description, actions, children, testId }: Props = $props();
</script>

<section
	class="grid grid-cols-1 gap-x-10 gap-y-3 border-b py-6 first:pt-0 last:border-b-0 xl:grid-cols-[240px_minmax(0,1fr)]"
	data-testid={testId}
>
	<header class="flex flex-col gap-1">
		<h2 class="text-sm font-semibold">{title}</h2>
		{#if description}
			<p class="text-xs leading-relaxed text-muted-foreground">{description}</p>
		{/if}
		{#if actions}
			<div class="mt-2 flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</header>
	<div class="flex min-w-0 flex-col gap-3">
		{@render children()}
	</div>
</section>
