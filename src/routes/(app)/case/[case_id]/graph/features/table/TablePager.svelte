<!-- Footer of a graph table: row counts, page buttons and an optional slot. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-svelte';

	interface Props {
		page: number;
		pages: number;
		/** Rows after the table filter. */
		total: number;
		/** Rows before it. */
		of: number;
		unit: string;
		onPage: (page: number) => void;
		children?: Snippet;
	}

	let { page, pages, total, of, unit, onPage, children }: Props = $props();

	const plural = (n: number) => `${n} ${unit}${n === 1 ? '' : 's'}`;
</script>

<div class="flex items-center gap-3 border-t px-3 py-1 text-[11px] text-muted-foreground">
	<span class="tabular-nums" aria-live="polite">
		{total === of ? plural(total) : `${total} of ${plural(of)}`}
	</span>
	{@render children?.()}
	{#if pages > 1}
		<nav class="ml-auto flex items-center gap-1" aria-label="Pages">
			<button
				type="button"
				class="rounded p-0.5 hover:bg-accent disabled:opacity-40"
				disabled={page <= 1}
				aria-label="Previous page"
				onclick={() => onPage(page - 1)}
			>
				<ChevronLeftIcon class="h-3.5 w-3.5" />
			</button>
			<span class="tabular-nums">{page} / {pages}</span>
			<button
				type="button"
				class="rounded p-0.5 hover:bg-accent disabled:opacity-40"
				disabled={page >= pages}
				aria-label="Next page"
				onclick={() => onPage(page + 1)}
			>
				<ChevronRightIcon class="h-3.5 w-3.5" />
			</button>
		</nav>
	{/if}
</div>
