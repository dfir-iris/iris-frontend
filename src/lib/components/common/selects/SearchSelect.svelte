<script lang="ts">
	import { CheckIcon, ChevronDownIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';

	export type SelectOption = {
		value: string;
		label: string;
	};

	export type SearchSelectProps = {
		value: string | string[];
		options: SelectOption[];
		placeholder: string;
		searchPlaceholder: string;
		disabled?: boolean;
		multiple?: boolean;
		size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon';
		onChange: (value: string | string[]) => void;
	};

	const {
		value,
		options,
		placeholder,
		searchPlaceholder,
		disabled = false,
		multiple = false,
		size = 'default',
		onChange
	}: SearchSelectProps = $props();

	let open = $state(false);
	let filter = $state('');
	let selectAllEl = $state();

	const selectedLabel = $derived.by(() => {
		if (!multiple) {
			if (value === '') return placeholder;
			const option = options.find((option) => option.value === value);
			return option ? option.label : placeholder;
		}

		const values = Array.isArray(value) ? value : [];
		if (values.length === 0) return placeholder;

		const labels = values
			.map((v) => options.find((o) => o.value === v)?.label)
			.filter((x): x is string => typeof x === 'string');

		if (labels.length <= 2) return labels.join(', ');
		return `${values.length} selected`;
	});

	const filteredOptions = $derived.by(() => {
		if (filter === '') return options;
		const query = filter.toLowerCase();
		return options.filter((option) => option.label.toLowerCase().includes(query));
	});

	const isSelected = (v: string) => {
		if (!multiple) return value === v;
		return Array.isArray(value) ? value.includes(v) : false;
	};

	const choose = (v: string) => {
		if (!multiple) {
			onChange(v);

			open = false;
			return;
		}

		const current = Array.isArray(value) ? value : [];
		const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];

		onChange(next);
	};

	const allSelected = $derived.by(() => {
		if (!multiple) return false;
		const current = Array.isArray(value) ? value : [];
		return options.length > 0 && current.length === options.length;
	});

	const someSelected = $derived.by(() => {
		if (!multiple) return false;
		const current = Array.isArray(value) ? value : [];
		return current.length > 0 && current.length < options.length;
	});

	const toggleAll = () => {
		if (!multiple) return;
		if (allSelected) onChange([]);
		else onChange(options.map((o) => o.value));
	};

	$effect(() => {
		if (open) filter = '';
	});

	$effect(() => {
		if (!multiple) return;
		if (!selectAllEl) return;

		(selectAllEl as HTMLInputElement).indeterminate = someSelected;
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} type="button" variant="outline" {size} class="w-full justify-between" {disabled}>
				<span class="truncate">{selectedLabel}</span>
				<ChevronDownIcon size="16" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<!--
	  Popover width pins to the trigger width by default so the dropdown
	  visually anchors under the input. When the dropdown's content is
	  wider than the trigger (long option labels), we let it grow up to
	  the viewport edge — but we never shrink below the trigger, which
	  was the case when a fixed `min-w-48` floor caused narrow triggers
	  to center an oversized popover. `align="start"` keeps the popover's
	  left edge flush with the trigger's left edge.
	-->
	<!--
	  z-[80] keeps the dropdown above stacked dialogs. The default
	  popover content is z-50; a popover opened inside an add-modal
	  that itself opens on top of another dialog (event modal → asset
	  add modal → type/TLP dropdown) would otherwise render *under* the
	  asset modal's z-[70] content. Setting z-[80] here means the
	  dropdown always paints above the modal it lives inside.
	-->
	<Popover.Content
		align="start"
		class="z-[80] w-[--bits-popover-anchor-width] min-w-[--bits-popover-anchor-width] max-w-[calc(100vw-3rem)] p-1.5"
	>
		<Input
			type="text"
			placeholder={searchPlaceholder}
			bind:value={filter}
			class="mb-1.5 h-8 w-full text-xs"
			{disabled}
		/>

		<div class="max-h-72 overflow-auto">
			{#if multiple}
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
					onclick={toggleAll}
					{disabled}
				>
					<input
						bind:this={selectAllEl}
						type="checkbox"
						checked={allSelected}
						{disabled}
						class="pointer-events-none"
					/>
					<span class="truncate font-semibold">Select all</span>
				</button>
			{/if}

			{#if filteredOptions.length === 0}
				<div class="px-2 py-1.5 text-xs opacity-70">No matches</div>
			{:else}
				{#each filteredOptions as o (o.value)}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
						onclick={() => choose(o.value)}
						{disabled}
					>
						{#if multiple}
							<span class="flex min-w-0 items-center gap-2">
								<input
									type="checkbox"
									checked={isSelected(o.value)}
									{disabled}
									class="pointer-events-none"
								/>
								<span class="truncate">{o.label}</span>
							</span>
						{:else}
							<span class="truncate">{o.label}</span>
							{#if value === o.value}
								<CheckIcon size="14" />
							{/if}
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
