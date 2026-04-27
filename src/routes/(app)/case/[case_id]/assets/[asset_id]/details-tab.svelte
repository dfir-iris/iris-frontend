<script lang="ts">
	import {
		ServerIcon,
		GlobeIcon,
		NetworkIcon,
		FileTextIcon,
		CheckCircleIcon,
		ShieldIcon,
		ComponentIcon,
		XIcon,
		SaveIcon,
		EditIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Tag } from '$lib/types/resources/tag';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import { Button } from '$lib/components/ui/button';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { TagDisplay } from '$lib/components/common/tag';
	import { AssetEditForm, type AssetEditData } from '../components/AssetEditForm';
	import AssetDetailField from './components/asset-detail-field.svelte';

	type Props = {
		asset: Asset;
		isEditing?: boolean;
		editData?: AssetEditData;
		onUpdateEditData?: (field: string, value: string | number | Tag[]) => void;
		currentTags?: Tag[];
		onStartEditing?: () => void;
		onCancelEditing?: () => void;
		onSaveChanges?: () => void;
		onDeleteAsset?: () => void;
		isSaving?: boolean;
		deleteUrl?: string;
	};

	let {
		asset,
		isEditing = false,
		editData,
		onUpdateEditData = () => {},
		currentTags = [],
		onStartEditing = () => {},
		onCancelEditing = () => {},
		onSaveChanges = () => {},
		onDeleteAsset = () => {},
		isSaving = false,
		deleteUrl = ''
	}: Props = $props();

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);

	const caseId = $derived(Number(page.params.case_id));

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

<div class="space-y-8 p-1">
	<section>
		<div class="mb-4 flex items-center justify-between gap-2 border-b pb-2">
			<div class="flex items-center gap-2">
				<ServerIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">General Information</h2>
			</div>

			<div class="flex items-center gap-2">
				{#if isEditing}
					<Button variant="outline" size="sm" onclick={onCancelEditing} disabled={isSaving}>
						<XIcon class="h-4 w-4" />
						Cancel
					</Button>

					<Button size="sm" onclick={onSaveChanges} disabled={isSaving}>
						{#if isSaving}
							<span class="animate-spin">⟳</span>
							Saving...
						{:else}
							<SaveIcon class="h-4 w-4" />
							Save Changes
						{/if}
					</Button>
				{:else}
					<Button variant="outline" size="sm" onclick={onStartEditing}>
						<EditIcon class="h-4 w-4" />
						Edit Asset
					</Button>

					<DeleteButton
						url={deleteUrl}
						onrefresh={onDeleteAsset}
						buttonText="Delete"
						deletion_prompt_message={`Are you sure you want to delete the asset "${asset.asset_name}"? This action cannot be undone.`}
					/>
				{/if}
			</div>
		</div>

		{#if isEditing && editData}
			<AssetEditForm
				{editData}
				{currentTags}
				{assetTypes}
				{analysisStatuses}
				onUpdateField={onUpdateEditData}
			/>
		{:else}
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<AssetDetailField label="Asset Name" value={asset.asset_name} Icon={ServerIcon} />

				<AssetDetailField
					label="Asset Type"
					value={asset.asset_type?.asset_name ?? 'N/A'}
					Icon={ComponentIcon}
				/>

				<AssetDetailField
					label="Analysis Status"
					value={asset.analysis_status?.name ?? 'N/A'}
					Icon={CheckCircleIcon}
				/>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ShieldIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Compromise Status</p>

							<div class="mt-1">
								<CompromiseStatus status={asset.asset_compromise_status_id || 3} />
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</section>

	{#if !isEditing}
		<section>
			<div class="mb-4 flex items-center gap-2 border-b pb-2">
				<FileTextIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Description</h2>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				{#if asset.asset_description}
					<MarkDownPreview markdown={asset.asset_description} />
				{:else}
					<p class="italic text-muted-foreground">No description provided</p>
				{/if}
			</div>
		</section>

		<section>
			<div class="mb-4 flex items-center gap-2 border-b pb-2">
				<NetworkIcon class="h-5 w-5 text-primary" />
				<h2 class="text-lg font-semibold">Network Information</h2>
			</div>

			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<AssetDetailField label="IP Address" value={asset.asset_ip || 'N/A'} Icon={NetworkIcon} />
				<AssetDetailField label="Domain" value={asset.asset_domain || 'N/A'} Icon={GlobeIcon} />
			</div>
		</section>

		<section>
			<div class="rounded-lg bg-card/40 p-4">
				{#if asset.asset_tags}
					<TagDisplay tags={asset.asset_tags} size="default" />
				{:else}
					<p class="italic text-muted-foreground">No tags</p>
				{/if}
			</div>
		</section>
	{/if}
</div>
