<script lang="ts">
	import type { HTMLTdAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type $$Props = HTMLTdAttributes & {
		href: string;
		label: string;
	};

	export let href: $$Props['href'];
	export let label: $$Props['label'];

	let className: $$Props['class'] = undefined;
	export { className as class };
</script>

<td
	class={cn(
		'p-2 align-middle first:font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
		className
	)}
	{...$$restProps}
	on:click
	on:keydown
>
	<!--
	  Light mode uses the brand `--primary` (deep blue) which reads well on
	  white. In dark mode `--primary` is still that deep blue (22% L) so
	  it disappears against the dark table background — switch to a
	  lighter blue (blue-400) for dark to keep contrast above 4.5:1.
	  Touching this one component is preferable to flipping `--primary`
	  globally, which would knock buttons / focus rings out of brand.
	-->
	<a
		{href}
		class="w-fit text-left text-primary underline hover:no-underline dark:text-blue-400 dark:hover:text-blue-300"
	>
		{label}
	</a>
</td>