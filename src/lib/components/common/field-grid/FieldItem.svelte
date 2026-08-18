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
		/** Rich value: badges, status pickers, links. */
		children?: Snippet;
	};

	let { label, value, mono = false, copyable = false, children }: Props = $props();

	const isEmpty = $derived(!children && (value === null || value === undefined || value === ''));
	// Empty fields keep their slot instead of collapsing: the board must not
	// reflow as the analyst clicks from one asset to the next.
	const displayValue = $derived(isEmpty ? 'Not set' : String(value));
	const canCopy = $derived(copyable && !isEmpty);
</script>

<div
	class="group/field flex items-baseline gap-2 border-b border-dotted border-border/70 py-1 text-xs"
>
	<dt class="w-[4.75rem] shrink-0 truncate text-2xs uppercase tracking-wide text-muted-foreground">
		{label}
	</dt>

	<dd class="m-0 flex min-w-0 items-baseline gap-1">
		{#if children}
			{@render children()}
		{:else}
			<span
				class={cn(
					'truncate font-medium',
					mono && 'font-mono',
					isEmpty && 'font-normal text-muted-foreground/60'
				)}
				title={displayValue}
			>
				{displayValue}
			</span>

			{#if canCopy}
				<ClipboardCopy
					value={displayValue}
					className="hidden shrink-0 group-hover/field:inline-flex"
					size={11}
				/>
			{/if}
		{/if}
	</dd>
</div>
