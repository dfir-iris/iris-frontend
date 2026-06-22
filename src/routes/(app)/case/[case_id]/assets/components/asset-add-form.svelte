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
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { CompromiseStatus } from '$lib/components/common/compromise-status';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import { TagInput } from '$lib/components/common/tag';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import AssetEditField from './asset-edit-field.svelte';
	import type { AssetData } from './types';

	export interface AssetAddData extends AssetData {
		asset_names: string;
		one_per_line: boolean;
	}

	type Props = {
		addData: AssetAddData;
		currentTags: Tag[];
		assetTypes: AssetType[];
		analysisStatuses: AnalysisStatusItem[];
		onUpdateField: (field: string, value: string | number | boolean | Tag[]) => void;
	};

	let { addData, currentTags, assetTypes, analysisStatuses, onUpdateField }: Props = $props();

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

	// `one_per_line` is a UI-only flag (not part of the create payload).
	// We funnel it through the same onUpdateField pipe so the parent dialog
	// keeps a single state shape.
	const handleOnePerLineChange = (checked: boolean) => onUpdateField('one_per_line', checked);
</script>

<div class="space-y-8">
	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<ServerIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<p class="text-sm font-medium text-muted-foreground">
								{addData.one_per_line ? 'Asset Names' : 'Asset Name'}
							</p>

							<label class="inline-flex items-center gap-2 text-xs text-muted-foreground">
								<Checkbox
									checked={addData.one_per_line}
									onCheckedChange={(v) => handleOnePerLineChange(!!v)}
								/>
								<span>One asset per line</span>
							</label>
						</div>

						<Textarea
							value={addData.asset_names}
							onchange={(e) => updateField('asset_names', (e.target as HTMLTextAreaElement).value)}
							placeholder={addData.one_per_line ? 'One asset per line' : 'Asset name'}
							rows={addData.one_per_line ? 5 : 2}
							class="mt-1 w-full"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="shrink-0 rounded-md bg-primary/10 p-2 text-primary">
						<ComponentIcon class="h-4 w-4" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Asset Type</p>

						<div class="mt-1">
							<SearchSelect
								value={addData.asset_type_id ? String(addData.asset_type_id) : ''}
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
								value={addData.analysis_status_id ? String(addData.analysis_status_id) : ''}
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
								editValue={addData.asset_compromise_status_id}
								status={addData.asset_compromise_status_id || 3}
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
				value={addData.asset_description}
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
				value={addData.asset_ip}
				Icon={NetworkIcon}
				placeholder="e.g. 192.168.1.1"
				onChange={updateField}
			/>

			<AssetEditField
				label="Domain"
				field="asset_domain"
				value={addData.asset_domain}
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
