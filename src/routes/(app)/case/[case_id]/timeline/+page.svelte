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
	let selected = $state<Set<number>>(new Set());
	let selecting = $state<boolean>(false);
	let eventDialogOpen = $state<boolean>(false);
	let eventCommentsDialogOpen = $state<boolean>(false);
	let showConfirmDelete = $state<boolean>(false);
	let selectedEvent = $state<CaseTimelineEvent | undefined>(undefined);
	let selectedParent = $state<CaseTimelineEvent | undefined>(undefined);
	let eventCategories = $state<EventCategory[]>([]);
	let commentCounts = $state<Record<number, number>>({});
	let timelineScrollContainer = $state<HTMLDivElement | undefined>(undefined);

	const scrollTop = () => {
		timelineScrollContainer?.scrollTo({
			top: 0,
			behavior: 'smooth'
		});
	};

	const scrollBottom = () => {
		if (!timelineScrollContainer) return;
		timelineScrollContainer.scrollTo({
			top: timelineScrollContainer.scrollHeight,
			behavior: 'smooth'
		});
	};

	const filteredEvents = $derived(
		timeline
			.events()
			.filter((event) => event.event_title.toLowerCase().includes(filter.toLowerCase()))
	);

	const parentEventCandidates = $derived(
		timeline.events().filter((event) => event.event_id !== selectedEvent?.event_id)
	);

	const defaultEventCategoryId = $derived(
		eventCategories.find((category) => category.name === 'Unspecified')?.id ??
			eventCategories[0]?.id ??
			1
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

	const toggleSelecting = () => {
		selecting = !selecting;

		if (!selecting) selected = new Set();
	};

	const toggleSelect = (eventId: number) => {
		const next = new Set(selected);

		if (next.has(eventId)) {
			next.delete(eventId);
		} else {
			next.add(eventId);
		}

		selected = next;
	};

	const toggleFold = (eventId: number) => {
		const next = new Set(folded);

		if (next.has(eventId)) {
			next.delete(eventId);
		} else {
			next.add(eventId);
		}

		folded = next;
	};

	const toggleFoldAll = () => {
		if (folded.size > 0) {
			folded = new Set();
		} else {
			folded = new Set(timeline.events().map((event) => event.event_id));
		}
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

	const commitDeleteEvents = async () => {
		if (selected.size === 0 && !selectedEvent) return;

		const eventIds =
			selected.size > 0 ? [...selected] : selectedEvent ? [selectedEvent.event_id] : [];

		for (const eventId of eventIds) {
			await timeline.removeEvent(eventId, { fetch });
		}

		selected = new Set();
		selecting = false;
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

	const csvEscape = (value: string | number | boolean | null | undefined) => {
		const text = value === null || value === undefined ? '' : String(value);

		return `"${text.replaceAll('"', '""')}"`;
	};

	const csvDescription = (value: string | null | undefined) =>
		(value ?? '').replaceAll('\n', ' - ');

	const downloadTimelineCsv = (withUserInfo = false) => {
		const headers = [
			'event_date(UTC)',
			'event_title',
			'event_description',
			'event_tz',
			'event_date_wtz',
			'event_category',
			'event_tags',
			'linked_assets',
			'linked_iocs',
			...(withUserInfo ? ['created_by', 'creation_date'] : [])
		];

		const rows = timeline.events();

		const csv = [
			headers.join(','),
			...rows.map((event) =>
				[
					event.event_date,
					event.event_title,
					csvDescription(event.event_content),
					event.event_tz,
					event.event_date_wtz,
					event.category_name,
					event.event_tags,
					event.assets?.map((asset) => asset.name).join(';') ?? '',
					event.iocs?.map((ioc) => ioc.name).join('|') ?? '',
					...(withUserInfo ? [event.user, event.event_added] : [])
				]
					.map(csvEscape)
					.join(',')
			)
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = `case-${page.params.case_id}-timeline${withUserInfo ? '-with-user-info' : ''}.csv`;
		link.click();

		URL.revokeObjectURL(url);
	};

	const parseCsvLine = (line: string) => {
		const matches = [...line.matchAll(/"((?:[^"]|"")*)"|([^,]+)/g)];

		return matches.map((match) => (match[1] ?? match[2] ?? '').replaceAll('""', '"').trim());
	};

	const uploadTimelineCsv = async () => {
		const input = document.createElement('input');

		input.type = 'file';
		input.accept = '.csv,text/csv';

		input.onchange = async () => {
			const file = input.files?.[0];

			if (!file) return;

			const text = await file.text();

			const lines = text
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean);

			if (lines.length <= 1) return;

			const headers = parseCsvLine(lines[0] ?? '');

			const getIndex = (name: string) => headers.indexOf(name);

			const rows = lines.slice(1);

			for (const row of rows) {
				const values = parseCsvLine(row);

				const payload: CreateCaseTimelineEventBody = {
					event_title: values[getIndex('event_title')] ?? '',
					event_date: values[getIndex('event_date(UTC)')] ?? '',
					event_tz: values[getIndex('event_tz')] ?? '+00:00',
					event_content: (values[getIndex('event_description')] ?? '').replaceAll(' - ', '\n'),
					event_tags: values[getIndex('event_tags')] ?? '',
					event_source: '',
					event_raw: '',
					event_assets: [],
					event_iocs: [],
					event_in_summary: false,
					event_in_graph: true,
					event_sync_iocs_assets: false,
					parent_event_id: null,
					event_category_id: defaultEventCategoryId
				};

				await timeline.createEvent(payload, { fetch });
			}

			await timeline.refresh({}, { fetch });
		};

		input.click();
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
		onDownloadCsv={() => downloadTimelineCsv(false)}
		onDownloadCsvWithUserInfo={() => downloadTimelineCsv(true)}
		onUploadCsv={uploadTimelineCsv}
	/>

	<div
		bind:this={timelineScrollContainer}
		class="relative min-h-0 flex-1 overflow-auto py-6 pl-6 pr-20"
	>
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
				{selected}
				{selecting}
				onToggleSelect={toggleSelect}
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
				{selected}
				{selecting}
				onToggleSelect={toggleSelect}
				onToggleFold={toggleFold}
				onEdit={editEvent}
				onAddChild={addChildEvent}
				onFlag={flagEvent}
				onComments={showComments}
				onDuplicate={duplicateEvent}
				onDelete={deleteEvent}
			/>
		{/if}

		<TimelineSideToolbar
			{selecting}
			onToggleSelecting={toggleSelecting}
			onDelete={() => (showConfirmDelete = true)}
			onAddEvent={addEvent}
			onToggleFoldAll={toggleFoldAll}
			onRefresh={() => timeline.refresh({}, { fetch })}
			onScrollTop={scrollTop}
			onScrollBottom={scrollBottom}
		/>
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
	message={`You are about to delete this timeline ${selected.size > 1 ? 'events' : 'event'} forever. This cannot be reverted. All associated data will be deleted.`}
	onConfirm={commitDeleteEvents}
	onCancel={() => (showConfirmDelete = false)}
/>
