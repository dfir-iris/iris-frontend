<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';

	type Props = {
		label: string;
		/** Plain value. Ignored when `children` is provided. */
		value?: string | number | null;
		/** Render the value in monospace — IPs, hashes, ids. */
		mono?: boolean;
		/** Offer a copy button on hover. Only for plain values. */
		copyable?: boolean;
		/** Rich value: badges, links, anything that isn't a string. */
		children?: Snippet;
	};

	let { label, value, mono = false, copyable = false, children }: Props = $props();

	const displayValue = $derived(
		value === null || value === undefined || value === '' ? 'N/A' : String(value)
	);
	const canCopy = $derived(copyable && displayValue !== 'N/A');
</script>

<div class="group/prop flex items-baseline justify-between gap-3 py-0.5 text-xs">
	<span class="shrink-0 text-muted-foreground">{label}</span>

	{#if children}
		<span class="min-w-0 text-right">{@render children()}</span>
	{:else}
		<span class="flex min-w-0 items-baseline gap-1">
			<span
				class={cn(
					'truncate text-right',
					mono && 'font-mono',
					displayValue === 'N/A' && 'text-muted-foreground'
				)}
				title={displayValue}
			>
				{displayValue}
			</span>

			{#if canCopy}
				<ClipboardCopy
					value={displayValue}
					className="hidden shrink-0 group-hover/prop:inline-flex"
					size={11}
				/>
			{/if}
		</span>
	{/if}
</div>
