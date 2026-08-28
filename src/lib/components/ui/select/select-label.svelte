<script lang="ts">
	import { cn } from '$lib/utils.js';

	let { class: className, ...restProps }: { class?: string; [key: string]: unknown } = $props();
</script>

<div class={cn('px-2 py-1.5 text-sm font-semibold', className)} {...restProps as Record<string, unknown>}></div>
