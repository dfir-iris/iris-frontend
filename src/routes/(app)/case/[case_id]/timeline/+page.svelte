<script lang="ts">
	import {
		dayKey,
		formatDate,
		mediumDateTimeFormatter,
		timeZoneLabel
	} from '$lib/utils/time-formatter';
	import { setContext, getContext, untrack } from 'svelte';
	import { mode } from 'mode-watcher';
	import { page } from '$app/state';
	import {
		CaseTimelineService,
		type CaseTimelineEvent,
		type CaseTimelineFilterQuery,
		type CreateCaseTimelineEventBody,
		type UpdateCaseTimelineEventBody
	} from '$lib/services/case-timeline.service';
	import {
		EventCategoriesService,
		type EventCategory
	} from '$lib/services/event-categories.service';
	import { CaseTimelinesService, type CaseTimeline } from '$lib/services/case-timelines.service';
	import type { AlertSearchField } from '$lib/services/alerts.service';
	import { appendExpression } from '$lib/search/lucene';
	import {
		loadTimelineLayout,
		saveTimelineLayout,
		type TimelineLayout
	} from '$lib/utils/timeline-default-view';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { CommentsService } from '$lib/services/comments.service';
	import { HooksService, type HookOption } from '$lib/services/hooks.service';
	import { callHook } from '$lib/utils/hooks';
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
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Button } from '$lib/components/ui/button';
	import ChipHoverHost from '$lib/components/common/MarkDown/ChipHoverHost.svelte';
	import TimelineTopbar from './components/timeline-topbar.svelte';
	import TimelineSideToolbar from './components/timeline-side-toolbar.svelte';
	import TimelineSidebar from './components/timeline-sidebar.svelte';
	import TimelineView from './components/timeline-view.svelte';
	import TimelineEventDialog from './components/timeline-event-dialog.svelte';
	import TimelineSearchView from './components/timeline-search-view.svelte';
	import TimelineFieldsPanel from './components/timeline-fields-panel.svelte';
	import TimelineImageExportDialog, {
		type TimelineImageRequest
	} from './components/timeline-image-export-dialog.svelte';
	import { buildTimelineSvg, eventsOnTimelines, timelineImageToPng } from './image-export';
	import { TimelineSearch } from './timeline-search.svelte';
	import { fieldClause } from './search-helpers';
	import { toast } from '$lib/stores/toast.store';
	import { parseTimelineCsv, timelineCsvDates } from './csv-import';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';
	import type { TimelineFilterData, TimelineFilterFieldValue } from './types';
	import { getHighlightedEventIds } from './helpers';
	import { eventLinkRoles, eventLinkRolesPayload } from '$lib/utils/event-roles';

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
	const cases = getContext<CasesContext | undefined>(CASES_CTX);
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
	// Manual hooks of timeline events, loaded once for every card's menu
	// and the selection's "Run" menu.
	let hookOptions = $state<HookOption[]>([]);
	let timelines = $state<CaseTimeline[]>([]);
	let timelinesLoading = $state<boolean>(true);
	// Empty set = "show all" (no timeline filter applied). A non-empty
	// set restricts the timeline view to events linked to ANY of the
	// selected timelines.
	let selectedTimelineIds = $state<Set<number>>(new Set());
	let commentCounts = $state<Record<number, number>>({});
	let timelineScrollContainer = $state<HTMLDivElement | undefined>(undefined);

	// Cards or search: the user's preferred view, known once their
	// preferences are in. Each view loads its data the first time it is
	// shown, so opening the page in one never pays for the other.
	let layout = $state<TimelineLayout | null>(null);
	let cardsLoaded = false;
	let searchLoaded = false;
	const search = new TimelineSearch(() => {
		const caseId = Number(page.params.case_id);
		return Number.isFinite(caseId) ? caseId : null;
	});
	let searchFields = $state<AlertSearchField[]>([]);
	// Events the confirmation dialog deletes when they come from the
	// search view rather than the cards' selection.
	let pendingDeleteIds = $state<number[] | null>(null);

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

	// Events linked from the URL (`sharedEventId`, or `events` from the graph):
	// scroll the first one into view once it is rendered.
	let linkedEventScrolled = false;
	$effect(() => {
		if (linkedEventScrolled) return;
		const ids = getHighlightedEventIds();
		if (!ids.length) return;
		const first = filteredEvents.find((e) => ids.includes(e.event_id));
		if (!first) return;
		linkedEventScrolled = true;
		scrollMatchIntoView(first.event_id);
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

	// The cards' events and the search's, so a parent can be picked from
	// either view whichever was loaded.
	const parentEventCandidates = $derived.by(() => {
		const byId = new Map<number, CaseTimelineEvent>();
		for (const event of timeline.events()) byId.set(event.event_id, event);
		for (const event of search.events) {
			if (!byId.has(event.event_id)) byId.set(event.event_id, event);
		}
		return [...byId.values()].filter((event) => event.event_id !== selectedEvent?.event_id);
	});

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
			const date = dayKey(event.event_date);

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
		if (!pendingDeleteIds?.length && selected.size === 0 && !selectedEvent) return;

		const eventIds = pendingDeleteIds?.length
			? pendingDeleteIds
			: selected.size > 0
				? [...selected]
				: selectedEvent
					? [selectedEvent.event_id]
					: [];

		try {
			const { removed, failed } = await timeline.removeEvents(eventIds, { fetch });

			if (failed.length > 0) {
				toast({
					title: `Failed to delete ${failed.length} of ${eventIds.length} event${eventIds.length === 1 ? '' : 's'}`,
					description: 'They are still on the timeline.',
					variant: 'destructive'
				});
			} else {
				toast({
					title: `Deleted ${removed.length} event${removed.length === 1 ? '' : 's'}`,
					variant: 'success'
				});
			}
		} finally {
			selected = new Set();
			selecting = false;
			selectedEvent = undefined;
			showConfirmDelete = false;
			if (pendingDeleteIds) {
				pendingDeleteIds = null;
				search.clearSelection();
				void search.run();
			}
		}
	};

	const deleteCount = $derived(pendingDeleteIds?.length ?? (selected.size > 0 ? selected.size : 1));

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
			// No `event_*_roles`: the backend keeps the graph roles of the links.
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
		event_assets_roles: eventLinkRolesPayload(
			event.event_assets ?? [],
			eventLinkRoles(event, 'asset')
		),
		event_iocs_roles: eventLinkRolesPayload(event.event_iocs ?? [], eventLinkRoles(event, 'ioc')),
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
		if (layout === 'search') void search.run();
		else await refreshTimeline();
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

	const loadHookOptions = async () => {
		const res = await HooksService.list('event', { fetch });
		hookOptions = Array.isArray(res.data) ? res.data : [];
	};

	const runEventHook = async (eventId: number, hookOption: HookOption) => {
		const result = await callHook(Number(page.params.case_id), 'event', [eventId], hookOption);
		toast({
			variant: result.status === 'error' ? 'destructive' : 'success',
			title: result.message
		});
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

	const changeLayout = (next: TimelineLayout) => {
		layout = next;
		void saveTimelineLayout(next);
		// The other view may have changed events since this one was last
		// shown.
		if (next === 'cards' && cardsLoaded) void refreshTimeline();
		if (next === 'search' && searchLoaded) void search.run();
	};

	const loadSearchSchema = async () => {
		const res = await CaseTimelineService.searchSchema(Number(page.params.case_id), { fetch });
		searchFields = res.ok && res.data && typeof res.data !== 'string' ? res.data.fields : [];
	};

	const addSearchClause = (alias: string, value: string, exclude: boolean) => {
		search.query = appendExpression(search.query, fieldClause(alias, value, exclude));
		void search.run();
	};

	const loadFullEvent = async (eventId: number): Promise<CaseTimelineEvent | null> => {
		const res = await CaseTimelineService.getEvent(Number(page.params.case_id), eventId, {
			fetch
		});
		return res.ok && res.data && typeof res.data !== 'string' ? res.data : null;
	};

	const flagSearchEvents = async (eventIds: number[], flagged: boolean) => {
		if (!canEdit || !eventIds.length) return;
		const res = await CaseTimelineService.flagEvents(
			Number(page.params.case_id),
			eventIds,
			flagged,
			{
				fetch
			}
		);
		if (!res.ok) {
			toast({
				title: `Could not ${flagged ? 'flag' : 'unflag'} the events`,
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
			return;
		}
		search.patchEvents(eventIds, { event_is_flagged: flagged });
		// A search on the flag may no longer match them.
		if (/\bis\s*:/i.test(search.query)) void search.run();
	};

	const deleteSearchEvents = (eventIds: number[]) => {
		if (!canEdit || !eventIds.length) return;
		pendingDeleteIds = eventIds;
		showConfirmDelete = true;
	};

	// "Move" takes the events off the timelines being looked at — or off
	// every timeline when the sidebar shows them all — and puts them on
	// the target; "add" only puts them there.
	const assignEvents = async (timelineId: number, eventIds: number[], mode: 'move' | 'add') => {
		if (!canEdit || !eventIds.length) return;
		const target = timelines.find((t) => t.timeline_id === timelineId);
		const res = await CaseTimelinesService.assignEvents(
			Number(page.params.case_id),
			timelineId,
			{
				event_ids: eventIds,
				mode,
				...(mode === 'move' && selectedTimelineIds.size
					? { from_timeline_ids: [...selectedTimelineIds] }
					: {})
			},
			{ fetch }
		);
		if (!res.ok) {
			toast({
				title: `Could not ${mode === 'move' ? 'move' : 'add'} the events`,
				description: res.error?.message ?? 'Unknown error',
				variant: 'destructive'
			});
			return;
		}
		const count = eventIds.length;
		toast({
			title: `${mode === 'move' ? 'Moved' : 'Added'} ${count} event${count === 1 ? '' : 's'} to ${target?.name ?? 'the timeline'}`,
			variant: 'success'
		});
		search.clearSelection();
		void search.run();
	};

	const csvEscape = (value: string | number | boolean | null | undefined) => {
		const text = value === null || value === undefined ? '' : String(value);
		if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
		return text;
	};

	const csvDescription = (value: string | null | undefined) =>
		(value ?? '').replaceAll('\n', ' - ');

	const TIMELINE_EXPORT_COLUMNS = [
		{ key: 'event_date', header: 'Date (UTC)', defaultSelected: true },
		{ key: 'event_title', header: 'Title', defaultSelected: true },
		{ key: 'event_description', header: 'Description', defaultSelected: true },
		{ key: 'event_tz', header: 'Timezone', defaultSelected: false },
		{ key: 'event_date_wtz', header: 'Date (with TZ)', defaultSelected: false },
		{ key: 'event_category', header: 'Category', defaultSelected: true },
		{ key: 'event_tags', header: 'Tags', defaultSelected: true },
		{ key: 'linked_assets', header: 'Linked Assets', defaultSelected: false },
		{ key: 'linked_iocs', header: 'Linked IOCs', defaultSelected: false },
		{ key: 'created_by', header: 'Created By', defaultSelected: false },
		{ key: 'creation_date', header: 'Creation Date', defaultSelected: false }
	];

	let showDownloadModal = $state(false);
	let isDownloadingTimeline = $state(false);

	// The cards export the whole timeline; the search view its results —
	// the rows loaded so far, or every match — with their whole text.
	const timelineDownloadRows = async (
		downloadType: 'visible' | 'all'
	): Promise<CaseTimelineEvent[] | null> => {
		if (layout === 'search') {
			return search.exportEvents(downloadType === 'visible' ? search.events.length : null);
		}
		await timeline.loadAll();
		return timeline.events();
	};

	const handleTimelineDownload = async (
		downloadType: 'visible' | 'all',
		selectedColumnKeys: Set<string>
	) => {
		isDownloadingTimeline = true;

		try {
			const rows = await timelineDownloadRows(downloadType);
			if (!rows) {
				toast({ title: 'Could not read the events to download', variant: 'destructive' });
				return;
			}
			const colGetters: Record<string, (e: CaseTimelineEvent) => string> = {
				event_date: (e) => e.event_date,
				event_title: (e) => e.event_title,
				event_description: (e) => csvDescription(e.event_content),
				event_tz: (e) => e.event_tz,
				event_date_wtz: (e) => e.event_date_wtz ?? '',
				event_category: (e) => e.category_name ?? '',
				event_tags: (e) => e.event_tags ?? '',
				linked_assets: (e) => e.assets?.map((a) => String(a.name ?? '')).join(';') ?? '',
				linked_iocs: (e) => e.iocs?.map((i) => String(i.name ?? '')).join('|') ?? '',
				created_by: (e) => e.user ?? '',
				creation_date: (e) => e.event_added ?? ''
			};

			const cols = TIMELINE_EXPORT_COLUMNS.filter((c) => selectedColumnKeys.has(c.key));
			const header = cols.map((c) => csvEscape(c.header)).join(',');
			const dataRows = rows.map((event) =>
				cols.map((c) => csvEscape(colGetters[c.key]?.(event) ?? '')).join(',')
			);
			const csv = [header, ...dataRows].join('\r\n');

			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `case-${page.params.case_id}-timeline${layout === 'search' ? '-search' : ''}.csv`;
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			isDownloadingTimeline = false;
			showDownloadModal = false;
		}
	};

	let showImageExport = $state(false);
	let isExportingImage = $state(false);

	const downloadBlob = (blob: Blob, filename: string) => {
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};

	const imageSubtitle = (events: CaseTimelineEvent[]) => {
		const count = `${events.length} event${events.length === 1 ? '' : 's'}`;
		const first = formatDate(events[0]?.event_date);
		const last = formatDate(events.at(-1)?.event_date);
		const span = first && last ? (first === last ? ` · ${first}` : ` · ${first} – ${last}`) : '';
		const filtered = Object.values(toQuery()).length ? ' · filtered' : '';
		return `${count}${span}${filtered} · times in ${timeZoneLabel()} · exported ${mediumDateTimeFormatter(Date.now())}`;
	};

	// Every event of the cards, not only those scrolled past, pictured
	// for the ticked timelines — together or one picture each.
	const exportTimelineImage = async (request: TimelineImageRequest) => {
		isExportingImage = true;
		try {
			// A pull already under way (quick search) is waited for: loadAll
			// would return at once, before the last pages are in.
			while (timeline.list.status === 'loading_all') {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			await timeline.loadAll({ fetch });
			if (timeline.list.nextPage !== null) {
				throw new Error(timeline.list.error ?? 'Not every event could be loaded.');
			}
			const events = timeline.events();
			const caseLabel = cases?.currentCase()?.case_name || `Case #${page.params.case_id}`;
			const picked = request.timelineIds
				.map((id) => timelines.find((t) => t.timeline_id === id))
				.filter((t): t is CaseTimeline => !!t);
			const pictures = request.separate
				? picked.map((t) => ({ name: t.name, timelines: [t] }))
				: [{ name: picked.length === 1 ? picked[0].name : 'Timeline', timelines: picked }];

			for (const picture of pictures) {
				const pictured = eventsOnTimelines(
					events,
					picture.timelines.map((t) => t.timeline_id)
				);
				const image = buildTimelineSvg({
					title: `${caseLabel} — ${picture.name}`,
					subtitle: imageSubtitle(pictured),
					events: pictured,
					timelines: picture.timelines,
					options: request.options
				});
				const slug = picture.name
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '');
				const filename = `case-${page.params.case_id}-${slug || 'timeline'}.${request.format}`;
				const blob =
					request.format === 'svg'
						? new Blob([image.svg], { type: 'image/svg+xml;charset=utf-8' })
						: await timelineImageToPng(image);
				downloadBlob(blob, filename);
			}
			showImageExport = false;
		} catch (e) {
			toast({
				title: 'Could not export the timeline',
				description: e instanceof Error ? e.message : String(e),
				variant: 'destructive'
			});
		} finally {
			isExportingImage = false;
		}
	};

	const MAX_IMPORT_ERRORS_SHOWN = 5;

	const uploadTimelineCsv = async () => {
		const input = document.createElement('input');

		input.type = 'file';
		input.accept = '.csv,text/csv';

		input.onchange = async () => {
			const file = input.files?.[0];
			const caseId = timeline.currentCaseId();

			if (!file || caseId === null) return;

			const csv = parseTimelineCsv(await file.text());
			if (csv.errors.length || !csv.rows.length) {
				toast({
					title: 'Cannot import this file',
					description: csv.errors.join('. ') || 'It has no events.',
					variant: 'destructive'
				});
				return;
			}

			// Dates of an unusual shape go through the magic date parse
			const { dated, errors } = await timelineCsvDates(csv.rows, async (value) => {
				const res = await CaseTimelineService.convertDate(caseId, value, { fetch });
				return res.ok && res.data && typeof res.data !== 'string' ? res.data : null;
			});

			const categoryId = (name: string) =>
				eventCategories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ??
				defaultEventCategoryId;

			let imported = 0;
			for (const { row, date, tz } of dated) {
				const payload: CreateCaseTimelineEventBody = {
					event_title: row.title,
					event_date: date,
					event_tz: tz,
					event_content: row.description,
					event_tags: row.tags,
					event_source: row.source,
					event_raw: row.raw,
					event_assets: [],
					event_iocs: [],
					event_in_summary: false,
					event_in_graph: true,
					event_sync_iocs_assets: false,
					parent_event_id: null,
					event_category_id: categoryId(row.category)
				};

				// One refresh at the end rather than one per event
				const res = await CaseTimelineService.createEvent(caseId, payload, { fetch });
				if (res.ok) {
					imported += 1;
				} else {
					errors.push({ number: row.number, message: res.error?.message ?? 'Not saved' });
				}
			}

			// The other view catches up when it is next shown.
			if (layout === 'search') void search.run();
			else await refreshTimeline();

			const total = csv.rows.length;
			if (!errors.length) {
				toast({ title: `Imported ${imported} event${imported === 1 ? '' : 's'}` });
				return;
			}
			errors.sort((a, b) => a.number - b.number);
			const shown = errors
				.slice(0, MAX_IMPORT_ERRORS_SHOWN)
				.map((e) => `Event ${e.number}: ${e.message}`);
			if (errors.length > MAX_IMPORT_ERRORS_SHOWN) {
				shown.push(`… and ${errors.length - MAX_IMPORT_ERRORS_SHOWN} more`);
			}
			toast({
				title: `Imported ${imported} of ${total} events`,
				description: shown.join('; '),
				variant: 'destructive'
			});
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
		loadEventCategories();
		loadHookOptions();
		loadCaseAssets();
		loadCaseIocs();
		loadCaseTimelines();
		untrack(() => void initLayout());
	});

	// A link to events (shared, or from the graph) opens them in the
	// cards whatever the preference, without changing it.
	const initLayout = async () => {
		const linked = getHighlightedEventIds().length > 0;
		layout = linked ? 'cards' : await loadTimelineLayout();
	};

	$effect(() => {
		if (layout === 'cards' && !cardsLoaded) {
			cardsLoaded = true;
			untrack(() => timeline.loadEvents({}, { fetch }));
		} else if (layout === 'search' && !searchLoaded) {
			searchLoaded = true;
			untrack(() => {
				void loadSearchSchema();
				void search.run();
			});
		}
	});

	// The sidebar's timelines scope the search as they do the cards.
	$effect(() => {
		const ids = [...selectedTimelineIds];
		untrack(() => {
			search.timelineIds = ids;
			if (layout === 'search' && searchLoaded) void search.run();
		});
	});

	// The event dialog saves on its own; the search reruns once it closes
	// so an edited or added event shows as it now is.
	let dialogWasOpen = false;
	$effect(() => {
		if (eventDialogOpen) {
			dialogWasOpen = true;
			return;
		}
		if (!dialogWasOpen) return;
		dialogWasOpen = false;
		untrack(() => {
			if (layout === 'search') void search.run();
		});
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
			onDropEvents={layout === 'search' ? assignEvents : undefined}
			footer={layout === 'search' ? fieldsFooter : undefined}
		/>
		{#if layout === null}
			<div class="flex-1 space-y-2 p-6">
				{#each Array(4) as _, i (i)}
					<Skeleton class="h-16 w-full rounded-lg" />
				{/each}
			</div>
		{:else if layout === 'search'}
			<ChipHoverHost
				caseId={page.params.case_id}
				class="flex h-full min-h-0 min-w-0 flex-1 flex-col"
			>
				<TimelineSearchView
					{search}
					caseId={Number(page.params.case_id)}
					{searchFields}
					{timelines}
					{hookOptions}
					{canEdit}
					{layout}
					onLayoutChange={changeLayout}
					onLoadFull={loadFullEvent}
					onEdit={editEvent}
					onAddChild={addChildEvent}
					onFlag={flagSearchEvents}
					onComments={showComments}
					onDuplicate={duplicateEvent}
					onDelete={deleteSearchEvents}
					onRunHook={runEventHook}
					onAssign={assignEvents}
					onDownloadCsv={() => (showDownloadModal = true)}
					onUploadCsv={uploadTimelineCsv}
				/>
			</ChipHoverHost>
		{:else}
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
					onDownloadCsv={() => (showDownloadModal = true)}
					onExportImage={() => (showImageExport = true)}
					onUploadCsv={uploadTimelineCsv}
					{canEdit}
					{layout}
					onLayoutChange={changeLayout}
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
								{hookOptions}
								onRunHook={runEventHook}
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
						caseId={Number(page.params.case_id)}
						selectedIds={[...selected]}
						{hookOptions}
						onHookDone={toggleSelecting}
						onAddEvent={addEvent}
						onToggleFoldAll={toggleFoldAll}
						onRefresh={refreshTimeline}
						onScrollTop={scrollTop}
						onScrollBottom={scrollBottom}
						{canEdit}
					/>
				</div>
			</div>
		{/if}
	</div>
</CaseWorkspace>

{#snippet fieldsFooter()}
	<TimelineFieldsPanel
		fields={search.fields}
		total={search.total ?? 0}
		loading={search.status === 'loading'}
		onClause={addSearchClause}
	/>
{/snippet}

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

<DownloadModal
	open={showDownloadModal}
	title={layout === 'search' ? 'Download search results as CSV' : 'Download Timeline as CSV'}
	itemNounPlural="events"
	availableColumns={TIMELINE_EXPORT_COLUMNS}
	countVisible={layout === 'search' ? search.events.length : timeline.events().length}
	countAll={layout === 'search' ? (search.total ?? search.events.length) : timeline.list.total}
	isProcessing={isDownloadingTimeline}
	processingMessage={layout === 'search'
		? 'Loading the matching events…'
		: 'Loading all timeline events…'}
	onConfirm={handleTimelineDownload}
	onOpenChange={(v) => (showDownloadModal = v)}
/>

<TimelineImageExportDialog
	open={showImageExport}
	{timelines}
	initialTimelineIds={[...selectedTimelineIds]}
	initialLayout={viewMode}
	initialTheme={$mode === 'dark' ? 'dark' : 'light'}
	isProcessing={isExportingImage}
	onConfirm={exportTimelineImage}
	onOpenChange={(v) => (showImageExport = v)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message={`You are about to delete ${deleteCount > 1 ? `these ${deleteCount} timeline events` : 'this timeline event'} forever. This cannot be reverted. All associated data will be deleted.`}
	onConfirm={commitDeleteEvents}
	onCancel={() => {
		showConfirmDelete = false;
		pendingDeleteIds = null;
	}}
/>
