<script lang="ts">
	import { page } from '$app/state';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Tag } from '$lib/types/resources/tag';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { TagDisplay } from '$lib/components/common/tag';
	import { PropertyRail, PropertyGroup, PropertyItem } from '$lib/components/common/property-rail';
	import AssetEditForm, { type AssetEditData } from '../components/asset-edit-form.svelte';

	type Props = {
		asset: Asset;
		isEditing?: boolean;
		editData?: AssetEditData;
		onUpdateEditData?: (field: string, value: string | number | Tag[]) => void;
		currentTags?: Tag[];
		/** Link counts shown in the rail; owned by the parent detail view. */
		iocCount?: number;
		timelineCount?: number | null;
		commentCount?: number;
	};

	let {
		asset,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		iocCount = 0,
		timelineCount = null,
		commentCount = 0
	}: Props = $props();

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);

	const caseId = $derived(Number(page.params.case_id));

	const formatDate = (value: string | null | undefined) =>
		value ? new Date(value).toLocaleString() : null;

	const loadOptions = async () => {
		const [assetTypesRes, analysisStatusesRes] = await Promise.all([
			AssetTypesService.list(caseId, { fetch }),
			AnalysisStatusService.list(caseId, { fetch })
		]);

		if (assetTypesRes.ok && Array.isArray(assetTypesRes.data)) {
			assetTypes = assetTypesRes.data;
		}

		if (analysisStatusesRes.ok && Array.isArray(analysisStatusesRes.data)) {
			analysisStatuses = analysisStatusesRes.data;
		}
	};

	$effect(() => {
		loadOptions();
	});
</script>

{#if isEditing && editData}
	<div class="p-4">
		<AssetEditForm
			{editData}
			{currentTags}
			{assetTypes}
			{analysisStatuses}
			onUpdateField={onUpdateEditData}
		/>
	</div>
{:else}
	<!--
	  Scalars live in the rail, prose keeps the width. The rail drops below
	  the main column on narrow panes so a resized sidebar doesn't squeeze
	  the description into a gutter.
	-->
	<div class="grid min-h-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]">
		<div class="flex min-w-0 flex-col gap-4 p-4">
			<section>
				<div class="mb-1.5 flex items-center gap-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Description
					</h3>
					<span class="h-px flex-1 bg-border"></span>
				</div>

				{#if asset.asset_description}
					<MarkDownPreview markdown={asset.asset_description} />
				{:else}
					<p class="text-sm italic text-muted-foreground">No description provided</p>
				{/if}
			</section>

			<section>
				<div class="mb-1.5 flex items-center gap-2">
					<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tags</h3>
					<span class="h-px flex-1 bg-border"></span>
				</div>

				{#if asset.asset_tags}
					<TagDisplay tags={asset.asset_tags} size="small" />
				{:else}
					<p class="text-sm italic text-muted-foreground">No tags</p>
				{/if}
			</section>
		</div>

		<PropertyRail class="lg:w-[280px]">
			<PropertyGroup title="Classification">
				<PropertyItem label="Type" value={asset.asset_type?.asset_name} />
				<PropertyItem label="Analysis" value={asset.analysis_status?.name} />
				<PropertyItem label="Compromise">
					<CompromiseStatus status={asset.asset_compromise_status_id || 3} />
				</PropertyItem>
			</PropertyGroup>

			<PropertyGroup title="Network">
				<PropertyItem label="IP" value={asset.asset_ip} mono copyable />
				<PropertyItem label="Domain" value={asset.asset_domain} mono copyable />
			</PropertyGroup>

			<PropertyGroup title="Links">
				<PropertyItem label="IOCs" value={iocCount} />
				<PropertyItem label="Timeline" value={timelineCount ?? '—'} />
				<PropertyItem label="Comments" value={commentCount} />
			</PropertyGroup>

			<PropertyGroup title="Record">
				<PropertyItem label="Added" value={formatDate(asset.date_added)} />
				<PropertyItem label="Updated" value={formatDate(asset.date_update)} />
				<PropertyItem label="ID" value={`#${asset.asset_id}`} mono />
			</PropertyGroup>
		</PropertyRail>
	</div>
{/if}
