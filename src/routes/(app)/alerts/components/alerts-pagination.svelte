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

	const getVisiblePages = (page: number, pages: number): Array<number | 'ellipsis'> => {
		if (pages <= 7) {
			return Array.from({ length: pages }, (_, i) => i + 1);
		}

		const firstPages = [1, 2, 3];
		const lastPages = [pages - 2, pages - 1, pages];

		if (page < 4) {
			return [...firstPages, 'ellipsis', ...lastPages];
		}

		if (page >= pages - 3) {
			return [...firstPages, 'ellipsis', ...lastPages];
		}

		return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', pages];
	};

	const visiblePages = $derived(getVisiblePages(page, pages));
</script>

<div class="flex gap-2">
	{#each visiblePages as item}
		{#if item === 'ellipsis'}
			<div class="flex h-8 w-8 items-center justify-center text-sm">. . .</div>
		{:else}
			<button
				class={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors ${page === item ? 'bg-iris-blue text-white shadow-sm' : 'hover:bg-muted'}`}
				onclick={() => onPageChange(item)}
			>
				{item}
			</button>
		{/if}
	{/each}

	{#if page < pages}
		<button
			class="flex h-8 items-center rounded-lg border px-3 text-sm transition-colors hover:bg-muted"
			onclick={() => onPageChange(page + 1)}>Next</button
		>

		<button
			class="flex h-8 items-center rounded-lg border px-3 text-sm transition-colors hover:bg-muted"
			onclick={() => onPageChange(pages)}>Last page</button
		>
	{/if}
</div>
