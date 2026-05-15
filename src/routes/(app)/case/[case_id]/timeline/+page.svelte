<script lang="ts">
	import { setContext } from 'svelte';
	import { page } from '$app/state';
	import type {
		CaseTimelineEvent,
		CreateCaseTimelineEventBody,
		UpdateCaseTimelineEventBody
	} from '$lib/services/case-timeline.service';
	import {
		EventCategoriesService,
		type EventCategory
	} from '$lib/services/event-categories.service';
	import { CommentsService } from '$lib/services/comments.service';
	import {
		CASE_TIMELINE_CTX,
		createCaseTimelineContext,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import TimelineTopbar from './components/timeline-topbar.svelte';
	import TimelineSideToolbar from './components/timeline-side-toolbar.svelte';
	import TimelineNormalView from './components/timeline-normal-view.svelte';
	import TimelineTreeView from './components/timeline-tree-view.svelte';
	import TimelineEventDialog from './components/timeline-event-dialog.svelte';
	import TimelineEventCommentsDialog from './components/timeline-event-comments-dialog.svelte';

	type TimelineView = 'normal' | 'tree';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	type EventWithChildren = CaseTimelineEvent & {
		children?: EventWithChildren[];
	};

	const timeline = createCaseTimelineContext(() => Number(page.params.case_id));

	setContext<CaseTimelineContext>(CASE_TIMELINE_CTX, timeline);

	let filter = $state<string>('');
	let view = $state<TimelineView>('normal');
	let compact = $state<boolean>(false);
	let folded = $state<Set<number>>(new Set());
	let eventDialogOpen = $state(false);
	let eventCommentsDialogOpen = $state(false);
	let showConfirmDelete = $state(false);
	let selectedEvent = $state<CaseTimelineEvent | undefined>(undefined);
	let selectedParent = $state<CaseTimelineEvent | undefined>(undefined);
	let eventCategories = $state<EventCategory[]>([]);
	let commentCounts = $state<Record<number, number>>({});

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

	const loadCommentCount = async (eventId: number) => {
		const res = await CommentsService.list('events', eventId);

		const data = res.data;
		const comments = data && typeof data === 'object' && Array.isArray(data.data) ? data.data : [];

		commentCounts[eventId] = comments.length;
	};

	const addEvent = () => {
		selectedEvent = undefined;
		selectedParent = undefined;
		eventDialogOpen = true;
	};

	const addChildEvent = async (eventId: number) => {
		const event = await timeline.getEvent(eventId);

		if (!event) return;

		selectedParent = event;
		selectedEvent = undefined;
		eventDialogOpen = true;
	};

	const editEvent = async (eventId: number) => {
		const event = await timeline.getEvent(eventId);

		if (!event) return;

		selectedEvent = event;
		selectedParent = undefined;
		eventDialogOpen = true;
	};

	const commitDeleteEvent = async () => {
		if (!selectedEvent) return;

		await timeline.removeEvent(selectedEvent.event_id, { fetch });

		selectedEvent = undefined;
		showConfirmDelete = false;
	};

	const deleteEvent = async (eventId: number) => {
		const event = await timeline.getEvent(eventId);

		if (!event) return;

		selectedEvent = event;
		showConfirmDelete = true;
	};

	const flagEvent = async (eventId: number) => {
		const event = await timeline.getEvent(eventId);

		if (!event) return;

		const payload: UpdateCaseTimelineEventBody = {
			event_title: event.event_title,
			event_category_id: event.event_category_id ?? 1,
			event_date: event.event_date,
			event_tz: event.event_tz,
			event_assets: event.event_assets ?? [],
			event_iocs: event.event_iocs ?? [],
			event_raw: event.event_raw ?? '',
			event_source: event.event_source ?? '',
			event_in_summary: event.event_in_summary ?? false,
			event_in_graph: event.event_in_graph ?? true,
			event_color: event.event_color ?? undefined,
			event_sync_iocs_assets: false,
			event_tags: event.event_tags ?? '',
			event_content: event.event_content ?? '',
			parent_event_id: event.parent_event_id ?? null,
			event_is_flagged: !event.event_is_flagged
		};

		await timeline.patchEvent(event.event_id, payload, { fetch });
	};

	const toCreatePayload = (
		event: EventWithChildren,
		parentEventId: number | null
	): CreateCaseTimelineEventBody => ({
		event_title: `DUPLICATED - ${event.event_title}`,
		event_category_id: event.event_category_id ?? 1,
		event_date: event.event_date,
		event_tz: event.event_tz,
		event_assets: event.event_assets ?? [],
		event_iocs: event.event_iocs ?? [],
		event_raw: event.event_raw ?? '',
		event_source: event.event_source ?? '',
		event_in_summary: event.event_in_summary ?? false,
		event_in_graph: event.event_in_graph ?? true,
		event_color: event.event_color ?? undefined,
		event_sync_iocs_assets: false,
		event_tags: event.event_tags ?? '',
		event_content: event.event_content ?? '',
		parent_event_id: parentEventId
	});

	const duplicateBranch = async (event: EventWithChildren, parentEventId: number | null) => {
		const created = await timeline.createEvent(toCreatePayload(event, parentEventId), { fetch });

		if (!created) return;

		for (const child of event.children ?? []) {
			await duplicateBranch(child, created.event_id);
		}
	};

	const duplicateEvent = async (eventId: number) => {
		const event = (await timeline.getEvent(eventId)) as EventWithChildren | null;

		if (!event) return;

		await duplicateBranch(event, event.parent_event_id ?? null);
		await timeline.refresh({}, { fetch });
	};

	const showComments = async (eventId: number) => {
		const event = await timeline.getEvent(eventId);

		if (!event) return;

		selectedEvent = event;
		eventCommentsDialogOpen = true;
	};

	const closeComments = async () => {
		const eventId = selectedEvent?.event_id;

		eventCommentsDialogOpen = false;
		selectedEvent = undefined;

		if (eventId) await loadCommentCount(eventId);
	};

	const loadEventCategories = async () => {
		const res = await EventCategoriesService.list({ fetch });

		if (res.ok && Array.isArray(res.data)) {
			eventCategories = res.data;
		}
	};

	$effect(() => {
		timeline.loadEvents({}, { fetch });
		loadEventCategories();
	});

	$effect(() => {
		for (const event of filteredEvents) {
			loadCommentCount(event.event_id);
		}
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col bg-slate-50 dark:bg-black">
	<TimelineTopbar
		bind:filter
		{compact}
		{view}
		onRefresh={() => timeline.refresh({}, { fetch })}
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
				{commentCounts}
				{compact}
				{folded}
				onToggleFold={toggleFold}
				onEdit={editEvent}
				onAddChild={addChildEvent}
				onFlag={flagEvent}
				onComments={showComments}
				onDuplicate={duplicateEvent}
				onDelete={deleteEvent}
			/>
		{:else}
			<TimelineTreeView
				groups={groupedRootEvents}
				{childrenByParent}
				{commentCounts}
				{compact}
				{folded}
				onToggleFold={toggleFold}
				onEdit={editEvent}
				onAddChild={addChildEvent}
				onFlag={flagEvent}
				onComments={showComments}
				onDuplicate={duplicateEvent}
				onDelete={deleteEvent}
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
	{selectedParent}
	onOpenChange={(open) => (eventDialogOpen = open)}
/>

<TimelineEventCommentsDialog
	bind:open={eventCommentsDialogOpen}
	event={selectedEvent}
	onClose={closeComments}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this timeline event forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={commitDeleteEvent}
	onCancel={() => (showConfirmDelete = false)}
/>
