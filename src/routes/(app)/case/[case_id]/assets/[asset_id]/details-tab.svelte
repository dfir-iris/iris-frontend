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
	import { FieldGrid, FieldItem } from '$lib/components/common/field-grid';
	import AssetEditForm, { type AssetEditData } from '../components/asset-edit-form.svelte';

	type Props = {
		asset: Asset;
		isEditing?: boolean;
		editData?: AssetEditData;
		onUpdateEditData?: (field: string, value: string | number | Tag[]) => void;
		currentTags?: Tag[];
	};

	let {
		asset,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = []
	}: Props = $props();

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);

	const caseId = $derived(Number(page.params.case_id));
	const hasTags = $derived((asset.asset_tags?.length ?? 0) > 0);

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
	  Scalars first as a fixed board, then the prose at full width. Link counts
	  are deliberately absent — they live on the tab triggers, which is both
	  where they'd be clicked and one line above this.
	-->
	<FieldGrid>
		<FieldItem label="Type" value={asset.asset_type?.asset_name} />
		<FieldItem label="Analysis" value={asset.analysis_status?.name} />

		<FieldItem label="Compromise">
			<CompromiseStatus status={asset.asset_compromise_status_id || 3} />
		</FieldItem>

		<FieldItem label="IP" value={asset.asset_ip} mono copyable />
		<FieldItem label="Domain" value={asset.asset_domain} mono copyable />
		<FieldItem label="ID" value={`#${asset.asset_id}`} mono />

		<FieldItem label="Added" value={formatDate(asset.date_added)} />
		<FieldItem label="Updated" value={formatDate(asset.date_update)} />
	</FieldGrid>

	<div class="p-4">
		<h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
			Description
		</h3>

		{#if asset.asset_description}
			<MarkDownPreview markdown={asset.asset_description} />
		{:else}
			<p class="text-sm italic text-muted-foreground">No description provided</p>
		{/if}

		<!-- No caption: a rule and a row of chips reads as tags without one. -->
		{#if hasTags}
			<div class="mt-4 border-t border-border/70 pt-3">
				<TagDisplay tags={asset.asset_tags} size="small" />
			</div>
		{/if}
	</div>
{/if}
