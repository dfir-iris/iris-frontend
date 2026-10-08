<!-- Collapsible, pretty-printed JSON for the run inspector. -->
<script lang="ts">
	import { ChevronRightIcon } from 'lucide-svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';

	type Props = { label: string; value: unknown; open?: boolean };

	let { label, value, open = false }: Props = $props();

	let expanded = $state(false);
	$effect.pre(() => {
		expanded = open;
	});

	const text = $derived(
		typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value, null, 2)
	);
	const empty = $derived(value === null || value === undefined || text === '{}' || text === '');
</script>

<div class="min-w-0">
	<button
		type="button"
		class="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-60"
		aria-expanded={expanded}
		disabled={empty}
		onclick={() => (expanded = !expanded)}
	>
		<ChevronRightIcon size={11} class={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
		{label}
		{#if empty}<span class="font-normal">(empty)</span>{/if}
	</button>
	{#if expanded && !empty}
		<div class="relative mt-1">
			<pre
				class="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-2 font-mono text-2xs">{text}</pre>
			<div class="absolute right-1.5 top-1.5">
				<ClipboardCopy value={text} size={12} alwaysVisible />
			</div>
		</div>
	{/if}
</div>
