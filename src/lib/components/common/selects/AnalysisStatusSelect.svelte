<script lang="ts">
	import { page } from '$app/state';
	import { SearchableSelect } from '$lib/components/ui/searchable-select';
	import { AnalysisStatusService } from '$lib/services/analysis-status.service';

	let {
		value = $bindable(),
		caseId = Number(page.params.case_id),
		placeholder = 'Select analysis status',
		searchPlaceholder = 'Search analysis statuses...',
		emptyMessage = 'No analysis statuses found.',
		disabled = false,
		required = false,
		class: className = '',
		id = 'analysis-status-select',
		'aria-label': ariaLabel = 'Select analysis status',
		onValueChange,
		hasError = false
	}: {
		value?: string;
		caseId?: number;
		placeholder?: string;
		searchPlaceholder?: string;
		emptyMessage?: string;
		disabled?: boolean;
		required?: boolean;
		class?: string;
		id?: string;
		'aria-label'?: string;
		onValueChange?: (value: string) => void;
		hasError?: boolean;
	} = $props();

	let analysisStatuses = $state<{ id: number; name: string }[]>([]);

	const items = $derived(
		analysisStatuses.map((status) => ({
			value: status.id.toString(),
			label: status.name,
			disabled: false
		}))
	);

	let stringValue = $state(value?.toString() ?? '');

	const handleValueChange = (newValue: string) => {
		value = newValue;
		onValueChange?.(newValue);
	};

	$effect(() => {
		stringValue = value?.toString() ?? '';
	});

	$effect(() => {
		if (!caseId) return;

		AnalysisStatusService.list(caseId, { fetch }).then((res) => {
			if (res.ok && Array.isArray(res.data)) {
				analysisStatuses = res.data;
			}
		});
	});
</script>

<SearchableSelect
	{items}
	value={stringValue}
	{placeholder}
	{searchPlaceholder}
	{emptyMessage}
	{disabled}
	{required}
	class={className + (hasError ? ' border-destructive' : '')}
	{id}
	aria-label={ariaLabel}
	onValueChange={handleValueChange}
	{...restProps}
/>
