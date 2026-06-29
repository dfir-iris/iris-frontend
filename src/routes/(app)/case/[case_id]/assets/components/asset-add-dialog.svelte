<script lang="ts">
	import { getContext } from 'svelte';
	import { DownloadIcon, RotateCwIcon, SaveIcon, UploadIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
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
	import AssetCsvUpload from './asset-csv-upload.svelte';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	type CsvAssetRow = {
		asset_name: string;
		asset_type_name: string;
		asset_description: string;
		asset_ip: string;
		asset_domain: string;
		asset_tags: string;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let activeTab = $state('manual');
	let assetTypes = $state<AssetType[]>([]);
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);
	let currentTags = $state<Tag[]>([]);
	let isSaving = $state(false);
	let csvText = $state('');

	let addData = $state<AssetAddData>({
		asset_names: '',
		asset_description: '',
		asset_ip: '',
		asset_domain: '',
		asset_type_id: undefined,
		analysis_status_id: undefined,
		asset_compromise_status_id: 3,
		asset_tags: '',
		one_per_line: true
	});

	const sampleCsv = `asset_name,asset_type_name,asset_description,asset_ip,asset_domain,asset_tags
"My computer","Mac - Computer","Computer of Mme Michu","192.168.15.5","iris.local","Compta|Mac"
"XCAS","Windows - Server","Xcas server","192.168.15.48","iris.local",""`;

	const reset = () => {
		activeTab = 'manual';
		currentTags = [];
		isSaving = false;
		csvText = '';

		addData = {
			asset_names: '',
			asset_description: '',
			asset_ip: '',
			asset_domain: '',
			asset_type_id: undefined,
			analysis_status_id: undefined,
			asset_compromise_status_id: 3,
			asset_tags: '',
			one_per_line: true
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

	const updateField = (field: string, value: string | number | boolean | Tag[]) => {
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
		if (field === 'one_per_line' && typeof value === 'boolean') addData.one_per_line = value;
	};

	const createAssets = async (payloads: CreateCaseAssetBody[]) => {
		const createdAssets: Asset[] = [];

		for (const payload of payloads) {
			const created = await caseAssets.createAsset(payload, { fetch });

			if (!created) {
				throw new Error(`Failed to create asset "${payload.asset_name}"`);
			}

			createdAssets.push(created);
		}

		toast({
			title: 'Assets created',
			description: `${createdAssets.length} asset(s) created successfully.`,
			variant: 'success'
		});

		// If the dialog was opened from outside the assets section
		// (e.g. inline from the timeline event modal), don't pull the
		// user away from where they were. Only navigate when they're
		// already inside /case/.../assets — that's where the "open the
		// new asset" UX makes sense.
		const onAssetsRoute = page.url.pathname.startsWith(`/case/${caseId}/assets`);

		close();

		if (!onAssetsRoute) return;

		if (createdAssets.length === 1) {
			await goto(`/case/${caseId}/assets/${createdAssets[0].asset_id}`, { replaceState: true });
		} else {
			await goto(`/case/${caseId}/assets`, { replaceState: true });
		}
	};

	const saveManual = async () => {
		// When "One asset per line" is on, every non-empty line becomes its
		// own asset (sharing the rest of the form metadata). When off, the
		// whole textarea content is treated as a single asset name —
		// trimmed, but otherwise preserved.
		const assetNames = addData.one_per_line
			? addData.asset_names
					.split('\n')
					.map((name) => name.trim())
					.filter(Boolean)
			: (() => {
					const trimmed = addData.asset_names.trim();
					return trimmed ? [trimmed] : [];
				})();

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
			await createAssets(
				assetNames.map((assetName) => ({
					asset_name: assetName,
					asset_type_id: addData.asset_type_id as number,
					asset_description: addData.asset_description,
					asset_ip: addData.asset_ip,
					asset_domain: addData.asset_domain,
					analysis_status_id: addData.analysis_status_id,
					asset_compromise_status_id: addData.asset_compromise_status_id,
					asset_tags: tagsToString(currentTags)
				}))
			);
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

	const parseCsvLine = (line: string): string[] => {
		const values: string[] = [];
		let current = '';
		let quoted = false;

		for (let index = 0; index < line.length; index += 1) {
			const char = line[index];
			const next = line[index + 1];

			if (char === '"' && quoted && next === '"') {
				current += '"';
				index += 1;
			} else if (char === '"') {
				quoted = !quoted;
			} else if (char === ',' && !quoted) {
				values.push(current);
				current = '';
			} else {
				current += char;
			}
		}

		values.push(current);

		return values.map((value) => value.trim());
	};

	const parseCsv = (text: string): CsvAssetRow[] => {
		const lines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		if (lines.length === 0) return [];

		const expectedHeaders = [
			'asset_name',
			'asset_type_name',
			'asset_description',
			'asset_ip',
			'asset_domain',
			'asset_tags'
		];

		const firstLine = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
		const hasHeader = expectedHeaders.every((header, index) => firstLine[index] === header);
		const rows = hasHeader ? lines.slice(1) : lines;

		return rows.map((line) => {
			const values = parseCsvLine(line);

			return {
				asset_name: values[0] ?? '',
				asset_type_name: values[1] ?? '',
				asset_description: values[2] ?? '',
				asset_ip: values[3] ?? '',
				asset_domain: values[4] ?? '',
				asset_tags: values[5] ?? ''
			};
		});
	};

	const uploadCsv = async () => {
		const rows = parseCsv(csvText);

		if (rows.length === 0) {
			toast({
				title: 'Missing CSV file',
				description: 'Choose a CSV file to import.',
				variant: 'destructive'
			});
			return;
		}

		const errors: string[] = [];
		const payloads: CreateCaseAssetBody[] = [];

		for (const [index, row] of rows.entries()) {
			if (!row.asset_name.trim()) {
				errors.push(`Empty asset name for row ${index + 1}`);
				continue;
			}

			if (!row.asset_type_name.trim()) {
				errors.push(`Empty asset type for row ${index + 1}`);
				continue;
			}

			const assetType = assetTypes.find(
				(type) => type.asset_name.toLowerCase() === row.asset_type_name.toLowerCase()
			);

			if (!assetType) {
				errors.push(
					`${row.asset_name} (invalid asset type: ${row.asset_type_name}) for row ${index + 1}`
				);
				continue;
			}

			payloads.push({
				asset_name: row.asset_name,
				asset_type_id: assetType.asset_id,
				asset_description: row.asset_description,
				asset_ip: row.asset_ip,
				asset_domain: row.asset_domain,
				analysis_status_id: addData.analysis_status_id,
				asset_compromise_status_id: addData.asset_compromise_status_id,
				asset_tags: row.asset_tags.replaceAll('|', ',')
			});
		}

		if (payloads.length === 0) {
			toast({
				title: 'CSV import failed',
				description: errors.join('\n'),
				variant: 'destructive'
			});
			return;
		}

		isSaving = true;

		try {
			await createAssets(payloads);

			if (errors.length > 0) {
				toast({
					title: 'CSV imported with errors',
					description: errors.join('\n'),
					variant: 'destructive'
				});
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'CSV import failed',
				description: message,
				variant: 'destructive'
			});
		} finally {
			isSaving = false;
		}
	};

	const downloadSampleCsv = () => {
		const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = 'sample_assets.csv';
		link.click();

		URL.revokeObjectURL(url);
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
	<Dialog.Content
		class="z-[70] flex max-h-[90vh] max-w-[980px] flex-col gap-0 overflow-hidden p-0"
		overlayClass="z-[60]"
	>
		<Dialog.Header class="shrink-0 border-b px-6 py-4">
			<Dialog.Title class="text-base font-medium">Add assets</Dialog.Title>
		</Dialog.Header>

		<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
			<TabsList class="mx-auto mt-2 shrink-0">
				<TabsTrigger value="manual">Manual entry</TabsTrigger>
				<TabsTrigger value="csv">CSV upload</TabsTrigger>
			</TabsList>

			<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
				<TabsContent value="manual" class="m-0">
					<AssetAddForm
						{addData}
						{currentTags}
						{assetTypes}
						{analysisStatuses}
						onUpdateField={updateField}
					/>
				</TabsContent>

				<TabsContent value="csv" class="m-0">
					<AssetCsvUpload {sampleCsv} onCsvChange={(text) => (csvText = text)} />
				</TabsContent>
			</div>
		</Tabs>

		<div class="flex shrink-0 items-center justify-between gap-2 border-t px-6 py-4">
			{#if activeTab === 'csv'}
				<Button variant="outline" disabled={isSaving} onclick={downloadSampleCsv}>
					<DownloadIcon class="h-4 w-4" />
					Download sample CSV
				</Button>
			{:else}
				<div></div>
			{/if}

			<div class="flex items-center gap-2">
				<Button variant="outline" disabled={isSaving} onclick={close}>Cancel</Button>

				<Button disabled={isSaving} onclick={activeTab === 'csv' ? uploadCsv : saveManual}>
					{#if isSaving}
						<RotateCwIcon class="h-4 w-4 animate-spin" />
						Saving...
					{:else if activeTab === 'csv'}
						<UploadIcon class="h-4 w-4" />
						Upload CSV
					{:else}
						<SaveIcon class="h-4 w-4" />
						Add assets
					{/if}
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
