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
	<a {href} class="w-fit text-left text-primary underline">
		{label}
	</a>
</td>