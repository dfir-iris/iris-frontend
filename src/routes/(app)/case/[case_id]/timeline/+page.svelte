<script lang="ts">
	import { setContext, getContext } from 'svelte';
	import { page } from '$app/state';
	import type {
		CaseTimelineEvent,
		CaseTimelineFilterQuery,
		CreateCaseTimelineEventBody,
		UpdateCaseTimelineEventBody
	} from '$lib/services/case-timeline.service';
	import {
		EventCategoriesService,
		type EventCategory
	} from '$lib/services/event-categories.service';
	import { CaseTimelinesService, type CaseTimeline } from '$lib/services/case-timelines.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { CommentsService } from '$lib/services/comments.service';
	import {
		CASE_TIMELINE_CTX,
		createCaseTimelineContext,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import {
		CASE_ACCESS_CTX,
		type CaseAccessContext
	} from '$lib/contexts/case-access.context.svelte';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import ChipHoverHost from '$lib/components/common/MarkDown/ChipHoverHost.svelte';
	import TimelineTopbar from './components/timeline-topbar.svelte';
	import TimelineSideToolbar from './components/timeline-side-toolbar.svelte';
	import TimelineSidebar from './components/timeline-sidebar.svelte';
	import TimelineView from './components/timeline-view.svelte';
	import TimelineEventDialog from './components/timeline-event-dialog.svelte';
	import { toast } from '$lib/stores/toast.store';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';
	import type { TimelineFilterData, TimelineFilterFieldValue } from './types';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	type EventWithChildren = CaseTimelineEvent & {
		children?: EventWithChildren[];
	};

	const emptyFilters = (): TimelineFilterData => ({
		title: '',
		description: '',
		source: '',
		tag: '',
		asset: '',
		ioc: '',
		category: '',
		startDate: '',
		endDate: '',
		flag: ''
	});

	const timeline = createCaseTimelineContext(() => Number(page.params.case_id));

	setContext<CaseTimelineContext>(CASE_TIMELINE_CTX, timeline);

	const commentsPanel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);
	const caseAccess = getContext<CaseAccessContext | undefined>(CASE_ACCESS_CTX);
	const caseAssetsCtx = getContext<CaseAssetsContext | undefined>(CASE_ASSETS_CTX);
	const caseIocsCtx = getContext<CaseIocsContext | undefined>(CASE_IOCS_CTX);
	const canEdit = $derived(caseAccess?.canEdit() ?? false);

	let filters = $state<TimelineFilterData>(emptyFilters());
	let viewMode = $state<'list' | 'tree'>('tree');
	let quickSearch = $state<string>('');
	let quickSearchMatchIndex = $state<number>(0);
	let folded = $state<Set<number>>(new Set());
	let selected = $state<Set<number>>(new Set());
	let selecting = $state<boolean>(false);
	let eventDialogOpen = $state<boolean>(false);
	let showConfirmDelete = $state<boolean>(false);
	let selectedEvent = $state<CaseTimelineEvent | undefined>(undefined);
	let selectedParent = $state<CaseTimelineEvent | undefined>(undefined);
	let eventCategories = $state<EventCategory[]>([]);
	let caseAssets = $state<Asset[]>([]);
	let caseIocs = $state<Ioc[]>([]);
	let timelines = $state<CaseTimeline[]>([]);
	let timelinesLoading = $state<boolean>(true);
	// Empty set = "show all" (no timeline filter applied). A non-empty
	// set restricts the timeline view to events linked to ANY of the
	// selected timelines.
	let selectedTimelineIds = $state<Set<number>>(new Set());
	let commentCounts = $state<Record<number, number>>({});
	let timelineScrollContainer = $state<HTMLDivElement | undefined>(undefined);

	// Infinite-scroll prefetch trigger. Same pattern as the assets sidebar:
	// the trigger sits one viewport ahead of the bottom edge so a new page
	// loads while the user is still scrolling, never showing a stop-and-resume.
	let loadMoreTrigger = $state<HTMLDivElement | null>(null);
	let observer: IntersectionObserver | null = null;

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

	// Apply the sidebar's timeline-id multi-select on top of the
	// server-side filtered list. Empty selection = no extra filter.
	// We do this client-side because the server's events endpoint
	// already paginates the case events and the timeline membership
	// is stamped onto each row — no need for a second round-trip.
	const filteredEvents = $derived.by(() => {
		const events = timeline.events();
		if (selectedTimelineIds.size === 0) return events;
		const selected = selectedTimelineIds;
		return events.filter((e) => (e.timeline_ids ?? []).some((id) => selected.has(id)));
	});

	// Quick-search: searches across the most useful free-text fields and
	// resolves to a chronologically-ordered list of event IDs. The bar in
	// the topbar uses this to step the user from match to match without
	// touching the heavier server-side filter form.
	const quickSearchMatches = $derived.by<number[]>(() => {
		const q = quickSearch.trim().toLowerCase();
		if (!q) return [];

		const matches: number[] = [];
		for (const event of filteredEvents) {
			const hay = [
				event.event_title,
				event.event_content,
				event.event_source,
				event.event_tags,
				event.category_name,
				event.event_raw,
				...(event.assets ?? []).map((a) => `${a.asset_name ?? ''} ${a.name ?? ''} ${a.ip ?? ''}`),
				...(event.iocs ?? []).map((i) => `${i.ioc_value ?? ''} ${i.name ?? ''}`)
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();

			if (hay.includes(q)) matches.push(event.event_id);
		}
		return matches;
	});

	// Whenever the match set changes (new query or new events loaded), clamp
	// the cursor and scroll the new "current" match into view. Skip if the
	// user cleared the search.
	$effect(() => {
		const count = quickSearchMatches.length;
		if (count === 0) {
			quickSearchMatchIndex = 0;
			return;
		}
		if (quickSearchMatchIndex >= count) quickSearchMatchIndex = 0;
		scrollMatchIntoView(quickSearchMatches[quickSearchMatchIndex]);
	});

	const scrollMatchIntoView = (eventId: number) => {
		// Wait a tick so a freshly-changed match has its highlight class on
		// the DOM by the time we look for it.
		requestAnimationFrame(() => {
			const el = document.querySelector(`[data-event-id="${eventId}"]`);
			if (!el) return;
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	};

	const quickSearchNext = () => {
		if (quickSearchMatches.length === 0) return;
		quickSearchMatchIndex = (quickSearchMatchIndex + 1) % quickSearchMatches.length;
	};

	const quickSearchPrev = () => {
		if (quickSearchMatches.length === 0) return;
		quickSearchMatchIndex =
			(quickSearchMatchIndex - 1 + quickSearchMatches.length) % quickSearchMatches.length;
	};

	const onQuickSearchChange = (value: string) => {
		quickSearch = value;
		quickSearchMatchIndex = 0;
		// Quick-search runs against in-memory events. Trigger a one-shot
		// pull of all remaining pages on first use so the search covers the
		// entire timeline, not just what has been scrolled past. loadAll is
		// idempotent and bails out if the data is already complete.
		if (value.trim() && !timeline.list.allLoaded) {
			void timeline.loadAll({ fetch });
		}
	};

	const parentEventCandidates = $derived(
		timeline.events().filter((event) => event.event_id !== selectedEvent?.event_id)
	);

	const defaultEventCategoryId = $derived(
		eventCategories.find((category) => category.name === 'Unspecified')?.id ??
			eventCategories[0]?.id ??
			1
	);

	const rootEvents = $derived.by(() => {
		const ids = new Set(filteredEvents.map((event) => event.event_id));

		return filteredEvents.filter(
			(event) => !event.parent_event_id || !ids.has(event.parent_event_id)
		);
	});

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

	const toQuery = (): CaseTimelineFilterQuery => {
		const query: CaseTimelineFilterQuery = {};

		if (filters.title.trim()) query.title = [filters.title.trim()];
		if (filters.description.trim()) query.description = [filters.description.trim()];
		if (filters.source.trim()) query.source = [filters.source.trim()];
		if (filters.tag.trim()) query.tag = [filters.tag.trim()];
		if (filters.asset.trim()) query.asset = [filters.asset.trim()];
		if (filters.ioc.trim()) query.ioc = [filters.ioc.trim()];
		if (filters.category.trim()) query.category = [filters.category.trim()];
		if (filters.startDate) query.start_date = filters.startDate;
		if (filters.endDate) query.end_date = filters.endDate;
		if (filters.flag) query.flag = filters.flag.toLowerCase() === 'true';

		return query;
	};

	const updateFilter = (field: keyof TimelineFilterData, value: TimelineFilterFieldValue) => {
		filters[field] = value;
	};

	const applyFilters = async () => {
		await timeline.loadEvents(toQuery(), { fetch });
	};

	const clearFilters = async () => {
		filters = emptyFilters();
		await timeline.loadEvents({}, { fetch });
	};

	const refreshTimeline = async () => {
		await timeline.refresh(toQuery(), { fetch });
	};

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
		if (!canEdit) return;
		selectedEvent = undefined;
		selectedParent = undefined;
		eventDialogOpen = true;
	};

	// Topbar's CaseQuickAddButton sends this event so the global Add Event
	// affordance can open this page's dialog without us threading another
	// context through every route.
	$effect(() => {
		if (typeof window === 'undefined') return;
		const handler = () => addEvent();
		window.addEventListener('case-timeline:add-event', handler);
		return () => window.removeEventListener('case-timeline:add-event', handler);
	});

	const addChildEvent = async (eventId: number) => {
		if (!canEdit) return;
		const event = await timeline.getEvent(eventId);

		if (!event) return;

		selectedParent = event;
		selectedEvent = undefined;
		eventDialogOpen = true;
	};

	const editEvent = async (eventId: number) => {
		if (!canEdit) return;
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
		await refreshTimeline();
	};

	const showComments = async (eventId: number) => {
		const event = await timeline.getEvent(eventId);
		if (!event) return;

		commentsPanel.open({
			type: 'events',
			id: event.event_id,
			label: event.event_title || `Event #${event.event_id}`
		});

		// Keep the inline comment-count badge fresh once the panel comes
		// back — listening for panel close isn't ideal, so we just refresh
		// the count opportunistically on subsequent loads.
		void loadCommentCount(eventId);
	};

	const loadEventCategories = async () => {
		const res = await EventCategoriesService.list({ fetch });

		if (res.ok && Array.isArray(res.data)) {
			eventCategories = res.data;
		}
	};

	const loadCaseAssets = async () => {
		const caseId = Number(page.params.case_id);
		const res = await CaseAssetsService.list(caseId, { per_page: 500 }, { fetch });

		if (res.ok && res.data && typeof res.data !== 'string') {
			caseAssets = res.data.data;
		}
	};

	const loadCaseIocs = async () => {
		const caseId = Number(page.params.case_id);
		const res = await CaseIocsService.list(caseId, { per_page: 500 }, { fetch });

		if (res.ok && res.data && typeof res.data !== 'string') {
			caseIocs = res.data.data;
		}
	};

	// "Add asset" / "Add IOC" affordances next to the Link-to pickers in
	// the event dialog. We open the case-level add modals (mounted in
	// `+layout.svelte`) by flipping their shared UI state, then watch
	// `showAddModal` flipping back to false to refetch the local
	// asset/IOC lists so newly-created entries are immediately pickable
	// without leaving the event dialog.
	let assetsAddOpenWatcher = false;
	let iocsAddOpenWatcher = false;
	$effect(() => {
		if (!caseAssetsCtx) return;
		const open = caseAssetsCtx.ui.showAddModal;
		if (open) {
			assetsAddOpenWatcher = true;
		} else if (assetsAddOpenWatcher) {
			assetsAddOpenWatcher = false;
			void loadCaseAssets();
		}
	});
	$effect(() => {
		if (!caseIocsCtx) return;
		const open = caseIocsCtx.ui.showAddModal;
		if (open) {
			iocsAddOpenWatcher = true;
		} else if (iocsAddOpenWatcher) {
			iocsAddOpenWatcher = false;
			void loadCaseIocs();
		}
	});

	const openAddAsset = () => {
		if (caseAssetsCtx) caseAssetsCtx.ui.showAddModal = true;
	};
	const openAddIoc = () => {
		if (caseIocsCtx) caseIocsCtx.ui.showAddModal = true;
	};

	const loadCaseTimelines = async () => {
		timelinesLoading = true;
		try {
			const caseId = Number(page.params.case_id);
			const res = await CaseTimelinesService.list(caseId, { fetch });
			if (res.ok && Array.isArray(res.data)) {
				timelines = res.data;
			} else {
				timelines = [];
			}
		} finally {
			timelinesLoading = false;
		}
	};

	const toggleTimelineSelected = (timelineId: number) => {
		const next = new Set(selectedTimelineIds);
		if (next.has(timelineId)) next.delete(timelineId);
		else next.add(timelineId);
		selectedTimelineIds = next;
	};

	const selectAllTimelines = () => {
		selectedTimelineIds = new Set();
	};

	const createTimeline = async (body: { name: string; color: string | null }) => {
		const caseId = Number(page.params.case_id);
		const res = await CaseTimelinesService.create(caseId, body, { fetch });
		if (res.ok && res.data && typeof res.data !== 'string') {
			timelines = [...timelines, res.data];
		} else {
			toast({
				title: 'Could not create timeline',
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
		}
	};

	const updateTimeline = async (
		timelineId: number,
		body: { name?: string; color?: string | null }
	) => {
		const caseId = Number(page.params.case_id);
		const res = await CaseTimelinesService.update(caseId, timelineId, body, { fetch });
		if (res.ok && res.data && typeof res.data !== 'string') {
			timelines = timelines.map((t) =>
				t.timeline_id === timelineId ? (res.data as CaseTimeline) : t
			);
		} else {
			toast({
				title: 'Could not update timeline',
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
		}
	};

	const removeTimeline = async (timelineId: number) => {
		const caseId = Number(page.params.case_id);
		const res = await CaseTimelinesService.remove(caseId, timelineId, { fetch });
		if (res.ok) {
			timelines = timelines.filter((t) => t.timeline_id !== timelineId);
			if (selectedTimelineIds.has(timelineId)) {
				const next = new Set(selectedTimelineIds);
				next.delete(timelineId);
				selectedTimelineIds = next;
			}
		} else {
			toast({
				title: 'Could not delete timeline',
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
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
					event.assets?.map((asset) => String(asset.name ?? '')).join(';') ?? '',
					event.iocs?.map((ioc) => String(ioc.name ?? '')).join('|') ?? '',
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

			await refreshTimeline();
		};

		input.click();
	};

	const loadMore = async () => {
		if (timeline.list.nextPage === null) return;
		if (timeline.list.status === 'loading' || timeline.list.status === 'loading_more') return;
		await timeline.loadMore({ fetch });

		// Chain-load if the trigger still sits inside the prefetch zone. The
		// IntersectionObserver won't re-fire because the trigger never left
		// the viewport, so we manually poke it until the bottom edge is far
		// enough away. Mirrors the assets-sidebar fix.
		requestAnimationFrame(() => {
			if (!loadMoreTrigger || !timelineScrollContainer) return;
			if (timeline.list.nextPage === null) return;

			const rootRect = timelineScrollContainer.getBoundingClientRect();
			const triggerRect = loadMoreTrigger.getBoundingClientRect();
			const prefetchPx = rootRect.height;

			if (triggerRect.top < rootRect.bottom + prefetchPx) {
				loadMore();
			}
		});
	};

	const setupObserver = () => {
		observer?.disconnect();
		if (!timelineScrollContainer) return;

		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadMore();
			},
			{
				root: timelineScrollContainer,
				rootMargin: '100% 0px 100% 0px',
				threshold: 0
			}
		);

		setTimeout(() => {
			if (loadMoreTrigger) observer?.observe(loadMoreTrigger);
		}, 0);
	};

	const handleTriggerRef = (node: HTMLDivElement) => {
		loadMoreTrigger = node;
		observer?.observe(node);

		return { destroy: () => observer?.unobserve(node) };
	};

	$effect(() => {
		timeline.loadEvents({}, { fetch });
		loadEventCategories();
		loadCaseAssets();
		loadCaseIocs();
		loadCaseTimelines();
	});

	$effect(() => {
		for (const event of filteredEvents) {
			loadCommentCount(event.event_id);
		}
	});

	$effect(() => {
		if (timelineScrollContainer) setupObserver();
		return () => observer?.disconnect();
	});
</script>

<svelte:head>
	<title>#{page.params.case_id} - Timeline</title>
</svelte:head>

<CaseWorkspace>
	<div class="flex h-full min-h-0 w-full">
		<TimelineSidebar
			{timelines}
			selectedIds={selectedTimelineIds}
			loading={timelinesLoading}
			onToggle={toggleTimelineSelected}
			onSelectAll={selectAllTimelines}
			onCreate={createTimeline}
			onUpdate={updateTimeline}
			onRemove={removeTimeline}
			{canEdit}
		/>
		<div class="flex h-full min-h-0 flex-1 flex-col">
			<TimelineTopbar
				{filters}
				{eventCategories}
				{viewMode}
				{quickSearch}
				{quickSearchMatchIndex}
				quickSearchMatchCount={quickSearchMatches.length}
				quickSearchLoading={timeline.list.status === 'loading_all' && !timeline.list.allLoaded}
				onUpdateFilter={updateFilter}
				onApplyFilters={applyFilters}
				onClearFilters={clearFilters}
				onRefresh={refreshTimeline}
				onAddEvent={addEvent}
				onViewModeChange={(m) => (viewMode = m)}
				{onQuickSearchChange}
				onQuickSearchNext={quickSearchNext}
				onQuickSearchPrev={quickSearchPrev}
				onDownloadCsv={() => downloadTimelineCsv(false)}
				onDownloadCsvWithUserInfo={() => downloadTimelineCsv(true)}
				onUploadCsv={uploadTimelineCsv}
				{canEdit}
			/>

			<div
				bind:this={timelineScrollContainer}
				class="relative min-h-0 flex-1 overflow-auto bg-gradient-to-b from-muted/30 via-background to-muted/20 px-6 py-4 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
			>
				{#if timeline.list.status === 'loading' && groupedRootEvents.length === 0}
					<div class="mx-auto max-w-[1100px] space-y-2 py-6">
						{#each Array(4) as _, i (i)}
							<Skeleton class="h-24 w-full rounded-lg" />
						{/each}
					</div>
				{:else if timeline.list.error}
					<div class="p-6 text-sm text-destructive">{timeline.list.error}</div>
				{:else if groupedRootEvents.length === 0}
					<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
						No timeline events found.
					</div>
				{:else}
					<ChipHoverHost caseId={page.params.case_id}>
						<TimelineView
							groups={groupedRootEvents}
							{childrenByParent}
							{commentCounts}
							{folded}
							{selected}
							{selecting}
							mode={viewMode}
							matchedEventIds={new Set(quickSearchMatches)}
							currentMatchEventId={quickSearchMatches[quickSearchMatchIndex] ?? null}
							searchQuery={quickSearch}
							onToggleSelect={toggleSelect}
							onToggleFold={toggleFold}
							onEdit={editEvent}
							onAddChild={addChildEvent}
							onFlag={flagEvent}
							onComments={showComments}
							onDuplicate={duplicateEvent}
							onDelete={deleteEvent}
							{canEdit}
						/>

						<div
							use:handleTriggerRef
							class="mx-auto mt-2 flex h-16 max-w-[1100px] items-center justify-center"
						>
							{#if timeline.list.status === 'loading_more'}
								<div class="flex items-center gap-2 text-xs text-muted-foreground">
									<Skeleton class="h-3 w-3 rounded-full" />
									Loading more events…
								</div>
							{:else if timeline.list.nextPage !== null}
								<Button size="sm" variant="ghost" onclick={() => loadMore()}>Load more</Button>
							{:else if timeline.list.total > 0}
								<span class="text-2xs text-muted-foreground">
									{timeline.list.total}
									{timeline.list.total === 1 ? 'event' : 'events'} · end of timeline
								</span>
							{/if}
						</div>
					</ChipHoverHost>
				{/if}

				<TimelineSideToolbar
					{selecting}
					onToggleSelecting={toggleSelecting}
					onDelete={() => (showConfirmDelete = true)}
					onAddEvent={addEvent}
					onToggleFoldAll={toggleFoldAll}
					onRefresh={refreshTimeline}
					onScrollTop={scrollTop}
					onScrollBottom={scrollBottom}
					{canEdit}
				/>
			</div>
		</div>
	</div>
</CaseWorkspace>

<TimelineEventDialog
	bind:open={eventDialogOpen}
	event={selectedEvent}
	{eventCategories}
	parentEvents={parentEventCandidates}
	assets={caseAssets}
	iocs={caseIocs}
	{timelines}
	initialTimelineIds={[...selectedTimelineIds]}
	{selectedParent}
	onRefreshAssets={loadCaseAssets}
	onAddAsset={openAddAsset}
	onRefreshIocs={loadCaseIocs}
	onAddIoc={openAddIoc}
	onOpenChange={(open) => (eventDialogOpen = open)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message={`You are about to delete this timeline ${selected.size > 1 ? 'events' : 'event'} forever. This cannot be reverted. All associated data will be deleted.`}
	onConfirm={commitDeleteEvents}
	onCancel={() => (showConfirmDelete = false)}
/>
