<!--
  The flags of one asset as chips, in taxonomy order. Entries only need
  a `flag_id`; the definition comes from the nested `flag` when the API
  sent one, else from the shared taxonomy store. Renders a muted
  "No flag" pill when the asset has none so tables keep a stable height.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { AssetFlag } from '$lib/services/asset-flags.service';
	import { assetFlags, loadAssetFlags } from '$lib/stores/asset-flags.store.svelte';
	import AssetFlagChip from './AssetFlagChip.svelte';

	type Entry = { flag_id: number; reason?: string | null; flag?: AssetFlag | null };

	type Props = {
		flags: Entry[] | null | undefined;
		size?: 'xs' | 'sm';
		/** Chips shown before collapsing the rest into "+N". */
		max?: number;
		emptyLabel?: string | null;
	};

	let { flags, size = 'xs', max = 3, emptyLabel = 'No flag' }: Props = $props();

	onMount(() => {
		void loadAssetFlags();
	});

	const resolved = $derived.by(() => {
		const byId = new Map(assetFlags.items.map((flag) => [flag.id, flag]));
		const order = new Map(assetFlags.items.map((flag, index) => [flag.id, index]));
		return (flags ?? [])
			.map((entry) => ({ entry, flag: entry.flag ?? byId.get(entry.flag_id) ?? null }))
			.filter((row): row is { entry: Entry; flag: AssetFlag } => row.flag !== null)
			.sort(
				(a, b) =>
					(order.get(a.flag.id) ?? a.flag.sort_order) - (order.get(b.flag.id) ?? b.flag.sort_order)
			);
	});

	const shown = $derived(resolved.slice(0, max));
	const hidden = $derived(resolved.slice(max));
</script>

{#if resolved.length === 0}
	{#if emptyLabel}
		<span
			class={[
				'inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-dashed border-border font-medium text-muted-foreground',
				size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs'
			]}
			data-testid="asset-flag-chip-empty"
		>
			{emptyLabel}
		</span>
	{/if}
{:else}
	<span class="inline-flex max-w-full flex-wrap items-center gap-1" data-testid="asset-flag-chips">
		{#each shown as row (row.flag.id)}
			<AssetFlagChip
				flag={row.flag}
				{size}
				title={row.entry.reason ? `${row.flag.name}: ${row.entry.reason}` : row.flag.name}
			/>
		{/each}
		{#if hidden.length > 0}
			<span
				class={[
					'inline-flex shrink-0 items-center rounded-md border border-border bg-muted font-medium text-muted-foreground',
					size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs'
				]}
				title={hidden.map((row) => row.flag.name).join(', ')}
			>
				+{hidden.length}
			</span>
		{/if}
	</span>
{/if}
