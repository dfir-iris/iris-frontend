<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';

	type Props = {
		/** Dropped for values that read as their own label — a TLP or status chip. */
		label?: string;
		/** Plain value. Ignored when `children` is provided. */
		value?: string | number | null;
		/** Render the value in monospace — IPs, hashes, ids. */
		mono?: boolean;
		/** Offer a copy button on hover. Only for plain values. */
		copyable?: boolean;
		/** Rich value: badges, chips, status pickers. */
		children?: Snippet;
	};

	let { label, value, mono = false, copyable = false, children }: Props = $props();

	// An empty fact renders nothing at all. That is the whole point of the
	// strip — it carries what this entity has, not a fixed set of slots.
	const isEmpty = $derived(!children && (value === null || value === undefined || value === ''));
	const text = $derived(String(value ?? ''));
</script>

{#if !isEmpty}
	<!--
	  The divider is the `::after` rule rather than a real element so that
	  `last:` can drop it: which fact ends up last depends on which ones had
	  values, and that is only known at render time.
	-->
	<span
		class="group/fact relative mr-3 inline-flex max-w-full items-baseline gap-1.5 py-0.5 pr-3 text-xs after:absolute after:inset-y-0.5 after:right-0 after:w-px after:bg-border after:content-[''] last:mr-0 last:pr-0 last:after:hidden"
	>
		{#if label}
			<span class="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">{label}</span>
		{/if}

		{#if children}
			{@render children()}
		{:else}
			<span class={cn('min-w-0 break-all font-medium', mono && 'font-mono')}>{text}</span>

			{#if copyable}
				<ClipboardCopy
					value={text}
					className="hidden shrink-0 group-hover/fact:inline-flex"
					size={11}
				/>
			{/if}
		{/if}
	</span>
{/if}
