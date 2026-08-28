<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: DialogPrimitive.TriggerProps & { children?: Snippet } = $props();
</script>

<DialogPrimitive.Trigger bind:ref {...restProps}>
	{@render children?.()}
</DialogPrimitive.Trigger>
