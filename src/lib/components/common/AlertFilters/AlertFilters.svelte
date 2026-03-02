<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import type { Filters } from './filters';
	import { defaultFilters, numOrUndef, strOrUndef } from './filters';
	import SaveAlertFiltersModal from './SaveAlertFiltersModal.svelte';

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
	};

	let {
		value,
		onChange,
		onApply,
		onClear,
		presets = [],
		onSaveAsFilter,
		saving = false
	}: Props = $props();

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
			<Input
				inputmode="numeric"
				value={value.alert_status_id == null ? '' : String(value.alert_status_id)}
				oninput={(e) => setNum('alert_status_id', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Severity</div>
			<Input
				inputmode="numeric"
				value={value.alert_severity_id == null ? '' : String(value.alert_severity_id)}
				oninput={(e) => setNum('alert_severity_id', (e.currentTarget as HTMLInputElement).value)}
			/>
		</div>

		<div class="space-y-1">
			<div class="text-sm font-medium">Classification</div>
			<Input
				inputmode="numeric"
				value={value.alert_classification_id == null ? '' : String(value.alert_classification_id)}
				oninput={(e) =>
					setNum('alert_classification_id', (e.currentTarget as HTMLInputElement).value)}
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
