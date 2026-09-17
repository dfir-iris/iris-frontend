<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type $$Props = HTMLAttributes<HTMLTableSectionElement>;

	let className: $$Props['class'] = undefined;
	export { className as class };
</script>

<!--
  `text-foreground`, not `text-primary-foreground`: the footer sits on
  `bg-muted`, not on `bg-primary`. It only ever looked right because both
  tokens happened to be near-white; they no longer are in dark mode.
-->
<tfoot class={cn('bg-muted/50 font-medium text-foreground', className)} {...$$restProps}>
	<slot />
</tfoot>
