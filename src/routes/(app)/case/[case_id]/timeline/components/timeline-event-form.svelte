<script lang="ts">
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import type { CaseTimeline } from '$lib/services/case-timelines.service';
	import type { EventCategory } from '$lib/services/event-categories.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { PlusIcon, RotateCwIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Button } from '$lib/components/ui/button';
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
		timeline_ids: number[];
	};

	type FieldValue = string | number | boolean | number[] | null;

	type Props = {
		data: TimelineEventFormData;
		parentEvents: CaseTimelineEvent[];
		eventCategories: EventCategory[];
		assets: Asset[];
		iocs: Ioc[];
		// Optional so callers that don't expose timeline assignment
		// (asset/ioc detail tabs) can stay on the same form component
		// without rendering the timelines section.
		timelines?: CaseTimeline[];
		// Optional refresh / add affordances for the asset and IOC pickers.
		// When provided, a small ↻ and + button render next to the picker
		// header so the user can pull new entries or open the create
		// modal without leaving the event dialog. Callers that don't pass
		// them (asset/ioc detail tabs) just don't see the buttons.
		onRefreshAssets?: () => void | Promise<void>;
		onAddAsset?: () => void;
		onRefreshIocs?: () => void | Promise<void>;
		onAddIoc?: () => void;
		onUpdateField: (field: keyof TimelineEventFormData, value: FieldValue) => void;
	};

	let {
		data,
		parentEvents,
		eventCategories,
		assets,
		iocs,
		timelines = [],
		onRefreshAssets,
		onAddAsset,
		onRefreshIocs,
		onAddIoc,
		onUpdateField
	}: Props = $props();

	const timelineOptions = $derived<SelectOption[]>(
		timelines.map((t) => ({
			value: String(t.timeline_id),
			label: t.is_default ? `${t.name} (default)` : t.name
		}))
	);

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

	const assetOptions = $derived<SelectOption[]>(
		assets.map((asset) => ({
			value: String(asset.asset_id),
			label: asset.asset_name
		}))
	);

	const iocOptions = $derived<SelectOption[]>(
		iocs.map((ioc) => ({
			value: String(ioc.ioc_id),
			label: ioc.ioc_value
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
				<div class="flex items-center justify-between gap-2">
					<p class="text-sm font-medium text-muted-foreground">Link to Assets</p>
					{#if onRefreshAssets || onAddAsset}
						<div class="flex items-center gap-1">
							{#if onRefreshAssets}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6 text-muted-foreground hover:text-foreground"
									onclick={() => onRefreshAssets?.()}
									title="Refresh assets list"
									aria-label="Refresh assets list"
								>
									<RotateCwIcon class="h-3.5 w-3.5" />
								</Button>
							{/if}
							{#if onAddAsset}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6 text-muted-foreground hover:text-foreground"
									onclick={() => onAddAsset?.()}
									title="Add a new asset"
									aria-label="Add a new asset"
								>
									<PlusIcon class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</div>
					{/if}
				</div>

				<div class="mt-1">
					<SearchSelect
						multiple
						value={data.event_assets.map(String)}
						options={assetOptions}
						placeholder="Select assets"
						searchPlaceholder="Search assets..."
						onChange={(value) => onUpdateField('event_assets', (value as string[]).map(Number))}
					/>
				</div>
			</div>

			<div class="rounded-lg bg-card/40 p-4">
				<div class="flex items-center justify-between gap-2">
					<p class="text-sm font-medium text-muted-foreground">Link to IOCs</p>
					{#if onRefreshIocs || onAddIoc}
						<div class="flex items-center gap-1">
							{#if onRefreshIocs}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6 text-muted-foreground hover:text-foreground"
									onclick={() => onRefreshIocs?.()}
									title="Refresh IOCs list"
									aria-label="Refresh IOCs list"
								>
									<RotateCwIcon class="h-3.5 w-3.5" />
								</Button>
							{/if}
							{#if onAddIoc}
								<Button
									variant="ghost"
									size="icon"
									class="h-6 w-6 text-muted-foreground hover:text-foreground"
									onclick={() => onAddIoc?.()}
									title="Add a new IOC"
									aria-label="Add a new IOC"
								>
									<PlusIcon class="h-3.5 w-3.5" />
								</Button>
							{/if}
						</div>
					{/if}
				</div>

				<div class="mt-1">
					<SearchSelect
						multiple
						value={data.event_iocs.map(String)}
						options={iocOptions}
						placeholder="Select IOCs"
						searchPlaceholder="Search IOCs..."
						onChange={(value) => onUpdateField('event_iocs', (value as string[]).map(Number))}
					/>
				</div>
			</div>

			{#if timelines.length > 0}
				<div class="rounded-lg bg-card/40 p-4 md:col-span-2">
					<p class="text-sm font-medium text-muted-foreground">Timelines</p>
					<p class="mt-0.5 text-2xs text-muted-foreground">
						An event can appear on multiple timelines. Leaving this empty makes the event
						visible only in the "All" view.
					</p>

					<div class="mt-1">
						<SearchSelect
							multiple
							value={data.timeline_ids.map(String)}
							options={timelineOptions}
							placeholder="Select timelines"
							searchPlaceholder="Search timelines..."
							onChange={(value) => onUpdateField('timeline_ids', (value as string[]).map(Number))}
						/>
					</div>
				</div>
			{/if}
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
