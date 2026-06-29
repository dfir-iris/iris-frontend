<script lang="ts">
	import { getContext } from 'svelte';
	import { DownloadIcon, RotateCwIcon, SaveIcon, UploadIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Tag } from '$lib/types/resources/tag';
	import { stringToTags, tagsToString } from '$lib/utils/tags';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import { TlpService, type TlpItem } from '$lib/services/tlp.service';
	import type { CreateCaseIocBody } from '$lib/services/case-iocs.service';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { toast } from '$lib/components/ui/toast';
	import IocAddForm, { type IocAddData } from './ioc-add-form.svelte';
	import IocCsvUpload from './ioc-csv-upload.svelte';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
	};

	type CsvIocRow = {
		ioc_value: string;
		ioc_type_name: string;
		ioc_description: string;
		ioc_tlp_name: string;
		ioc_tags: string;
	};

	let { open = $bindable(), onOpenChange }: Props = $props();

	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);
	const caseId = $derived(Number(page.params.case_id));

	let activeTab = $state('manual');
	let iocTypes = $state<IocType[]>([]);
	let tlps = $state<TlpItem[]>([]);
	let currentTags = $state<Tag[]>([]);
	let isSaving = $state(false);
	let csvText = $state('');

	let addData = $state<IocAddData>({
		ioc_value: '',
		ioc_description: '',
		ioc_type_id: undefined,
		ioc_tlp_id: undefined,
		ioc_tags: '',
		one_per_line: true
	});

	const sampleCsv = `ioc_value,ioc_type_name,ioc_description,ioc_tlp_name,ioc_tags
"192.168.15.5","ip-src","Source IP observed in logs","amber","ip|internal"
"evil.example.com","domain","Suspicious domain","green","domain|osint"`;

	const reset = () => {
		activeTab = 'manual';
		currentTags = [];
		isSaving = false;
		csvText = '';

		addData = {
			ioc_value: '',
			ioc_description: '',
			ioc_type_id: undefined,
			ioc_tlp_id: undefined,
			ioc_tags: '',
			one_per_line: true
		};
	};

	const close = () => onOpenChange(false);

	const loadOptions = async () => {
		const [iocTypesRes, tlpRes] = await Promise.all([IocTypesService.list(), TlpService.list()]);

		iocTypes = iocTypesRes.data as IocType[];
		tlps = tlpRes.data as TlpItem[];
	};

	const updateField = (field: string, value: string | number | boolean | Tag[]) => {
		if (field === 'ioc_tags') {
			if (Array.isArray(value)) {
				currentTags = [...value];
				addData.ioc_tags = tagsToString(value);
			} else if (typeof value === 'string') {
				currentTags = stringToTags(value);
				addData.ioc_tags = value;
			}

			return;
		}

		if (field === 'ioc_value' && typeof value === 'string') addData.ioc_value = value;
		if (field === 'ioc_description' && typeof value === 'string') addData.ioc_description = value;
		if (field === 'ioc_type_id' && typeof value === 'number') addData.ioc_type_id = value;
		if (field === 'ioc_tlp_id' && typeof value === 'number') addData.ioc_tlp_id = value;
		if (field === 'one_per_line' && typeof value === 'boolean') addData.one_per_line = value;
	};

	const createIocs = async (payloads: CreateCaseIocBody[]) => {
		const createdIocs = [];

		for (const payload of payloads) {
			const created = await caseIocs.createIoc(payload, { fetch });

			if (!created) {
				throw new Error(`Failed to create IOC "${payload.ioc_value}"`);
			}

			createdIocs.push(created);
		}

		toast({
			title: 'IOCs created',
			description: `${createdIocs.length} IOC(s) created successfully.`,
			variant: 'success'
		});

		// Only navigate to the new IOC when the dialog was opened from
		// within the IOCs section — otherwise we'd yank the user out of
		// e.g. the timeline event modal they were composing.
		const onIocsRoute = page.url.pathname.startsWith(`/case/${caseId}/iocs`);

		close();

		if (!onIocsRoute) return;

		if (createdIocs.length === 1) {
			await goto(`/case/${caseId}/iocs/${createdIocs[0].ioc_id}`, { replaceState: true });
		} else {
			await goto(`/case/${caseId}/iocs`, { replaceState: true });
		}
	};

	const saveManual = async () => {
		// One IOC per line: each non-empty trimmed line becomes its own IOC,
		// sharing the type/TLP/description/tags. Otherwise treat the full
		// textarea as a single trimmed value.
		const iocValues = addData.one_per_line
			? addData.ioc_value
					.split('\n')
					.map((value) => value.trim())
					.filter(Boolean)
			: (() => {
					const trimmed = addData.ioc_value.trim();
					return trimmed ? [trimmed] : [];
				})();

		if (iocValues.length === 0 || !addData.ioc_type_id || !addData.ioc_tlp_id) {
			toast({
				title: 'Missing required fields',
				description: 'IOC value, type, and TLP are required.',
				variant: 'destructive'
			});
			return;
		}

		isSaving = true;

		try {
			await createIocs(
				iocValues.map((iocValue) => ({
					ioc_value: iocValue,
					ioc_type_id: addData.ioc_type_id as number,
					ioc_tlp_id: addData.ioc_tlp_id as number,
					ioc_description: addData.ioc_description,
					ioc_tags: tagsToString(currentTags)
				}))
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';

			toast({
				title: 'Create failed',
				description: `There was a problem creating IOC. Error: ${message}`,
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

	const parseCsv = (text: string): CsvIocRow[] => {
		const lines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean);

		if (lines.length === 0) return [];

		const expectedHeaders = [
			'ioc_value',
			'ioc_type_name',
			'ioc_description',
			'ioc_tlp_name',
			'ioc_tags'
		];

		const firstLine = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
		const hasHeader = expectedHeaders.every((header, index) => firstLine[index] === header);
		const rows = hasHeader ? lines.slice(1) : lines;

		return rows.map((line) => {
			const values = parseCsvLine(line);

			return {
				ioc_value: values[0] ?? '',
				ioc_type_name: values[1] ?? '',
				ioc_description: values[2] ?? '',
				ioc_tlp_name: values[3] ?? '',
				ioc_tags: values[4] ?? ''
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
		const payloads: CreateCaseIocBody[] = [];

		for (const [index, row] of rows.entries()) {
			if (!row.ioc_value.trim()) {
				errors.push(`Empty IOC value for row ${index + 1}`);
				continue;
			}

			if (!row.ioc_type_name.trim()) {
				errors.push(`Empty IOC type for row ${index + 1}`);
				continue;
			}

			if (!row.ioc_tlp_name.trim()) {
				errors.push(`Empty TLP for row ${index + 1}`);
				continue;
			}

			const iocType = iocTypes.find(
				(type) => type.type_name.toLowerCase() === row.ioc_type_name.toLowerCase()
			);

			if (!iocType) {
				errors.push(
					`${row.ioc_value} (invalid IOC type: ${row.ioc_type_name}) for row ${index + 1}`
				);
				continue;
			}

			const tlp = tlps.find(
				(item) => item.tlp_name.toLowerCase() === row.ioc_tlp_name.toLowerCase()
			);

			if (!tlp) {
				errors.push(`${row.ioc_value} (invalid TLP: ${row.ioc_tlp_name}) for row ${index + 1}`);
				continue;
			}

			payloads.push({
				ioc_value: row.ioc_value,
				ioc_type_id: iocType.type_id,
				ioc_tlp_id: tlp.tlp_id,
				ioc_description: row.ioc_description,
				ioc_tags: row.ioc_tags.replaceAll('|', ',')
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
			await createIocs(payloads);

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
		link.download = 'sample_iocs.csv';
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
			<Dialog.Title class="text-base font-medium">Add IOCs</Dialog.Title>
		</Dialog.Header>

		<Tabs bind:value={activeTab} class="flex min-h-0 flex-1 flex-col">
			<TabsList class="mx-auto mt-2 shrink-0">
				<TabsTrigger value="manual">Manual entry</TabsTrigger>
				<TabsTrigger value="csv">CSV upload</TabsTrigger>
			</TabsList>

			<div class="min-h-0 flex-1 overflow-auto px-6 py-5">
				<TabsContent value="manual" class="m-0">
					<IocAddForm {addData} {currentTags} {iocTypes} {tlps} onUpdateField={updateField} />
				</TabsContent>

				<TabsContent value="csv" class="m-0">
					<IocCsvUpload {sampleCsv} onCsvChange={(text) => (csvText = text)} />
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
						Add IOC
					{/if}
				</Button>
			</div>
		</div>
	</Dialog.Content>
</Dialog.Root>
