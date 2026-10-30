<!--
  "Timeline" part of the new relation dialog: the events already recording a
  link between the two nodes (ticked, cited by the new edge) and the option
  to record the relation as a new timeline event.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { CalendarClockIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import { CaseGraphService } from '$lib/services/case-graph.service';
	import {
		EventCategoriesService,
		type EventCategory
	} from '$lib/services/event-categories.service';
	import type { GraphEdgeTimelineEvent, GraphNodeKey } from '$lib/types/resources/case-graph';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import {
		defaultEventCategoryId,
		nowUtcInput,
		relationTimelineLinks,
		type RelationTimelineState
	} from '../lib/relation-timeline';

	interface Props {
		caseId: number;
		source: GraphNodeKey;
		target: GraphNodeKey;
		relationName: string;
		suggestedTitle: string;
		value: RelationTimelineState;
	}

	let {
		caseId,
		source,
		target,
		relationName,
		suggestedTitle,
		value = $bindable()
	}: Props = $props();

	let events = $state<GraphEdgeTimelineEvent[]>([]);
	let categories = $state<EventCategory[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let categoryTouched = $state(false);

	const linksNothing = $derived(!relationTimelineLinks(source) && !relationTimelineLinks(target));
	const linksOne = $derived(relationTimelineLinks(source) !== relationTimelineLinks(target));

	onMount(async () => {
		const [existing, cats] = await Promise.all([
			CaseGraphService.edgeTimelineEvents(caseId, source, target),
			EventCategoriesService.list()
		]);
		if (existing.ok && Array.isArray(existing.data)) {
			events = existing.data;
			value.attach = events.map((e) => e.event_id);
		} else {
			loadError = 'Could not check the timeline for existing events.';
		}
		categories = cats.ok && Array.isArray(cats.data) ? cats.data : [];
		value.categoryId = defaultEventCategoryId(categories, relationName);
		loading = false;
	});

	// Follows the relation until the user picks a category.
	$effect(() => {
		const name = relationName;
		if (!categoryTouched && categories.length)
			value.categoryId = defaultEventCategoryId(categories, name);
	});

	const toggle = (eventId: number, on: boolean) => {
		value.attach = on ? [...value.attach, eventId] : value.attach.filter((id) => id !== eventId);
	};

	const selectClass = 'h-9 w-full rounded-md border bg-background px-2 text-sm';
</script>

<fieldset class="space-y-2 rounded-md border p-2">
	<legend class="flex items-center gap-1 px-1 text-xs font-medium">
		<CalendarClockIcon class="h-3.5 w-3.5" />Timeline
	</legend>

	{#if loading}
		<p class="text-xs text-muted-foreground">Checking the timeline…</p>
	{:else}
		{#if loadError}
			<p class="text-xs text-destructive">{loadError}</p>
		{:else if events.length}
			<div class="space-y-1">
				<p class="text-xs text-muted-foreground">
					{events.length === 1
						? 'An event already records'
						: `${events.length} events already record`}
					this link. Ticked events are cited by the relation.
				</p>
				<ul class="max-h-32 space-y-0.5 overflow-y-auto">
					{#each events as ev (ev.event_id)}
						<li>
							<label class="flex items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent">
								<input
									type="checkbox"
									class="mt-0.5 h-3.5 w-3.5 accent-primary"
									checked={value.attach.includes(ev.event_id)}
									onchange={(e) => toggle(ev.event_id, e.currentTarget.checked)}
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate font-medium" title={ev.title}>{ev.title}</span>
									<span class="block truncate text-muted-foreground">
										{ev.date ? formatDateTime(ev.date) : 'No date'}{ev.category
											? ` · ${ev.category}`
											: ''}{ev.edge_keys.length ? ' · cited by a relation' : ''}{ev.in_graph
											? ''
											: ' · hidden from the graph'}
									</span>
								</span>
							</label>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">No timeline event records this link yet.</p>
		{/if}

		<label class="flex items-center gap-2 text-xs font-medium">
			<input
				type="checkbox"
				class="h-3.5 w-3.5 accent-primary"
				bind:checked={value.create}
				onchange={() => {
					if (value.create && !value.date) value.date = nowUtcInput();
				}}
			/>
			{events.length ? 'Also record it as a new timeline event' : 'Record it as a timeline event'}
		</label>

		{#if value.create}
			<div class="space-y-2 pl-5">
				<label class="block space-y-1 text-xs font-medium">
					<span>Title</span>
					<Input bind:value={value.title} placeholder={suggestedTitle} />
				</label>
				<div class="grid grid-cols-[1fr_5.5rem] gap-2">
					<label class="space-y-1 text-xs font-medium">
						<span>Date</span>
						<Input type="datetime-local" step="1" bind:value={value.date} required />
					</label>
					<label class="space-y-1 text-xs font-medium">
						<span>Timezone</span>
						<Input bind:value={value.tz} placeholder="+00:00" required />
					</label>
				</div>
				<label class="block space-y-1 text-xs font-medium">
					<span>Category</span>
					<select
						class={selectClass}
						value={value.categoryId ?? ''}
						onchange={(e) => {
							const id = Number(e.currentTarget.value);
							value.categoryId = Number.isInteger(id) && id > 0 ? id : null;
							categoryTouched = true;
						}}
					>
						{#if !categories.length}
							<option value="">No category available</option>
						{/if}
						{#each categories as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>
				{#if linksNothing}
					<p class="text-xs text-muted-foreground">
						Only assets and IOCs are linked to timeline events: the event will be cited by the
						relation but linked to neither node.
					</p>
				{:else if linksOne}
					<p class="text-xs text-muted-foreground">
						Only assets and IOCs are linked to timeline events: the event will be linked to one of
						the two nodes.
					</p>
				{/if}
			</div>
		{/if}
	{/if}
</fieldset>
