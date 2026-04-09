<script lang="ts">
	import { type AlertResolution } from '$lib/services/alert-resolutions.service';
	import { type AlertStatus } from '$lib/services/alert-status.service';
	import { type CaseClassification } from '$lib/services/case-classifications.service';
	import { type Severity } from '$lib/services/severities.service';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { SaveAlertFiltersModal, defaultFilters, type Filters } from '.';

	type Preset = {
		filter_id: number;
		filter_name: string;
	};

	type SaveMeta = {
		name: string;
		description: string;
		isPrivate: boolean;
	};

	type Props = {
		value: Filters;
		onChange: (next: Filters) => void;
		onApply: () => void;
		onClear?: () => void;
		presets?: Preset[];
		selectedPresetId?: string;
		onPresetSelect?: (id: number) => void;
		onSaveAsFilter?: (filters: Filters, meta: SaveMeta) => void;
		saving?: boolean;
		alertResolutions: AlertResolution[];
		alertStatuses: AlertStatus[];
		caseClassifications: CaseClassification[];
		severities: Severity[];
	};

	let {
		value,
		onChange,
		onApply,
		onClear,
		presets = [],
		onSaveAsFilter,
		saving = false,
		alertResolutions,
		alertStatuses,
		caseClassifications,
		severities
	}: Props = $props();

	const strOrUndef = (v: string): string | undefined => {
		const s = v.trim();
		return s === '' ? undefined : s;
	};

	const numOrUndef = (v: string): number | undefined => {
		const s = v.trim();
		if (s === '') return undefined;
		const n = Number(s);
		return Number.isFinite(n) ? n : undefined;
	};

	const setStr = (key: keyof Filters, v: string) => {
		onChange({ ...value, [key]: strOrUndef(v) });
	};

	const setNum = (key: keyof Filters, v: string) => {
		onChange({ ...value, [key]: numOrUndef(v) });
	};

	const clear = () => {
		if (onClear) {
			onClear();
			return;
		}
		onChange(defaultFilters());
	};

	let saveOpen = $state(false);
	let saveMeta = $state<SaveMeta>({ name: '', description: '', isPrivate: true });

	const openSave = () => {
		saveMeta = { name: '', description: '', isPrivate: true };
		saveOpen = true;
	};

	const doSave = () => {
		if (!onSaveAsFilter) return;
		if (saveMeta.name.trim() === '') return;

		saveOpen = false;

		onSaveAsFilter(value, saveMeta);
	};

	const submit = (e: SubmitEvent) => {
		e.preventDefault();
		onApply();
	};

	const resolutionOptions = $derived.by<SelectOption[]>(() =>
		alertResolutions.map((resolution) => ({
			value: String(resolution.resolution_status_id),
			label: resolution.resolution_status_name
		}))
	);

	const statusOptions = $derived.by<SelectOption[]>(() =>
		alertStatuses.map((status) => ({
			value: String(status.status_id),
			label: status.status_name
		}))
	);

	const classificationOptions = $derived.by<SelectOption[]>(() =>
		caseClassifications.map((c) => ({ value: String(c.id), label: c.name_expanded }))
	);

	const severityOptions = $derived.by<SelectOption[]>(() =>
		severities.map((s) => ({ value: String(s.severity_id), label: s.severity_name }))
	);
</script>

