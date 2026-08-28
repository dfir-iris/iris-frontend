<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';

	let { ...restProps }: { to?: HTMLElement | string; disabled?: boolean; children?: import('svelte').Snippet } = $props();
</script>

<SheetPrimitive.Portal {...restProps} />
