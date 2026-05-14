<script lang="ts">
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import type { EventCategory } from '$lib/services/event-categories.service';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { MarkDownEditor } from '$lib/components/common/MarkDown';
	import SearchSelect, {
		type SelectOption
	} from '$lib/components/common/selects/SearchSelect.svelte';

	export type TimelineEventFormData = {
		event_title: string;
		event_date: string;
		event_time: string;
		event_tz: string;
		event_content: string;
		event_raw: string;
		event_source: string;
		event_tags: string;
		event_category_id: number | null;
		parent_event_id: number | null;
		event_assets: number[];
		event_iocs: number[];
		event_in_summary: boolean;
		event_in_graph: boolean;
		event_sync_iocs_assets: boolean;
		event_color: string | null;
	};

	type FieldValue = string | number | boolean | number[] | null;

	type Props = {
		data: TimelineEventFormData;
		parentEvents: CaseTimelineEvent[];
		eventCategories: EventCategory[];
		onUpdateField: (field: keyof TimelineEventFormData, value: FieldValue) => void;
	};

	let { data, parentEvents, eventCategories, onUpdateField }: Props = $props();

	const parentEventOptions = $derived<SelectOption[]>(
		parentEvents.map((event) => ({
			value: String(event.event_id),
			label: `${event.event_id} - ${event.event_title}`
		}))
	);

	const eventCategoryOptions = $derived<SelectOption[]>(
		eventCategories.map((category) => ({
			value: String(category.id),
			label: category.name
		}))
	);

	const colorOptions = [
		'#1572E899',
		'#6861CE99',
		'#48ABF799',
		'#31CE3699',
		'#F2596199',
		'#FFAD4699'
	];

	const updateTextField = (field: keyof TimelineEventFormData, value: string) => {
		onUpdateField(field, value);
	};

	const updateCsvNumberField = (field: keyof TimelineEventFormData, value: string) => {
		onUpdateField(
			field,
			value
				.split(',')
				.map((id) => Number(id.trim()))
				.filter((id) => Number.isFinite(id))
		);
	};
</script>

<div class="space-y-8">
	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Event Title *</p>

						<Input
							value={data.event_title}
							oninput={(e) => updateTextField('event_title', (e.target as HTMLInputElement).value)}
							placeholder="Event title"
							class="mt-1"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Date *</p>

						<Input
							type="date"
							value={data.event_date}
							oninput={(e) => updateTextField('event_date', (e.target as HTMLInputElement).value)}
							class="mt-1"
						/>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="grid min-w-0 flex-1 grid-cols-[1fr_100px] gap-2">
						<div>
							<p class="text-sm font-medium text-muted-foreground">Time *</p>

							<Input
								value={data.event_time}
								oninput={(e) => updateTextField('event_time', (e.target as HTMLInputElement).value)}
								placeholder="00:00:00.000"
								class="mt-1"
							/>
						</div>

						<div>
							<p class="text-sm font-medium text-muted-foreground">TZ *</p>

							<Input
								value={data.event_tz}
								oninput={(e) => updateTextField('event_tz', (e.target as HTMLInputElement).value)}
								placeholder="+00:00"
								class="mt-1"
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Event Category</p>

						<div class="mt-1">
							<SearchSelect
								value={data.event_category_id ? String(data.event_category_id) : ''}
								options={eventCategoryOptions}
								placeholder="Select event category"
								searchPlaceholder="Search event category..."
								onChange={(value) =>
									onUpdateField('event_category_id', value ? Number(value) : null)}
							/>
						</div>
					</div>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-start gap-3">
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-muted-foreground">Parent Event</p>

						<div class="mt-1">
							<SearchSelect
								value={data.parent_event_id ? String(data.parent_event_id) : ''}
								options={parentEventOptions}
								placeholder="Select parent event"
								searchPlaceholder="Search event..."
								onChange={(value) => onUpdateField('parent_event_id', value ? Number(value) : null)}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<h2 class="text-lg font-semibold">Description</h2>
		</div>

		<div class="rounded-lg bg-card/40 p-4">
			<MarkDownEditor
				value={data.event_content}
				onChange={(value) => updateTextField('event_content', value)}
				onSave={() => {}}
			/>
		</div>
	</section>

	<section>
		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4">
				<p class="text-sm font-medium text-muted-foreground">Event Source</p>

				<Input
					value={data.event_source}
					oninput={(e) => updateTextField('event_source', (e.target as HTMLInputElement).value)}
					placeholder="Source"
					class="mt-1"
				/>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<p class="text-sm font-medium text-muted-foreground">Event Tags</p>

				<Input
					value={data.event_tags}
					oninput={(e) => updateTextField('event_tags', (e.target as HTMLInputElement).value)}
					placeholder="tag1,tag2"
					class="mt-1"
				/>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<p class="text-sm font-medium text-muted-foreground">Link to Assets</p>

				<Input
					value={data.event_assets.join(',')}
					oninput={(e) =>
						updateCsvNumberField('event_assets', (e.target as HTMLInputElement).value)}
					placeholder="Asset IDs separated by comma"
					class="mt-1"
				/>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<p class="text-sm font-medium text-muted-foreground">Link to IOCs</p>

				<Input
					value={data.event_iocs.join(',')}
					oninput={(e) => updateCsvNumberField('event_iocs', (e.target as HTMLInputElement).value)}
					placeholder="IOC IDs separated by comma"
					class="mt-1"
				/>
			</div>
		</div>
	</section>

	<section>
		<div class="mb-4 flex items-center gap-2 border-b pb-2">
			<h2 class="text-lg font-semibold">Options</h2>
		</div>

		<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex flex-wrap gap-5">
					<label class="flex items-center gap-2 text-sm">
						<Checkbox
							checked={data.event_sync_iocs_assets}
							onCheckedChange={(checked) =>
								onUpdateField('event_sync_iocs_assets', checked === true)}
						/>
						Push IOCs to assets
					</label>

					<label class="flex items-center gap-2 text-sm">
						<Checkbox
							checked={data.event_in_summary}
							onCheckedChange={(checked) => onUpdateField('event_in_summary', checked === true)}
						/>
						Add to summary
					</label>

					<label class="flex items-center gap-2 text-sm">
						<Checkbox
							checked={data.event_in_graph}
							onCheckedChange={(checked) => onUpdateField('event_in_graph', checked === true)}
						/>
						Display in graph
					</label>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<p class="mb-3 text-sm font-medium text-muted-foreground">Event Color</p>

				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class={[
							'h-6 w-6 rounded border bg-white',
							data.event_color === '#fff' ? 'ring-2 ring-primary ring-offset-2' : ''
						]}
						onclick={() => onUpdateField('event_color', '#fff')}
						aria-label="White"
					></button>

					{#each colorOptions as color}
						<button
							type="button"
							class={[
								'h-6 w-6 rounded border',
								data.event_color === color ? 'ring-2 ring-primary ring-offset-2' : ''
							]}
							style={`background-color: ${color};`}
							onclick={() => onUpdateField('event_color', color)}
							aria-label={color}
						></button>
					{/each}
				</div>
			</div>
		</div>
	</section>

	<section>
		<details class="rounded-lg bg-card/40 p-4">
			<summary class="cursor-pointer text-sm font-medium text-muted-foreground">
				Edit raw event data
			</summary>

			<textarea
				value={data.event_raw}
				oninput={(e) => updateTextField('event_raw', (e.target as HTMLTextAreaElement).value)}
				class="mt-3 min-h-32 w-full rounded-md border bg-background p-3 text-sm"
			></textarea>
		</details>
	</section>
</div>