<form class="rounded-xl border bg-background p-4" onsubmit={submit}>
	<div class="grid gap-4 md:grid-cols-4">
		<div class="space-y-1">
			<div class="text-sm font-medium">Title</div>
			<Input
				value={value.alert_title ?? ''}
				oninput={(e) => setStr('alert_title', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Description</div>
			<Input
				value={value.alert_description ?? ''}
				oninput={(e) => setStr('alert_description', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Source</div>
			<Input
				value={value.alert_source ?? ''}
				oninput={(e) => setStr('alert_source', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Tags</div>
			<Input
				value={typeof value.alert_tags === 'string' ? value.alert_tags : ''}
				oninput={(e) => setStr('alert_tags', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Status</div>
			<SearchSelect
				value={value.alert_status_id == null ? '' : String(value.alert_status_id)}
				options={statusOptions}
				placeholder="Status"
				searchPlaceholder="Search status..."
				onChange={(next) =>
					onChange({
						...value,
						alert_status_id: next ? Number(next) : undefined
					})}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Severity</div>
			<SearchSelect
				value={value.alert_severity_id == null ? '' : String(value.alert_severity_id)}
				options={severityOptions}
				placeholder="Severity"
				searchPlaceholder="Search severity..."
				onChange={(next) =>
					onChange({
						...value,
						alert_severity_id: next ? Number(next) : undefined
					})}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Classification</div>
			<SearchSelect
				value={value.alert_classification_id == null ? '' : String(value.alert_classification_id)}
				options={classificationOptions}
				placeholder="Classification"
				searchPlaceholder="Search classification..."
				onChange={(next) =>
					onChange({
						...value,
						alert_classification_id: next ? Number(next) : undefined
					})}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Customer</div>
			<Input
				inputmode="numeric"
				value={value.alert_customer_id == null ? '' : String(value.alert_customer_id)}
				oninput={(e) => setNum('alert_customer_id', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Source Start Date</div>
			<Input
				type="date"
				value={value.alert_start_date ?? ''}
				oninput={(e) => setStr('alert_start_date', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Source End Date</div>
			<Input
				type="date"
				value={value.alert_end_date ?? ''}
				oninput={(e) => setStr('alert_end_date', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Creation Start Date</div>
			<Input
				type="date"
				value={value.creation_start_date ?? ''}
				oninput={(e) => setStr('creation_start_date', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Creation End Date</div>
			<Input
				type="date"
				value={value.creation_end_date ?? ''}
				oninput={(e) => setStr('creation_end_date', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Asset(s) name</div>
			<Input
				value={typeof value.alert_assets === 'string' ? value.alert_assets : ''}
				oninput={(e) => setStr('alert_assets', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">IOC(s)</div>
			<Input
				value={typeof value.alert_iocs === 'string' ? value.alert_iocs : ''}
				oninput={(e) => setStr('alert_iocs', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Alert(s) ID</div>
			<Input
				value={typeof value.alert_ids === 'string' ? value.alert_ids : ''}
				oninput={(e) => setStr('alert_ids', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Source Reference</div>
			<Input
				value={value.source_reference ?? ''}
				oninput={(e) => setStr('source_reference', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Case ID</div>
			<Input
				inputmode="numeric"
				value={value.case_id == null ? '' : String(value.case_id)}
				oninput={(e) => setNum('case_id', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Owner</div>
			<Input
				inputmode="numeric"
				value={value.alert_owner_id == null ? '' : String(value.alert_owner_id)}
				oninput={(e) => setNum('alert_owner_id', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Resolution Status</div>
			<SearchSelect
				value={value.resolution_status_id == null ? '' : String(value.resolution_status_id)}
				options={resolutionOptions}
				placeholder="Resolution Status"
				searchPlaceholder="Search resolution status..."
				onChange={(next) =>
					onChange({
						...value,
						resolution_status_id: next ? Number(next) : undefined
					})}
			/>
		</div>
	</div>

	<div class="mt-4 flex items-center justify-between">
		<div class="flex gap-2">
			<Button type="submit">Apply Filters</Button>
			<Button type="button" variant="outline" onclick={clear}>Clear</Button>
		</div>

		{#if presets.length > 0 || onSaveAsFilter}
			<div class="flex items-center gap-2">
				{#if onSaveAsFilter}
					<Button type="button" variant="outline" disabled={saving} onclick={openSave}>
						Save as filter
					</Button>
				{/if}
			</div>
		{/if}
	</div>

	{#if onSaveAsFilter}
		<SaveAlertFiltersModal
			open={saveOpen}
			onOpenChange={(v) => (saveOpen = v)}
			value={saveMeta}
			onChange={(next) => (saveMeta = next)}
			disabled={saving}
			onSave={doSave}
		/>
	{/if}
</form>
