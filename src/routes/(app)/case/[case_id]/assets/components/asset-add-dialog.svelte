<script lang="ts">
	import { getContext } from 'svelte';
	import { RotateCwIcon, SaveIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import type { Asset } from '$lib/types/resources/asset';
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
	import AssetAddForm, { type AssetAddData } from './asset-add-form.svelte';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);
	let currentTags = $state<Tag[]>([]);
	let isSaving = $state(false);

	let addData = $state<AssetAddData>({
		asset_names: '',
		asset_description: '',
		asset_ip: '',
		asset_domain: '',
		asset_type_id: undefined,
		analysis_status_id: undefined,
		asset_compromise_status_id: 3,
		asset_tags: ''
	});

	const reset = () => {
		currentTags = [];
		isSaving = false;

		addData = {
			asset_names: '',
			asset_description: '',
			asset_ip: '',
			asset_domain: '',
			asset_type_id: undefined,
			analysis_status_id: undefined,
			asset_compromise_status_id: 3,
			asset_tags: ''
		};
	};

	const close = () => {
		onOpenChange(false);
	};

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
				addData.asset_tags = tagsToString(value);
			} else if (typeof value === 'string') {
				currentTags = stringToTags(value);
				addData.asset_tags = value;
			}

			return;
		}

		if (field === 'asset_names' && typeof value === 'string') addData.asset_names = value;
		if (field === 'asset_description' && typeof value === 'string')
			addData.asset_description = value;
		if (field === 'asset_ip' && typeof value === 'string') addData.asset_ip = value;
		if (field === 'asset_domain' && typeof value === 'string') addData.asset_domain = value;
		if (field === 'asset_type_id' && typeof value === 'number') addData.asset_type_id = value;
		if (field === 'analysis_status_id' && typeof value === 'number')
			addData.analysis_status_id = value;
		if (field === 'asset_compromise_status_id' && typeof value === 'number') {
			addData.asset_compromise_status_id = value;
		}
	};

	const save = async () => {
		const assetNames = addData.asset_names
			.split('\n')
			.map((name) => name.trim())
			.filter(Boolean);

		if (assetNames.length === 0 || !addData.asset_type_id) {
			toast({
				title: 'Missing required fields',
				description: 'Asset name and asset type are required.',
				variant: 'destructive'
			});
			return;
		}

		isSaving = true;

		try {
			const createdAssets: Asset[] = [];

			for (const assetName of assetNames) {
				const payload: CreateCaseAssetBody = {
					asset_name: assetName,
					asset_type_id: addData.asset_type_id,
					asset_description: addData.asset_description,
					asset_ip: addData.asset_ip,
					asset_domain: addData.asset_domain,
					analysis_status_id: addData.analysis_status_id,
					asset_compromise_status_id: addData.asset_compromise_status_id,
					asset_tags: tagsToString(currentTags)
				};

				const created = await caseAssets.createAsset(payload, { fetch });

				if (!created) {
					throw new Error(`Failed to create asset "${assetName}"`);
				}

				createdAssets.push(created);
			}

			toast({
				title: 'Assets created',
				description: `${createdAssets.length} asset(s) created successfully.`,
				variant: 'success'
			});

			close();

			if (createdAssets.length === 1) {
				await goto(`/case/${caseId}/assets/${createdAssets[0].asset_id}`, { replaceState: true });
			} else {
				await goto(`/case/${caseId}/assets`, { replaceState: true });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'Create failed',
				description: `There was a problem creating assets. Error: ${message}`,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	$effect(() => {
		if (open) {
			loadOptions();
		} else {
			reset();
		}
	});
</script>

<Dialog.Root
	bind:open
	onOpenChange={(nextOpen) => {
		if (!nextOpen) close();
	}}
>
	<Dialog.Content class="flex max-h-[90vh] max-w-[980px] flex-col gap-0 p-0">
		<Dialog.Header class="border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Add multiple assets</Dialog.Title>
		</Dialog.Header>

		<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
			<AssetAddForm
				{addData}
				{currentTags}
				{assetTypes}
				{analysisStatuses}
				onUpdateField={updateField}
			/>
		</div>

		<div class="flex items-center justify-end gap-2 border-t px-6 py-4">
			<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>

			<Button disabled={isSaving} onclick={save}>
				{#if isSaving}
					<RotateCwIcon class="h-4 w-4 animate-spin" />
					Saving...
				{:else}
					<SaveIcon class="h-4 w-4" />
					Add assets
				{/if}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
