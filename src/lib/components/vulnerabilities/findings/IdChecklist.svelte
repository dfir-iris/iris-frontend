<!--
  Filterable checklist of ids — case assets to record a finding on,
  events or IOCs to link as evidence.
-->
<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';

	type Item = { id: number; label: string; hint?: string | null; disabled?: boolean };

	let {
		items,
		selected = $bindable([]),
		loading = false,
		disabled = false,
		emptyMessage = 'Nothing to pick.',
		filterPlaceholder = 'Filter…',
		showSelectAll = false,
		onChange
	}: {
		items: Item[];
		selected: number[];
		loading?: boolean;
		disabled?: boolean;
		emptyMessage?: string;
		filterPlaceholder?: string;
		showSelectAll?: boolean;
		/** For hosts that cannot `bind:` (e.g. a snippet argument). */
		onChange?: (ids: number[]) => void;
	} = $props();

	const setSelected = (next: number[]) => {
		selected = next;
		onChange?.(next);
	};

	let filter = $state('');

	const visible = $derived.by(() => {
		const q = filter.trim().toLowerCase();
		if (!q) return items;
		return items.filter(
			(item) => item.label.toLowerCase().includes(q) || (item.hint ?? '').toLowerCase().includes(q)
		);
	});

	const selectedSet = $derived(new Set(selected));

	const toggle = (id: number, on: boolean) => {
		setSelected(on ? [...new Set([...selected, id])] : selected.filter((s) => s !== id));
	};

	const selectableVisible = $derived(visible.filter((i) => !i.disabled));
	const allVisibleSelected = $derived(
		selectableVisible.length > 0 && selectableVisible.every((i) => selectedSet.has(i.id))
	);

	const toggleAll = () => {
		const ids = selectableVisible.map((i) => i.id);
		setSelected(
			allVisibleSelected
				? selected.filter((s) => !ids.includes(s))
				: [...new Set([...selected, ...ids])]
		);
	};
</script>

<div class="flex flex-col gap-1.5">
	<div class="flex items-center gap-2">
		<Input class="h-8 text-xs" placeholder={filterPlaceholder} bind:value={filter} {disabled} />
		{#if showSelectAll && selectableVisible.length > 0}
			<button
				type="button"
				class="shrink-0 text-2xs text-primary hover:underline disabled:opacity-50"
				onclick={toggleAll}
				{disabled}
			>
				{allVisibleSelected ? 'Clear' : 'Select all'}
			</button>
		{/if}
	</div>
	<div class="max-h-44 overflow-y-auto rounded-md border">
		{#if loading}
			<p class="px-3 py-3 text-center text-xs text-muted-foreground">Loading…</p>
		{:else}
			{#each visible as item (item.id)}
				<label
					class="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0 hover:bg-muted/40 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
				>
					<Checkbox
						checked={selectedSet.has(item.id)}
						onCheckedChange={(v) => toggle(item.id, v === true)}
						disabled={disabled || item.disabled}
					/>
					<span class="min-w-0 flex-1 truncate">{item.label}</span>
					{#if item.hint}
						<span class="shrink-0 text-2xs text-muted-foreground">{item.hint}</span>
					{/if}
				</label>
			{:else}
				<p class="px-3 py-3 text-center text-xs text-muted-foreground">{emptyMessage}</p>
			{/each}
		{/if}
	</div>
	<p class="text-2xs text-muted-foreground">{selected.length} selected</p>
</div>
