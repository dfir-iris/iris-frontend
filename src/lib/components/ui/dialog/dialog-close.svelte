<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: DialogPrimitive.CloseProps & { children?: Snippet } = $props();
</script>

<DialogPrimitive.Close bind:ref {...restProps}>
	{@render children?.()}
</DialogPrimitive.Close>
