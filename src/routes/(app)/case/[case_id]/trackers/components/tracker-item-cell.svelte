<!--
  The "Item" cell of a case tracker row: the case item it points at,
  rendered per type with a link to it, a free-text label, or a
  placeholder when the item was deleted from the case. A custom label
  given to the row comes first, the item name below it.
-->
<script lang="ts">
	import { Trash2 } from 'lucide-svelte';
	import {
		CASE_TRACKER_ITEM_TYPE_LABEL,
		caseTrackerItemHref,
		caseTrackerItemName,
		type CaseTrackerAssetItem,
		type CaseTrackerEvidenceItem,
		type CaseTrackerIocItem,
		type CaseTrackerRow,
		type CaseTrackerTaskItem
	} from '$lib/services/case-trackers.service';

	type Props = {
		caseId: number;
		row: CaseTrackerRow;
		/** Show the item type badge (manual trackers mix types). */
		showType?: boolean;
	};

	let { caseId, row, showType = false }: Props = $props();

	const formatSize = (bytes: number | null): string | null => {
		if (!bytes || bytes <= 0) return null;
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / Math.pow(1024, i);
		return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
	};

	const asset = $derived(
		row.item_type === 'asset' && row.item ? (row.item as CaseTrackerAssetItem) : null
	);
	const ioc = $derived(
		row.item_type === 'ioc' && row.item ? (row.item as CaseTrackerIocItem) : null
	);
	const task = $derived(
		row.item_type === 'task' && row.item ? (row.item as CaseTrackerTaskItem) : null
	);
	const evidence = $derived(
		row.item_type === 'evidence' && row.item ? (row.item as CaseTrackerEvidenceItem) : null
	);
	const label = $derived(caseTrackerItemName(row));
	const custom = $derived(row.custom_label || null);
	const href = $derived(caseTrackerItemHref(caseId, row));
	const details = $derived(
		(asset
			? [asset.asset_type, asset.asset_ip, asset.asset_domain, asset.analysis_status_name]
			: ioc
				? [ioc.ioc_type, ioc.tlp ? `TLP:${ioc.tlp}` : null]
				: task
					? [task.status_name, task.assignees.map((a) => a.name).join(', ')]
					: evidence
						? [evidence.type, formatSize(evidence.file_size)]
						: []
		)
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="flex min-w-0 items-start gap-1.5" data-testid="tracker-item-cell">
	{#if showType && row.item_type && !row.restricted}
		<span
			class="mt-0.5 shrink-0 rounded border px-1 text-[0.625rem] uppercase leading-4 text-muted-foreground"
		>
			{CASE_TRACKER_ITEM_TYPE_LABEL[row.item_type]}
		</span>
	{/if}
	{#if row.restricted}
		<span
			class="inline-flex items-center gap-1 italic text-muted-foreground"
			title="This item was deleted from the case"
		>
			<Trash2 class="h-3 w-3" aria-hidden="true" />
			{custom ? `${custom} (${label})` : label}
		</span>
	{:else if row.item}
		<div class="min-w-0">
			{#if custom}
				<span class="block truncate font-medium" data-testid="tracker-item-custom-label"
					>{custom}</span
				>
			{/if}
			{#if href}
				<a
					{href}
					class={[
						'block truncate hover:underline',
						custom ? 'text-xs text-muted-foreground' : 'font-medium',
						ioc && 'font-mono text-xs'
					]}
				>
					{label}
				</a>
			{:else}
				<span
					class={[
						'block truncate',
						custom ? 'text-xs text-muted-foreground' : 'font-medium',
						ioc && 'font-mono text-xs'
					]}>{label}</span
				>
			{/if}
			{#if details}
				<span class="block truncate text-2xs text-muted-foreground">{details}</span>
			{/if}
		</div>
	{:else}
		<span class="min-w-0 whitespace-pre-wrap break-words font-medium">{label || '—'}</span>
	{/if}
</div>
