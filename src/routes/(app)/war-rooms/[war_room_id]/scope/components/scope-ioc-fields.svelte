<!--
  IOC payload fields, shared by "Add IOC" and the staging editor. Typing
  or pasting a value pre-selects its detected type until the analyst
  picks one by hand.
-->
<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { Sparkles } from 'lucide-svelte';
	import type { IocType } from '$lib/services/ioc-types.service';
	import { detectIocType } from '$lib/utils/ioc-type-detect';
	import type { TlpItem } from '$lib/services/tlp.service';
	import type { IocForm } from './helpers';

	type Props = {
		form: IocForm;
		iocTypes: IocType[];
		tlps: TlpItem[];
		idPrefix?: string;
	};

	let { form = $bindable(), iocTypes, tlps, idPrefix = 'scope-ioc' }: Props = $props();

	const typeOptions = $derived<SelectOption[]>(
		iocTypes.map((t) => ({ value: String(t.type_id), label: t.type_name }))
	);

	// Auto-detection only drives the type while it is empty or was set by
	// detection; a manual pick (or the type of an edited staged object)
	// is never overwritten.
	let autoTypeId = $state<string | null>(null);
	const detected = $derived(detectIocType(form.ioc_value, iocTypes));
	const typeIsAuto = $derived(autoTypeId !== null && form.ioc_type_id === autoTypeId);

	const onValueInput = (value: string) => {
		form.ioc_value = value;
		if (form.ioc_type_id !== '' && !typeIsAuto) return;
		const match = detectIocType(value, iocTypes);
		const next = match ? String(match.type_id) : '';
		form.ioc_type_id = next;
		autoTypeId = next || null;
	};

	const selectClass = 'mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm';
	const labelClass = 'text-xs font-medium text-muted-foreground';
</script>

<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
	<div class="sm:col-span-2">
		<label class={labelClass} for={`${idPrefix}-value`}>Value (required)</label>
		<Input
			id={`${idPrefix}-value`}
			value={form.ioc_value}
			oninput={(e) => onValueInput((e.target as HTMLInputElement).value)}
			placeholder="evil.example.com, 8.8.8.8, a hash, a URL…"
			class="mt-1 font-mono"
			aria-required="true"
		/>
	</div>
	<div>
		<span class={labelClass} id={`${idPrefix}-type-label`}>Type (required)</span>
		<div class="mt-1" aria-labelledby={`${idPrefix}-type-label`}>
			<SearchSelect
				value={form.ioc_type_id}
				options={typeOptions}
				placeholder="Select IOC type"
				searchPlaceholder="Search IOC type..."
				onChange={(v) => {
					form.ioc_type_id = Array.isArray(v) ? (v[0] ?? '') : v;
					autoTypeId = null;
				}}
			/>
		</div>
		{#if typeIsAuto && detected}
			<p class="mt-1 flex items-center gap-1 text-2xs text-muted-foreground" aria-live="polite">
				<Sparkles class="h-3 w-3 text-primary" aria-hidden="true" />
				Detected as <span class="font-medium text-foreground">{detected.type_name}</span>
			</p>
		{:else if form.ioc_value.trim() && form.ioc_type_id === '' && !detected}
			<p class="mt-1 text-2xs text-muted-foreground" aria-live="polite">
				Type not recognised, pick one.
			</p>
		{/if}
	</div>
	<div>
		<label class={labelClass} for={`${idPrefix}-tlp`}>TLP</label>
		<select
			id={`${idPrefix}-tlp`}
			class={selectClass}
			value={form.ioc_tlp_id}
			onchange={(e) => (form.ioc_tlp_id = (e.target as HTMLSelectElement).value)}
		>
			<option value="">Default</option>
			{#each tlps as t (t.tlp_id)}
				<option value={String(t.tlp_id)}>TLP:{t.tlp_name.toUpperCase()}</option>
			{/each}
		</select>
	</div>
	<div class="sm:col-span-2">
		<label class={labelClass} for={`${idPrefix}-tags`}>Tags (comma separated)</label>
		<Input
			id={`${idPrefix}-tags`}
			value={form.ioc_tags}
			oninput={(e) => (form.ioc_tags = (e.target as HTMLInputElement).value)}
			placeholder="c2, phishing"
			class="mt-1"
		/>
	</div>
	<div class="sm:col-span-2">
		<label class={labelClass} for={`${idPrefix}-description`}>Description</label>
		<Textarea
			id={`${idPrefix}-description`}
			value={form.ioc_description}
			oninput={(e) => (form.ioc_description = (e.target as HTMLTextAreaElement).value)}
			rows={3}
			class="mt-1"
		/>
	</div>
</div>
