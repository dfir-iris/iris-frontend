<script lang="ts">
	import { Globe, Network, BiohazardIcon } from 'lucide-svelte';
	import type { Asset } from '$lib/types/resources/asset';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import { Badge } from '$lib/components/ui/badge';
	import CompromiseStatusBadge from '$lib/components/ui/badge/compromise-status-badge.svelte';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import EntityRow from '$lib/components/common/EntityRow.svelte';
	import SeenElsewhereBadge from '$lib/components/common/SeenElsewhereBadge.svelte';
	import { getAssetTypeIcon } from './asset-type-icon';
	import { toPlainSnippet } from '$lib/utils/text';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { page } from '$app/state';

	type Props = {
		asset: Asset;
		isSelected?: boolean;
	};

	let { asset, isSelected = false }: Props = $props();

	// Used by the "seen elsewhere" badge to scope the cross-case lookup.
	const caseId = $derived(Number(page.params.case_id));

	const assetTypeName = $derived(asset.asset_type?.asset_name ?? '');
	const AssetTypeIcon = $derived(getAssetTypeIcon(assetTypeName));
	const hasIocs = $derived((asset.iocs ?? []).length > 0);
	const assetIp = $derived(asset.asset_ip ?? '');
	const assetDomain = $derived(asset.asset_domain ?? '');
	const isCompromised = $derived(asset.asset_compromise_status_id === 1);
	// One-line flattening of the description. The full markdown stays one
	// click away in the detail pane; the row only needs enough to recognise
	// what the object is while scanning.
	const descriptionSnippet = $derived(toPlainSnippet(asset.asset_description ?? '', 90));
</script>

<EntityRow
	id={`asset-card-${asset.asset_id}`}
	title={asset.asset_name}
	Icon={AssetTypeIcon}
	{isSelected}
	accent={isCompromised ? 'danger' : 'none'}
	tags={asset.asset_tags}
>
	{#snippet titleSuffix()}
		<ClipboardCopy
			value={asset.asset_name}
			tooltipText="Copy asset name"
			className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
			size={12}
		/>
	{/snippet}

	{#snippet badges()}
		{#if isCompromised}
			<Badge variant="compromised" class="px-2 py-0 text-2xs">Compromised</Badge>
		{:else if asset.asset_compromise_status_id === 2 || asset.asset_compromise_status_id === 3}
			<CompromiseStatusBadge
				status_id={asset.asset_compromise_status_id}
				icon_only={true}
				prefix="Compromise"
			/>
		{/if}

		{#if asset.analysis_status}
			<StatusBadge
				status={asset.analysis_status.name as CaseStatus}
				icon_only={true}
				prefix="Analysis"
			/>
		{/if}

		{#if hasIocs}
			<Badge
				tooltip="Contains IOCs"
				icon={BiohazardIcon}
				variant="outline"
				class="border-0 bg-transparent p-0.5 text-2xs hover:bg-muted/50"
			>
				{asset.iocs?.length}
			</Badge>
		{/if}
	{/snippet}

	{#snippet meta()}
		<span class="truncate">{assetTypeName || asset.asset_type_id || 'Unknown type'}</span>

		{#if assetIp}
			<span class="group/ip inline-flex items-center gap-1">
				<Network class="h-2.5 w-2.5 shrink-0" />
				<span class="max-w-[120px] truncate font-mono">{assetIp}</span>
				<ClipboardCopy
					value={assetIp}
					tooltipText="Copy IP"
					className="hidden shrink-0 group-hover/ip:inline-flex"
					size={11}
				/>
			</span>
		{/if}

		{#if assetDomain}
			<span class="group/domain inline-flex items-center gap-1">
				<Globe class="h-2.5 w-2.5 shrink-0" />
				<span class="max-w-[140px] truncate font-mono">{assetDomain}</span>
				<ClipboardCopy
					value={assetDomain}
					tooltipText="Copy domain"
					className="hidden shrink-0 group-hover/domain:inline-flex"
					size={11}
				/>
			</span>
		{/if}

		{#if descriptionSnippet}
			<span class="truncate">{descriptionSnippet}</span>
		{/if}

		<!--
		  "Seen elsewhere" pivot. Inline variant — non-interactive visual
		  badge that auto-hides when there is no other sighting. The
		  popover-rich variant lives in the asset detail view.
		-->
		{#if Number.isFinite(caseId)}
			<SeenElsewhereBadge
				variant="inline"
				objectLabel="asset"
				objectId={asset.asset_id}
				load={async () => {
					const res = await CaseAssetsService.listOtherCaseLinks(caseId, asset.asset_id);
					return res.ok && Array.isArray(res.data) ? res.data : null;
				}}
			/>
		{/if}
	{/snippet}
</EntityRow>
