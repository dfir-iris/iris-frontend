<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon, XIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Tag } from '$lib/types/resources/tag';
	import { stringToTags, tagsToString } from '$lib/utils/tags';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { AssetTypesService, type AssetType } from '$lib/services/asset-types.service';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';
	import type { CreateCaseAssetBody } from '$lib/services/case-assets.service';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { AssetEditForm, type AssetEditData } from '../components/AssetEditForm';

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);

	const caseId = $derived(Number(page.params.case_id));

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);
	let currentTags = $state<Tag[]>([]);
	let isSaving = $state(false);

	let editData = $state<AssetEditData>({
		asset_name: '',
		asset_description: '',
		asset_ip: '',
		asset_domain: '',
		asset_type_id: undefined,
		analysis_status_id: undefined,
		asset_compromise_status_id: 3,
		asset_tags: ''
	});

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

	const updateField = (field: string, value: string | number | Tag[]) => {
		if (field === 'asset_tags') {
			if (Array.isArray(value)) {
				currentTags = [...value];
				editData.asset_tags = tagsToString(value);
			} else if (typeof value === 'string') {
				currentTags = stringToTags(value);
				editData.asset_tags = value;
			}

			return;
		}

		if (field === 'asset_name' && typeof value === 'string') editData.asset_name = value;
		if (field === 'asset_description' && typeof value === 'string')
			editData.asset_description = value;
		if (field === 'asset_ip' && typeof value === 'string') editData.asset_ip = value;
		if (field === 'asset_domain' && typeof value === 'string') editData.asset_domain = value;
		if (field === 'asset_type_id' && typeof value === 'number') editData.asset_type_id = value;
		if (field === 'analysis_status_id' && typeof value === 'number')
			editData.analysis_status_id = value;
		if (field === 'asset_compromise_status_id' && typeof value === 'number') {
			editData.asset_compromise_status_id = value;
		}
	};

	const save = async () => {
		if (!editData.asset_name.trim() || !editData.asset_type_id) {
			toast({
				title: 'Missing required fields',
				description: 'Asset name and asset type are required.',
				variant: 'destructive'
			});
			return;
		}

		isSaving = true;

		try {
			const payload: CreateCaseAssetBody = {
				asset_name: editData.asset_name,
				asset_type_id: editData.asset_type_id,
				asset_description: editData.asset_description,
				asset_ip: editData.asset_ip,
				asset_domain: editData.asset_domain,
				analysis_status_id: editData.analysis_status_id,
				asset_compromise_status_id: editData.asset_compromise_status_id,
				asset_tags: tagsToString(currentTags)
			};

			const created = await caseAssets.createAsset(payload, { fetch });

			if (!created) {
				throw new Error('Failed to create asset');
			}

			toast({
				title: 'Asset created',
				description: 'Asset has been successfully created.',
				variant: 'success'
			});

			await goto(`/case/${caseId}/assets/${created.asset_id}`, { replaceState: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'Create failed',
				description: `There was a problem creating the asset. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		loadOptions();
	});
</script>

<div class="flex h-full min-h-0 flex-col bg-background">
	<div class="flex shrink-0 items-center justify-between border-b px-6 py-4">
		<div>
			<h1 class="text-lg font-semibold">Add asset</h1>
			<p class="text-sm text-muted-foreground">Create a new asset for this case.</p>
		</div>

		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				disabled={isSaving}
				onclick={() => goto(`/case/${caseId}/assets`)}
			>
				<XIcon class="h-4 w-4" />
				Cancel
			</Button>

			<Button size="sm" disabled={isSaving} onclick={save}>
				{#if isSaving}
					<span class="animate-spin"><RotateCwIcon /></span>
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Create asset
				{/if}
			</Button>
		</div>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-6">
		<AssetEditForm
			{editData}
			{currentTags}
			{assetTypes}
			{analysisStatuses}
			onUpdateField={updateField}
		/>
	</div>
</div>
