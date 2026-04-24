<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
	import type { Tag } from '$lib/types/resources/tag';
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
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';
	import DeleteButton from '$lib/components/common/DeleteButton.svelte';
	import MarkDownPreview from '$lib/components/common/MarkDown/MarkDownPreview.svelte';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { TagInput, TagDisplay } from '$lib/components/common/tag';
	import AssetDetailField from './components/asset-detail-field.svelte';
	import AssetEditField from './components/asset-edit-field.svelte';

	type EditData = {
		asset_name: string;
		asset_description: string;
		asset_ip: string;
		asset_domain: string;
		asset_type_id?: number;
		analysis_status_id?: number;
		asset_compromise_status_id?: number;
		asset_tags?: string;
	};

	type Props = {
		asset: Asset;
		isEditing?: boolean;
		editData?: EditData;
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

	const updateField = (field: string, value: string | number) => {
		onUpdateEditData(field, value);
	};

	const handleTagsChange = (tags: Tag[]) => {
		onUpdateEditData('asset_tags', tags);
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

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			{#if isEditing && editData}
				<AssetEditField
					label="Asset Name"
					field="asset_name"
					value={editData.asset_name}
					Icon={ServerIcon}
					onChange={updateField}
				/>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ComponentIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Asset Type</p>

							<select
								value={editData.asset_type_id}
								onchange={(e) =>
									updateField('asset_type_id', Number((e.target as HTMLSelectElement).value))}
								class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="" disabled>Select asset type</option>
								{#each assetTypes as type}
									<option value={type.asset_id}>{type.asset_name}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<CheckCircleIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Analysis Status</p>

							<select
								value={editData.analysis_status_id}
								onchange={(e) =>
									updateField('analysis_status_id', Number((e.target as HTMLSelectElement).value))}
								class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="" disabled>Select analysis status</option>
								{#each analysisStatuses as status}
									<option value={status.id}>{status.name}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

				<div class="rounded-lg bg-card/40 p-4">
					<div class="flex items-start gap-3">
						<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
							<ShieldIcon class="h-4 w-4" />
						</div>

						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium text-muted-foreground">Compromise Status</p>

							<div class="mt-1">
								<CompromiseStatus
									isEditing={true}
									editValue={editData.asset_compromise_status_id}
									status={asset.asset_compromise_status_id || 3}
									onEditValueChange={(value) => updateField('asset_compromise_status_id', value)}
								/>
							</div>
						</div>
					</div>
				</div>
			{:else}
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
			{/if}
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<FileTextIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Description</h2>
		</div>

		<div class="rounded-lg bg-card/40 p-4">
			{#if isEditing && editData}
				<Textarea
					value={editData.asset_description}
					onchange={(e) =>
						updateField('asset_description', (e.target as HTMLTextAreaElement).value)}
					placeholder="Provide a detailed description of this asset"
					rows={5}
					class="w-full"
				/>

				<p class="mt-2 text-xs text-muted-foreground">Markdown formatting is supported</p>
			{:else if asset.asset_description}
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
			{#if isEditing && editData}
				<AssetEditField
					label="IP Address"
					field="asset_ip"
					value={editData.asset_ip}
					Icon={NetworkIcon}
					placeholder="e.g. 192.168.1.1"
					onChange={updateField}
				/>

				<AssetEditField
					label="Domain"
					field="asset_domain"
					value={editData.asset_domain}
					Icon={GlobeIcon}
					placeholder="e.g. example.com"
					onChange={updateField}
				/>
			{:else}
				<AssetDetailField label="IP Address" value={asset.asset_ip || 'N/A'} Icon={NetworkIcon} />
				<AssetDetailField label="Domain" value={asset.asset_domain || 'N/A'} Icon={GlobeIcon} />
			{/if}
		</div>
	</section>

	<section>
		<div class="rounded-lg bg-card/40 p-4">
			{#if isEditing}
				<TagInput
					tags={currentTags}
					outputFormat="array"
					onchange={handleTagsChange}
					placeholder="Add tags..."
					maxTags={20}
				/>

				<p class="mt-2 text-xs text-muted-foreground">Press Enter or comma to add a tag</p>
			{:else if asset.asset_tags}
				<TagDisplay tags={asset.asset_tags} size="default" />
			{:else}
				<p class="italic text-muted-foreground">No tags</p>
			{/if}
		</div>
	</section>
</div>
