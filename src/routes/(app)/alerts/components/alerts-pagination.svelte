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
</script>

<div class="flex gap-2">
	<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
	{#each Array.from({ length: pages }) as _, p}
		<button
			class={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition-colors ${page === p + 1 ? 'bg-iris-blue text-white shadow-sm' : 'hover:bg-muted'}`}
			onclick={() => onPageChange(p + 1)}
		>
			{p + 1}
		</button>
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
