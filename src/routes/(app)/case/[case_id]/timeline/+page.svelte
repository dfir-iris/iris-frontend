<script lang="ts">
	import { setContext } from 'svelte';
	import { page } from '$app/state';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import {
		EventCategoriesService,
		type EventCategory
	} from '$lib/services/event-categories.service';
	import {
		CASE_TIMELINE_CTX,
		createCaseTimelineContext,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import TimelineTopbar from './components/timeline-topbar.svelte';
	import TimelineSideToolbar from './components/timeline-side-toolbar.svelte';
	import TimelineNormalView from './components/timeline-normal-view.svelte';
	import TimelineTreeView from './components/timeline-tree-view.svelte';
	import TimelineEventDialog from './components/timeline-event-dialog.svelte';
	import type { RequestResponse } from '$lib/services/api.service';

	type TimelineView = 'normal' | 'tree';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	const timeline = createCaseTimelineContext(() => Number(page.params.case_id));

	setContext<CaseTimelineContext>(CASE_TIMELINE_CTX, timeline);

	let filter = $state<string>('');
	let view = $state<TimelineView>('normal');
	let compact = $state<boolean>(false);
	let folded = $state<Set<number>>(new Set());
	let eventDialogOpen = $state(false);
	let selectedEvent = $state<CaseTimelineEvent | undefined>(undefined);
	let eventCategories = $state<EventCategory[]>([]);

	const filteredEvents = $derived(
		timeline
			.events()
			.filter((event) => event.event_title.toLowerCase().includes(filter.toLowerCase()))
	);

	const parentEventCandidates = $derived(
		timeline.events().filter((event) => event.event_id !== selectedEvent?.event_id)
	);

	const rootEvents = $derived(filteredEvents.filter((event) => !event.parent_event_id));

	const childrenByParent = $derived.by(() => {
		const map = new Map<number, CaseTimelineEvent[]>();

		for (const event of filteredEvents) {
			if (!event.parent_event_id) continue;

			const children = map.get(event.parent_event_id) ?? [];
			children.push(event);
			map.set(event.parent_event_id, children);
		}

		return map;
	});

	const groupedRootEvents = $derived.by(() => {
		const groups = new Map<string, CaseTimelineEvent[]>();

		for (const event of rootEvents) {
			const date = new Date(event.event_date).toLocaleDateString();

			groups.set(date, [...(groups.get(date) ?? []), event]);
		}

		return [...groups.entries()].map(([date, events]) => ({
			date,
			events
		})) satisfies TimelineGroup[];
	});

	const toggleView = () => (view = view === 'normal' ? 'tree' : 'normal');

	const toggleFold = (eventId: number) => {
		const next = new Set(folded);

		if (next.has(eventId)) {
			next.delete(eventId);
		} else {
			next.add(eventId);
		}

		folded = next;
	};

	const addEvent = () => {
		selectedEvent = undefined;
		eventDialogOpen = true;
	};

	const editEvent = async (eventId: number) => {
		selectedEvent = (await timeline.getEvent(eventId)) as CaseTimelineEvent;
		eventDialogOpen = true;
	};

	const loadEventCategories = async () => {
		const res = (await EventCategoriesService.list({ fetch }))
			.data as unknown as RequestResponse<EventCategoriesService>;

		eventCategories = res.data as EventCategory[];
	};

	$effect(() => {
		timeline.loadEvents();

		loadEventCategories();
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col bg-slate-50 dark:bg-black">
	<TimelineTopbar
		bind:filter
		{compact}
		{view}
		onRefresh={timeline.refresh}
		onAddEvent={addEvent}
		onToggleView={toggleView}
		onToggleCompact={() => (compact = !compact)}
	/>

	<div class="relative min-h-0 flex-1 overflow-auto py-6 pl-6 pr-20">
		{#if timeline.list.status === 'loading'}
			<div class="p-6 text-sm text-muted-foreground">Loading timeline...</div>
		{:else if timeline.list.error}
			<div class="p-6 text-sm text-destructive">{timeline.list.error}</div>
		{:else if groupedRootEvents.length === 0}
			<div class="p-6 text-sm text-muted-foreground">No timeline events found.</div>
		{:else if view === 'normal'}
			<TimelineNormalView
				groups={groupedRootEvents}
				{childrenByParent}
				{compact}
				{folded}
				onToggleFold={toggleFold}
				onEdit={(eventId: number) => editEvent(eventId)}
			/>
		{:else}
			<TimelineTreeView
				groups={groupedRootEvents}
				{childrenByParent}
				{compact}
				{folded}
				onToggleFold={toggleFold}
				onEdit={(eventId: number) => editEvent(eventId)}
			/>
		{/if}

		<TimelineSideToolbar />
	</div>
</div>

<TimelineEventDialog
	bind:open={eventDialogOpen}
	event={selectedEvent}
	{eventCategories}
	parentEvents={parentEventCandidates}
	onOpenChange={(open) => (eventDialogOpen = open)}
/>
