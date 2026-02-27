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
			class={`flex h-8 w-8 items-center justify-center rounded-full border ${page === p + 1 ? 'bg-blue-900 text-white' : ''}`}
			onclick={() => onPageChange(p + 1)}
		>
			{p + 1}
		</button>
	{/each}

	{#if page < pages}
		<button
			class="flex h-8 items-center rounded-full border px-3"
			onclick={() => onPageChange(page + 1)}>Next</button
		>

		<button
			class="flex h-8 items-center rounded-full border px-3"
			onclick={() => onPageChange(pages)}>Last page</button
		>
	{/if}
</div>
