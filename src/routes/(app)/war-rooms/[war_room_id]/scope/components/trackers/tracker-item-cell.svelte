<!--
  The "Item" cell of a tracker row: the war-room item it points at,
  rendered per type with a link to it, a free-text label, or a
  placeholder when the caller cannot read the item. A custom label
  given to the row comes first, the item below it.
-->
<script lang="ts">
	import { Lock } from 'lucide-svelte';
	import {
		TRACKER_ITEM_TYPE_LABEL,
		trackerRowLabel,
		type TrackerAssetItem,
		type TrackerCaseItem,
		type TrackerCustomerItem,
		type TrackerIocItem,
		type TrackerManagedAssetItem,
		type TrackerRow
	} from '$lib/services/war-room-trackers.service';
	import { caseNumberedName } from '$lib/utils/case-name';

	type Props = {
		row: TrackerRow;
		/** Show the item type badge (manual trackers mix types). */
		showType?: boolean;
	};

	let { row, showType = false }: Props = $props();

	const asset = $derived(
		row.item_type === 'asset' && row.item ? (row.item as TrackerAssetItem) : null
	);
	const ioc = $derived(row.item_type === 'ioc' && row.item ? (row.item as TrackerIocItem) : null);
	const customer = $derived(
		row.item_type === 'customer' && row.item ? (row.item as TrackerCustomerItem) : null
	);
	const kase = $derived(
		row.item_type === 'case' && row.item ? (row.item as TrackerCaseItem) : null
	);
	const managed = $derived(
		row.item_type === 'managed_asset' && row.item ? (row.item as TrackerManagedAssetItem) : null
	);
	const label = $derived(trackerRowLabel(row));
	const custom = $derived(row.item_type ? row.custom_label || null : null);
</script>

<div class="flex min-w-0 items-start gap-1.5" data-testid="tracker-item-cell">
	{#if showType && row.item_type && !row.restricted}
		<span
			class="mt-0.5 shrink-0 rounded border px-1 text-[0.625rem] uppercase leading-4 text-muted-foreground"
		>
			{TRACKER_ITEM_TYPE_LABEL[row.item_type]}
		</span>
	{/if}
	<div class="flex min-w-0 flex-col">
		{#if custom}
			<span class="block truncate font-semibold" data-testid="tracker-item-custom-label"
				>{custom}</span
			>
		{/if}
		{#if row.restricted}
			<span
				class="inline-flex items-center gap-1 italic text-muted-foreground"
				title="This item belongs to a case you cannot read"
			>
				<Lock class="h-3 w-3" aria-hidden="true" />
				Restricted item
			</span>
		{:else if asset}
			<div class="min-w-0">
				<a
					href={`/case/${asset.case_id}/assets/${asset.asset_id}`}
					class="block truncate font-medium hover:underline"
				>
					{asset.asset_name}
				</a>
				<span class="block truncate text-2xs text-muted-foreground">
					{[
						asset.asset_type,
						caseNumberedName(asset.case_id, asset.case_name ?? ''),
						asset.customer_name
					]
						.filter(Boolean)
						.join(' · ')}
				</span>
			</div>
		{:else if ioc}
			<div class="min-w-0">
				{#if ioc.case_ids.length > 0}
					<a
						href={`/case/${ioc.case_ids[0]}/iocs/${ioc.ioc_id}`}
						class="block truncate font-mono text-xs font-medium hover:underline"
					>
						{ioc.ioc_value}
					</a>
				{:else}
					<span class="block truncate font-mono text-xs font-medium">{ioc.ioc_value}</span>
				{/if}
				<span class="block truncate text-2xs text-muted-foreground">
					{[ioc.ioc_type, ioc.case_names.length ? `${ioc.case_names.length} case(s)` : null]
						.filter(Boolean)
						.join(' · ')}
				</span>
			</div>
		{:else if customer}
			<div class="min-w-0">
				<span class="block truncate font-medium">{customer.customer_name}</span>
				<span class="block text-2xs text-muted-foreground">
					{customer.case_count}
					{customer.case_count === 1 ? 'case' : 'cases'}
				</span>
			</div>
		{:else if kase}
			<div class="min-w-0">
				<a href={`/case/${kase.case_id}`} class="block truncate font-medium hover:underline">
					{caseNumberedName(kase.case_id, kase.case_name)}
				</a>
				<span class="block truncate text-2xs text-muted-foreground">
					{[kase.customer_name, kase.state].filter(Boolean).join(' · ')}
				</span>
			</div>
		{:else if managed}
			<div class="min-w-0">
				<a
					href={`/manage/assets?asset=${managed.managed_asset_id}`}
					class="block truncate font-medium hover:underline"
				>
					{managed.name}
				</a>
				{#if managed.type}
					<span class="block truncate text-2xs text-muted-foreground">{managed.type}</span>
				{/if}
			</div>
		{:else}
			<span class="min-w-0 whitespace-pre-wrap break-words font-medium">{label || '—'}</span>
		{/if}
	</div>
</div>
