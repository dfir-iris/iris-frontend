<script lang="ts">
	let {
		page = 1,
		pages,
		onPageChange
	}: {
		page: number;
		pages: number;
		onPageChange: (page: number) => void;
	} = $props();

	// Returns the sequence of page numbers and ellipsis markers to render.
	// Always anchors on 1 and `pages`; shows a 3-page window around the
	// current page; bridges gaps of 1 with the real page number instead of
	// a lone ellipsis (e.g. [1, 2, 3] not [1, …, 3]).
	const getVisiblePages = (cur: number, total: number): Array<number | 'ellipsis'> => {
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

		const win = new Set([1, total, cur - 1, cur, cur + 1].filter((n) => n >= 1 && n <= total));
		const sorted = [...win].sort((a, b) => a - b);

		const result: Array<number | 'ellipsis'> = [];
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i] - sorted[i - 1] === 2) {
				// Gap of exactly 1 — fill with the real page number.
				result.push(sorted[i] - 1);
			} else if (i > 0 && sorted[i] - sorted[i - 1] > 2) {
				result.push('ellipsis');
			}
			result.push(sorted[i]);
		}
		return result;
	};

	const visiblePages = $derived(getVisiblePages(page, pages));
</script>

<div class="flex flex-wrap items-center gap-1">
	{#if page > 1}
		<button
			class="flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs transition-colors hover:bg-muted"
			onclick={() => onPageChange(page - 1)}>← Prev</button
		>
	{/if}

	{#each visiblePages as item}
		{#if item === 'ellipsis'}
			<div class="flex h-7 w-7 shrink-0 items-center justify-center text-xs text-muted-foreground">
				...
			</div>
		{:else}
			<button
				class={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border px-1.5 text-xs transition-colors ${page === item ? 'bg-iris-blue border-iris-blue text-white shadow-sm' : 'hover:bg-muted'}`}
				onclick={() => onPageChange(item)}
			>
				{item}
			</button>
		{/if}
	{/each}

	{#if page < pages}
		<button
			class="flex h-7 shrink-0 items-center rounded-full border px-2.5 text-xs transition-colors hover:bg-muted"
			onclick={() => onPageChange(page + 1)}>Next →</button
		>
	{/if}
</div>
