<script lang="ts">
	import type { EventCategory } from '$lib/services/event-categories.service';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import type { TimelineFilterData, TimelineFilterFieldValue } from '../types';
	import { toSingleValue } from '../helpers';

	type TextFilterField = Exclude<keyof TimelineFilterData, 'category' | 'flag'>;

	type Props = {
		filters: TimelineFilterData;
		eventCategories: EventCategory[];
		onUpdateField: (field: keyof TimelineFilterData, value: TimelineFilterFieldValue) => void;
		onApply: () => void;
		onClear: () => void;
	};

	let { filters, eventCategories, onUpdateField, onApply, onClear }: Props = $props();

	const textFields: Array<{
		field: TextFilterField;
		label: string;
		placeholder: string;
		type?: string;
	}> = [
		{ field: 'title', label: 'Title', placeholder: 'Filter by title...' },
		{ field: 'description', label: 'Description', placeholder: 'Filter by description...' },
		{ field: 'source', label: 'Source', placeholder: 'Filter by source...' },
		{ field: 'tag', label: 'Tag', placeholder: 'Filter by tag...' },
		{ field: 'asset', label: 'Asset', placeholder: 'Filter by asset...' },
		{ field: 'ioc', label: 'IOC', placeholder: 'Filter by IOC...' },
		{ field: 'startDate', label: 'Start date', placeholder: '', type: 'date' },
		{ field: 'endDate', label: 'End date', placeholder: '', type: 'date' }
	];

	const eventCategoryOptions = $derived<SelectOption[]>(
		eventCategories.map((category) => ({
			value: category.name,
			label: category.name
		}))
	);

	const flagOptions: SelectOption[] = [
		{ value: 'true', label: 'Flagged' },
		{ value: 'false', label: 'Not flagged' }
	];

	const updateField = (field: keyof TimelineFilterData, value: string | string[]) =>
		onUpdateField(field, toSingleValue(value));
</script>

<form
	class="border-t border-white/10 bg-primary px-6 py-4"
	onsubmit={(e) => {
		e.preventDefault();
		onApply();
	}}
>
	<div class="mx-auto grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
		{#each textFields as item}
			<div>
				<span class="mb-1 text-xs font-medium text-white/70">{item.label}</span>

				<Input
					type={item.type ?? 'text'}
					value={filters[item.field]}
					oninput={(e) => updateField(item.field, (e.target as HTMLInputElement).value)}
					placeholder={item.placeholder}
					class="h-8 text-xs"
				/>
			</div>
		{/each}

		<div>
			<span class="mb-1 text-xs font-medium text-white/70">Category</span>

			<SearchSelect
				size="sm"
				value={filters.category}
				options={eventCategoryOptions}
				placeholder="Select category"
				searchPlaceholder="Search category..."
				onChange={(value) => updateField('category', value)}
			/>
		</div>

		<div>
			<span class="mb-1 text-xs font-medium text-white/70">Flag</span>

			<SearchSelect
				size="sm"
				value={filters.flag}
				options={flagOptions}
				placeholder="Any flag state"
				searchPlaceholder="Search flag state..."
				onChange={(value) => updateField('flag', value)}
			/>
		</div>

		<div class="flex items-end gap-2 md:col-span-3 xl:col-span-2">
			<Button size="sm" type="submit" variant="secondary">Apply filters</Button>
			<Button size="sm" type="button" variant="secondary" onclick={onClear}>Clear</Button>
		</div>
	</div>
</form>
