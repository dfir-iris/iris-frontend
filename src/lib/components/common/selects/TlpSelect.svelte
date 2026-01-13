<script lang="ts">
	import SearchableSelect from '$lib/components/ui/searchable-select/searchable-select.svelte';
	import { tlpList } from '$lib/stores/tlp.store';
	import type { Tlp } from '$lib/types/resources/ioc';

	let {
		value = $bindable(),
		onValueChange,
		hasError = false,
		placeholder = 'Select TLP level...',
		disabled = false,
		...restProps
	}: {
		value?: number | string;
		onValueChange?: (value: string) => void;
		hasError?: boolean;
		placeholder?: string;
		disabled?: boolean;
	} = $props();

	// Ensure TLP list is loaded
	$effect(() => {
		if (!tlpList.isInitialized()) {
			tlpList.fetch();
		}
	});

	// Convert TLP list to options format
	let items = $derived(
		$tlpList.map((tlp: Tlp) => ({
			value: tlp.tlp_id.toString(),
			label: tlp.tlp_name,
			// Add color badge or styling if needed
			extra: tlp.tlp_bscolor
		}))
	);

	// Handle value conversion
	let searchableValue = $derived.by(() => {
		if (value === undefined || value === null) return '';
		return value.toString();
	});

	function handleValueChange(newValue: string) {
		value = newValue ? parseInt(newValue) : undefined;
		onValueChange?.(newValue);
	}
</script>

<SearchableSelect
	value={searchableValue}
	{items}
	{placeholder}
	{disabled}
	onValueChange={handleValueChange}
	{...restProps}
/>
