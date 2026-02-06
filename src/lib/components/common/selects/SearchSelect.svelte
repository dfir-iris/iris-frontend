<script lang="ts">
	import { CheckIcon, ChevronDownIcon } from 'lucide-svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';

	export type SelectOption = {
		value: string;
		label: string;
	};

	type Props = {
		value: string;
		options: SelectOption[];
		placeholder: string;
		searchPlaceholder: string;
		disabled?: boolean;
		onChange: (value: string) => void;
	};

	const {
		value,
		options,
		placeholder,
		searchPlaceholder,
		disabled = false,
		onChange
	}: Props = $props();

	let open = $state(false);
	let filter = $state('');

	const selectedLabel = $derived.by(() => {
		if (value === '') return placeholder;
		const option = options.find((option) => option.value === value);
		return option ? option.label : placeholder;
	});

	const filteredOptions = $derived.by(() => {
		if (filter === '') return options;
		const query = filter.toLowerCase();
		return options.filter((option) => option.label.toLowerCase().includes(query));
	});

	const choose = (v: string) => {
		onChange(v);
		open = false;
	};

	$effect(() => {
		if (open) filter = '';
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button {...props} type="button" variant="outline" class="w-full justify-between" {disabled}>
				<span class="truncate">{selectedLabel}</span>
				<ChevronDownIcon size="16" />
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-[calc(525px-3rem)] max-w-[calc(100vw-3rem)] p-2">
		<Input
			type="text"
			placeholder={searchPlaceholder}
			bind:value={filter}
			class="mb-2 w-full"
			{disabled}
		/>

		<div class="max-h-72 overflow-auto">
			{#if filteredOptions.length === 0}
				<div class="px-2 py-2 text-sm opacity-70">No matches</div>
			{:else}
				{#each filteredOptions as o (o.value)}
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted"
						onclick={() => choose(o.value)}
						{disabled}
					>
						<span class="truncate">{o.label}</span>
						{#if value === o.value}
							<CheckIcon size="16" />
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</Popover.Content>
</Popover.Root>
