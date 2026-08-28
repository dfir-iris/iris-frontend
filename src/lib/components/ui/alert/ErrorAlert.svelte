<script lang="ts">
	import { AlertOctagonIcon } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	interface AlertProps {
		children: Snippet;
	}

	const { children }: AlertProps = $props();
</script>

<div
	class="flex flex-row items-center gap-x-2 rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive dark:bg-destructive/50 dark:text-destructive-foreground"
>
	<AlertOctagonIcon size={22} />
	{@render children()}
</div>
