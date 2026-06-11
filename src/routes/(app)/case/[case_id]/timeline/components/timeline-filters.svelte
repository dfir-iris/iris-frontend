<script lang="ts">
	import { XIcon } from 'lucide-svelte';
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
		{ field: 'title', label: 'Title', placeholder: 'contains…' },
		{ field: 'description', label: 'Description', placeholder: 'contains…' },
		{ field: 'source', label: 'Source', placeholder: 'contains…' },
		{ field: 'tag', label: 'Tag', placeholder: 'contains…' },
		{ field: 'asset', label: 'Asset', placeholder: 'contains…' },
		{ field: 'ioc', label: 'IOC', placeholder: 'contains…' },
		{ field: 'startDate', label: 'From', placeholder: '', type: 'date' },
		{ field: 'endDate', label: 'Until', placeholder: '', type: 'date' }
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

	const activeCount = $derived(
		(Object.keys(filters) as Array<keyof TimelineFilterData>).filter((k) => {
			const v = filters[k];
			return typeof v === 'string' ? v.trim().length > 0 : !!v;
		}).length
	);
</script>

<form
	class="border-t border-border bg-muted/40 px-4 py-3 dark:bg-slate-900/40"
	onsubmit={(e) => {
		e.preventDefault();
		onApply();
	}}
>
	<div class="mx-auto max-w-6xl">
		<div class="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each textFields as item (item.field)}
				<label class="flex flex-col gap-1">
					<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
						{item.label}
					</span>
					<Input
						type={item.type ?? 'text'}
						value={filters[item.field]}
						oninput={(e) => updateField(item.field, (e.target as HTMLInputElement).value)}
						placeholder={item.placeholder}
						class="h-8 text-xs"
					/>
				</label>
			{/each}

			<label class="flex flex-col gap-1">
				<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
					Category
				</span>
				<SearchSelect
					size="sm"
					value={filters.category}
					options={eventCategoryOptions}
					placeholder="Any"
					searchPlaceholder="Search category..."
					onChange={(value) => updateField('category', value)}
				/>
			</label>

			<label class="flex flex-col gap-1">
				<span class="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
					Flag
				</span>
				<SearchSelect
					size="sm"
					value={filters.flag}
					options={flagOptions}
					placeholder="Any"
					searchPlaceholder="Search flag state..."
					onChange={(value) => updateField('flag', value)}
				/>
			</label>
		</div>

		<div class="mt-3 flex items-center justify-between gap-2">
			<span class="text-2xs text-muted-foreground">
				{activeCount === 0 ? 'No filters applied' : `${activeCount} active filter${activeCount === 1 ? '' : 's'}`}
			</span>
			<div class="flex items-center gap-2">
				<Button size="sm" type="button" variant="ghost" onclick={onClear}>
					<XIcon class="mr-1 size-3.5" />
					Clear
				</Button>
				<Button size="sm" type="submit">Apply</Button>
			</div>
		</div>
	</div>
</form>
