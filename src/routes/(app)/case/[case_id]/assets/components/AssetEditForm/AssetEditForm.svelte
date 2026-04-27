<script lang="ts">
	import {
		CheckCircleIcon,
		ComponentIcon,
		FileTextIcon,
		GlobeIcon,
		NetworkIcon,
		ServerIcon,
		ShieldIcon
	} from 'lucide-svelte';
	import type { Tag } from '$lib/types/resources/tag';
	import type { AssetType } from '$lib/services/asset-types.service';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { TagInput } from '$lib/components/common/tag';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { AssetEditField, type AssetEditData } from './';

	type Props = {
		editData: AssetEditData;
		currentTags: Tag[];
		assetTypes: AssetType[];
		analysisStatuses: AnalysisStatusItem[];
		onUpdateField: (field: string, value: string | number | Tag[]) => void;
	};

	let { editData, currentTags, assetTypes, analysisStatuses, onUpdateField }: Props = $props();

	const assetTypeOptions = $derived<SelectOption[]>(
		assetTypes.map((type) => ({
			value: String(type.asset_id),
			label: type.asset_name
		}))
	);

	const analysisStatusOptions = $derived<SelectOption[]>(
		analysisStatuses.map((status) => ({
			value: String(status.id),
			label: status.name
		}))
	);

	const updateField = (field: string, value: string | number) => onUpdateField(field, value);
	const handleTagsChange = (tags: Tag[]) => onUpdateField('asset_tags', tags);
</script>

<div class="space-y-8">
	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
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

						<div class="mt-1">
							<SearchSelect
								value={editData.asset_type_id ? String(editData.asset_type_id) : ''}
								options={assetTypeOptions}
								placeholder="Select asset type"
								searchPlaceholder="Search asset type..."
								onChange={(value) => updateField('asset_type_id', Number(value))}
							/>
						</div>
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

						<div class="mt-1">
							<SearchSelect
								value={editData.analysis_status_id ? String(editData.analysis_status_id) : ''}
								options={analysisStatusOptions}
								placeholder="Select analysis status"
								searchPlaceholder="Search analysis status..."
								onChange={(value) => updateField('analysis_status_id', Number(value))}
							/>
						</div>
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
								status={editData.asset_compromise_status_id || 3}
								onEditValueChange={(value) => updateField('asset_compromise_status_id', value)}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<FileTextIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Description</h2>
		</div>

		<div class="rounded-lg bg-card/40 p-4">
			<MarkDownEditor
				value={editData.asset_description}
				onChange={(value) => updateField('asset_description', value)}
				onSave={() => {}}
			/>
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<NetworkIcon class="h-5 w-5 text-primary" />
			<h2 class="text-lg font-semibold">Network Information</h2>
		</div>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
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
		</div>
	</section>

	<section>
		<div class="rounded-lg bg-card/40 p-4">
			<TagInput
				tags={currentTags}
				outputFormat="array"
				onchange={handleTagsChange}
				placeholder="Add tags..."
			/>
		</div>
	</section>
</div>
