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
	import { Fact, FactBar, FactRecord, FactTags } from '$lib/components/common/fact-bar';
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
	  Triage facts on one strip, then the prose at full width. Link counts are
	  deliberately absent — they live on the tab triggers, which is both where
	  they'd be clicked and one line above this.
	-->
	<FactBar>
		<Fact>
			<CompromiseStatus status={asset.asset_compromise_status_id || 3} />
		</Fact>

		<Fact label="Type" value={asset.asset_type?.asset_name} />
		<Fact label="Analysis" value={asset.analysis_status?.name} />
		<Fact label="IP" value={asset.asset_ip} mono copyable />
		<Fact label="Domain" value={asset.asset_domain} mono copyable />
	</FactBar>

	<FactTags tags={asset.asset_tags} />

	<div class="p-4">
		{#if asset.asset_description}
			<MarkDownPreview markdown={asset.asset_description} />
		{:else}
			<p class="text-sm italic text-muted-foreground">No description provided</p>
		{/if}

		<FactRecord
			items={[
				['Added', formatDate(asset.date_added)],
				['Updated', formatDate(asset.date_update)],
				['ID', `#${asset.asset_id}`, true]
			]}
		/>
	</div>
{/if}
