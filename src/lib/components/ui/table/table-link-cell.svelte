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
	  `text-primary` is correct in both themes now: `--primary` is defined
	  per-theme in app.css (deep blue on white, 60%-lightness blue on dark).
	  This used to carry a `dark:text-blue-400` override because the dark
	  theme reused the light navy — don't re-add one here, fix the token.
	-->
	<a {href} class="w-fit text-left text-primary underline hover:no-underline">
		{label}
	</a>
</td>
