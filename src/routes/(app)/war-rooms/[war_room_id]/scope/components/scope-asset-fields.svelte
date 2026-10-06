<!--
  Asset payload fields, shared by "Add asset" and the staging editor.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { COMPROMISE_STATUS } from '$lib/constants/compromise_status';
	import type { AssetType } from '$lib/services/asset-types.service';
	import type { AnalysisStatusItem } from '$lib/services/analysis-status.service';
	import type { AssetForm } from './helpers';

	type Props = {
		form: AssetForm;
		assetTypes: AssetType[];
		analysisStatuses: AnalysisStatusItem[];
		idPrefix?: string;
	};

	let {
		form = $bindable(),
		assetTypes,
		analysisStatuses,
		idPrefix = 'scope-asset'
	}: Props = $props();

	const typeOptions = $derived<SelectOption[]>(
		assetTypes.map((t) => ({ value: String(t.asset_id), label: t.asset_name }))
	);

	const compromiseOptions = Object.entries(COMPROMISE_STATUS).map(([id, name]) => ({
		id,
		name
	}));

	const selectClass = 'mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm';
	const labelClass = 'text-xs font-medium text-muted-foreground';
</script>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
	<div>
		<label class={labelClass} for={`${idPrefix}-name`}>Name (required)</label>
		<Input
			id={`${idPrefix}-name`}
			value={form.asset_name}
			oninput={(e) => (form.asset_name = (e.target as HTMLInputElement).value)}
			maxlength={155}
			placeholder="DC01"
			class="mt-1"
			aria-required="true"
		/>
	</div>
	<div>
		<span class={labelClass} id={`${idPrefix}-type-label`}>Type (required)</span>
		<div class="mt-1" aria-labelledby={`${idPrefix}-type-label`}>
			<SearchSelect
				value={form.asset_type_id}
				options={typeOptions}
				placeholder="Select asset type"
				searchPlaceholder="Search asset type..."
				onChange={(v) => (form.asset_type_id = Array.isArray(v) ? (v[0] ?? '') : v)}
			/>
		</div>
	</div>
	<div>
		<label class={labelClass} for={`${idPrefix}-ip`}>IP</label>
		<Input
			id={`${idPrefix}-ip`}
			value={form.asset_ip}
			oninput={(e) => (form.asset_ip = (e.target as HTMLInputElement).value)}
			maxlength={255}
			placeholder="10.0.0.5"
			class="mt-1 font-mono"
		/>
	</div>
	<div>
		<label class={labelClass} for={`${idPrefix}-domain`}>Domain</label>
		<Input
			id={`${idPrefix}-domain`}
			value={form.asset_domain}
			oninput={(e) => (form.asset_domain = (e.target as HTMLInputElement).value)}
			maxlength={255}
			placeholder="corp.example"
			class="mt-1"
		/>
	</div>
	<div>
		<label class={labelClass} for={`${idPrefix}-compromise`}>Compromise</label>
		<select
			id={`${idPrefix}-compromise`}
			class={selectClass}
			value={form.asset_compromise_status_id}
			onchange={(e) => (form.asset_compromise_status_id = (e.target as HTMLSelectElement).value)}
		>
			<option value="">Not set</option>
			{#each compromiseOptions as o (o.id)}
				<option value={o.id}>{o.name}</option>
			{/each}
		</select>
	</div>
	<div>
		<label class={labelClass} for={`${idPrefix}-analysis`}>Analysis status</label>
		<select
			id={`${idPrefix}-analysis`}
			class={selectClass}
			value={form.analysis_status_id}
			onchange={(e) => (form.analysis_status_id = (e.target as HTMLSelectElement).value)}
		>
			<option value="">Default</option>
			{#each analysisStatuses as s (s.id)}
				<option value={String(s.id)}>{s.name}</option>
			{/each}
		</select>
	</div>
	<div class="sm:col-span-2">
		<label class={labelClass} for={`${idPrefix}-tags`}>Tags (comma separated)</label>
		<Input
			id={`${idPrefix}-tags`}
			value={form.asset_tags}
			oninput={(e) => (form.asset_tags = (e.target as HTMLInputElement).value)}
			placeholder="domain-controller, tier0"
			class="mt-1"
		/>
	</div>
	<div class="sm:col-span-2">
		<label class={labelClass} for={`${idPrefix}-description`}>Description</label>
		<Textarea
			id={`${idPrefix}-description`}
			value={form.asset_description}
			oninput={(e) => (form.asset_description = (e.target as HTMLTextAreaElement).value)}
			rows={3}
			class="mt-1"
		/>
	</div>
</div>
