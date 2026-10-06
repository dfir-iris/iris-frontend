<script lang="ts">
	import { AlarmClockIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils.js';

	/** Due date of a finding; red when the backend flags it overdue. */
	let {
		dueDate,
		overdue = false,
		class: className = ''
	}: {
		dueDate: string | null;
		overdue?: boolean;
		class?: string;
	} = $props();
</script>

{#if dueDate}
	<span
		class={cn(
			'inline-flex items-center gap-1 whitespace-nowrap tabular-nums',
			overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground',
			className
		)}
		title={overdue ? 'Overdue' : 'Due date'}
	>
		{#if overdue}<AlarmClockIcon class="size-3.5" />{/if}
		{dueDate.slice(0, 10)}
	</span>
{:else}
	<span class={cn('text-muted-foreground', className)}>—</span>
{/if}
