<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { ListIcon, ListTreeIcon, Pencil, Plus, Search, Trash2, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomTimelinesService,
		type LinkedCase,
		type WarRoomTimeline,
		type WarRoomTimelineEvent
	} from '$lib/services/war-room-timelines.service';
	import { UsersService } from '$lib/services/users.service';
	import { safeHexColor } from '$lib/utils/color';
	import TimelineView from './components/timeline-view.svelte';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let timelines = $state<WarRoomTimeline[]>([]);
	let events = $state<WarRoomTimelineEvent[]>([]);
	let loading = $state(true);

	let selectedIds = $state<Set<number>>(new Set());

	// Linked-case timeline projection state. Selection is persisted per
	// war room in `war_room_timeline_sources:<war_room_id>` — same
	// pattern as the chat Stream's `war_room_stream` pref. `linkedCases`
	// holds the sidebar tree; `selectedCaseTimelineIds` holds the user's
	// picks. Case events default to OFF so a new war room isn't drowned
	// in every attached case's history on first open.
	let linkedCases = $state<LinkedCase[]>([]);
	let selectedCaseTimelineIds = $state<Set<number>>(new Set());
	let expandedCaseIds = $state<Set<number>>(new Set());
	let prefsLoaded = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	const prefKey = $derived(`war_room_timeline_sources:${warRoomId}`);

	// Filters (client-side, mirrors case-timeline UX)
	let filterText = $state('');
	let filterFrom = $state('');
	let filterTo = $state('');
	let filterCategory = $state('');

	// Timeline create/edit
	let addOpen = $state(false);
	let newName = $state('');
	let newColor = $state('#3b82f6');
	let saving = $state(false);

	let editingId = $state<number | null>(null);
	let editingName = $state('');
	let editingColor = $state('#3b82f6');

	// Event create/edit — reuse a single dialog with mode flag
	let entryOpen = $state(false);
	let entryMode = $state<'create' | 'edit'>('create');
	let entryEventId = $state<number | null>(null);
	let entryTimelineId = $state<number | null>(null);
	// Parent id for creating a child event. Set by the "add child"
	// hover button on the parent card; sent to the backend as
	// `parent_id` so the tree view can render the child under it.
	let entryParentId = $state<number | null>(null);
	let entryTitle = $state('');
	let entryContent = $state('');
	let entryDate = $state('');
	let entryCategory = $state('');
	let entryColor = $state('');

	// Drag state — track which event is being dragged so the sidebar
	// can show a drop affordance and the drop handler can reparent it.
	let dragEventId = $state<number | null>(null);
	let dragOverTimelineId = $state<number | null>(null);

	const load = async () => {
		loading = true;
		// Native war-room timelines (list) + linked-case timelines (sidebar tree)
		// in parallel — one round-trip's worth of latency for both trees.
		const [tl, lc] = await Promise.all([
			WarRoomTimelinesService.list(warRoomId),
			WarRoomTimelinesService.listLinkedCaseTimelines(warRoomId)
		]);
		if (tl.ok && Array.isArray(tl.data)) {
			timelines = tl.data;
		}
		if (lc.ok && Array.isArray(lc.data)) {
			linkedCases = lc.data as LinkedCase[];
		}

		// Fetch native + projected events in parallel too. Passing
		// `undefined` for `timelineIds` when nothing is selected keeps
		// today's "empty selection = show all natives" contract.
		// Case events default to `[]` — the pref restore below is what
		// flips the selection if the user previously opted in.
		const [ev, cev] = await Promise.all([
			WarRoomTimelinesService.listEvents(warRoomId, {
				timelineIds: selectedIds.size ? Array.from(selectedIds) : undefined
			}),
			selectedCaseTimelineIds.size
				? WarRoomTimelinesService.listLinkedCaseEvents(warRoomId, {
						caseTimelineIds: Array.from(selectedCaseTimelineIds)
					})
				: Promise.resolve({ ok: true, data: [] as WarRoomTimelineEvent[] } as const)
		]);
		const merged: WarRoomTimelineEvent[] = [];
		if (ev.ok && Array.isArray(ev.data)) merged.push(...ev.data);
		if (cev.ok && Array.isArray(cev.data)) merged.push(...cev.data);
		// Sort by event_date ascending, nulls last — same order the
		// backend returns each side individually, so a chronological
		// merged view lands naturally.
		merged.sort((a, b) => {
			if (a.event_date == null && b.event_date == null) return 0;
			if (a.event_date == null) return 1;
			if (b.event_date == null) return -1;
			return a.event_date.localeCompare(b.event_date);
		});
		events = merged;
		loading = false;
	};

	const loadPreferences = async () => {
		const res = await UsersService.getMyPreference<{
			case_timeline_ids?: number[];
			native_timeline_ids?: number[] | null;
		}>(prefKey);
		if (res.ok && res.data && typeof res.data !== 'string' && res.data.value) {
			const v = res.data.value;
			if (Array.isArray(v.case_timeline_ids)) {
				selectedCaseTimelineIds = new Set(v.case_timeline_ids);
			}
			// null / undefined for `native_timeline_ids` means "show all"
			// (the sidebar's empty-set semantics); an explicit array
			// restores a specific selection.
			if (Array.isArray(v.native_timeline_ids)) {
				selectedIds = new Set(v.native_timeline_ids);
			}
		}
		prefsLoaded = true;
	};

	const savePreferences = () => {
		// Skip until the first load has hydrated — otherwise the initial
		// empty-Set defaults would overwrite the server-side pref before
		// we've had a chance to read it.
		if (!prefsLoaded) return;
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			UsersService.setMyPreference(prefKey, {
				case_timeline_ids: Array.from(selectedCaseTimelineIds),
				// `null` when every native timeline is visible — matches
				// the "empty selection = show all" contract on read so
				// the shape stays stable across load/save cycles.
				native_timeline_ids: selectedIds.size ? Array.from(selectedIds) : null
			});
		}, 500);
	};

	// Persist selection changes with a 500ms debounce. Runs on every
	// mutation of either Set; the debounce collapses a rapid toggle
	// sequence into a single PUT.
	$effect(() => {
		void selectedIds;
		void selectedCaseTimelineIds;
		savePreferences();
	});

	onMount(async () => {
		await loadPreferences();
		await load();
	});

	const toggleSelect = (id: number) => {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
		load();
	};

	const toggleCaseTimeline = (timelineId: number) => {
		const next = new Set(selectedCaseTimelineIds);
		if (next.has(timelineId)) next.delete(timelineId);
		else next.add(timelineId);
		selectedCaseTimelineIds = next;
		load();
	};

	const toggleCaseExpand = (caseId: number) => {
		const next = new Set(expandedCaseIds);
		if (next.has(caseId)) next.delete(caseId);
		else next.add(caseId);
		expandedCaseIds = next;
	};

	const showAll = () => {
		// "Show all" also clears the case-timeline projection so the
		// button is a true one-click reset to the default sidebar state.
		selectedIds = new Set();
		selectedCaseTimelineIds = new Set();
		load();
	};

	// Discriminate projected case events (read-only) from native ones.
	// Native events have numeric ids and no `war_room_source`; projected
	// events have synthetic `case:<cid>:<eid>` string ids AND
	// `war_room_source === 'case'`. Both checks are belt-and-braces —
	// either alone is sufficient but their combination is unambiguous.
	const isProjected = (e: WarRoomTimelineEvent): boolean =>
		e.war_room_source === 'case' || typeof e.id === 'string';

	const submitCreate = async () => {
		const name = newName.trim();
		if (!name) return;
		saving = true;
		const res = await WarRoomTimelinesService.create(warRoomId, {
			name,
			color: newColor || null
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			timelines = [...timelines, res.data as WarRoomTimeline];
			addOpen = false;
			newName = '';
		} else {
			toast({ title: 'Could not create timeline', variant: 'destructive' });
		}
	};

	const startEdit = (t: WarRoomTimeline) => {
		editingId = t.timeline_id;
		editingName = t.name;
		editingColor = t.color ?? '#3b82f6';
	};

	const submitEdit = async () => {
		if (editingId == null) return;
		saving = true;
		const original = timelines.find((t) => t.timeline_id === editingId);
		const body: { name?: string; color?: string | null } = {};
		if (original?.name !== editingName.trim()) body.name = editingName.trim();
		if ((original?.color ?? null) !== editingColor) body.color = editingColor;
		if (Object.keys(body).length === 0) {
			editingId = null;
			saving = false;
			return;
		}
		const res = await WarRoomTimelinesService.update(warRoomId, editingId, body);
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTimeline;
			timelines = timelines.map((t) => (t.timeline_id === editingId ? next : t));
			editingId = null;
		} else {
			toast({ title: 'Could not update timeline', variant: 'destructive' });
		}
	};

	const removeTimeline = async (t: WarRoomTimeline) => {
		if (t.is_default) return;
		if (!confirm(`Delete timeline "${t.name}"?`)) return;
		const res = await WarRoomTimelinesService.remove(warRoomId, t.timeline_id);
		if (res.ok) {
			timelines = timelines.filter((x) => x.timeline_id !== t.timeline_id);
			selectedIds.delete(t.timeline_id);
			selectedIds = new Set(selectedIds);
			load();
		}
	};

	const openCreateEvent = (t: WarRoomTimeline) => {
		entryMode = 'create';
		entryEventId = null;
		entryTimelineId = t.timeline_id;
		entryParentId = null;
		entryTitle = '';
		entryContent = '';
		entryDate = new Date().toISOString().slice(0, 16);
		entryCategory = '';
		entryColor = '';
		entryOpen = true;
	};

	/**
	 * Open the event dialog primed to create a child of `parentEventId`.
	 * Timeline defaults to the parent's timeline so the child lands
	 * on the same track — the tree view renders parent + children
	 * together regardless of what the user picks, but staying on the
	 * same timeline is the least-surprise default.
	 */
	const openCreateChildEvent = (parentEventId: number | string) => {
		if (typeof parentEventId !== 'number') return; // projected events are read-only
		const parent = events.find((x) => x.id === parentEventId);
		if (!parent) return;
		const parentTimeline = timelines.find((t) => t.timeline_id === parent.timeline_id);
		if (!parentTimeline) return;
		entryMode = 'create';
		entryEventId = null;
		entryTimelineId = parentTimeline.timeline_id;
		entryParentId = parentEventId;
		entryTitle = '';
		entryContent = '';
		entryDate = new Date().toISOString().slice(0, 16);
		entryCategory = '';
		entryColor = '';
		entryOpen = true;
	};

	/**
	 * Pick a sensible default timeline for the toolbar "Add event"
	 * button, which isn't scoped to a specific row. Preference order:
	 *   1. The first *selected* timeline (analyst is actively looking
	 *      at it — new event should land there).
	 *   2. The default timeline (`is_default`) — the "Main" bucket.
	 *   3. The first timeline in the list.
	 * Returns `null` if the war room has no timelines yet, in which
	 * case the caller should nudge the user to create one first.
	 */
	const pickDefaultTimeline = (): WarRoomTimeline | null => {
		if (timelines.length === 0) return null;
		if (selectedIds.size > 0) {
			const firstSelected = timelines.find((t) => selectedIds.has(t.timeline_id));
			if (firstSelected) return firstSelected;
		}
		const defaultOne = timelines.find((t) => t.is_default);
		return defaultOne ?? timelines[0];
	};

	const openCreateEventFromFab = () => {
		const target = pickDefaultTimeline();
		if (!target) {
			toast({
				title: 'Create a timeline first',
				description: 'Add a timeline in the left sidebar, then add events to it.',
				variant: 'destructive'
			});
			return;
		}
		openCreateEvent(target);
	};

	const openEditEvent = (e: WarRoomTimelineEvent) => {
		// Projected case events are read-only from the war-room side —
		// edits go through the case-timeline endpoints. The pencil
		// button is hidden for those, so this branch is defensive.
		if (isProjected(e) || typeof e.id !== 'number') return;
		entryMode = 'edit';
		entryEventId = e.id;
		entryTimelineId = e.timeline_id;
		entryParentId = e.parent_id ?? null;
		entryTitle = e.title ?? '';
		entryContent = e.content ?? '';
		entryDate = e.event_date ? e.event_date.slice(0, 16) : '';
		entryCategory = e.category ?? '';
		entryColor = e.color ?? '';
		entryOpen = true;
	};

	const submitEntry = async () => {
		const title = entryTitle.trim();
		if (!title) return;
		saving = true;
		if (entryMode === 'create') {
			if (entryTimelineId == null) {
				saving = false;
				return;
			}
			const res = await WarRoomTimelinesService.addEvent(warRoomId, entryTimelineId, {
				title,
				content: entryContent.trim() || null,
				event_date: entryDate || null,
				category: entryCategory.trim() || null,
				color: entryColor || null,
				parent_id: entryParentId
			});
			saving = false;
			if (res.ok) {
				entryOpen = false;
				load();
			} else {
				toast({ title: 'Could not create event', variant: 'destructive' });
			}
		} else {
			if (entryEventId == null) {
				saving = false;
				return;
			}
			const res = await WarRoomTimelinesService.updateEvent(warRoomId, entryEventId, {
				title,
				content: entryContent.trim() || null,
				event_date: entryDate || null,
				category: entryCategory.trim() || null,
				color: entryColor || null,
				parent_id: entryParentId
			});
			saving = false;
			if (res.ok && res.data && typeof res.data !== 'string') {
				const next = res.data as WarRoomTimelineEvent;
				// `next.id` is always a number here — the update endpoint
				// only ever returns native rows (projected events aren't
				// editable and don't hit this path).
				events = events.map((x) => (x.id === next.id ? next : x));
				entryOpen = false;
			} else {
				toast({ title: 'Could not update event', variant: 'destructive' });
			}
		}
	};

	const removeEvent = async (e: WarRoomTimelineEvent) => {
		if (isProjected(e) || typeof e.id !== 'number') return;
		if (!confirm('Delete this event?')) return;
		const res = await WarRoomTimelinesService.removeEvent(warRoomId, e.id);
		if (res.ok) {
			events = events.filter((x) => x.id !== e.id);
		}
	};

	const removeEventById = async (eventId: number | string) => {
		const e = events.find((x) => x.id === eventId);
		if (e) await removeEvent(e);
	};

	const flagEventById = async (eventId: number | string) => {
		if (typeof eventId !== 'number') return; // projected events are read-only
		const res = await WarRoomTimelinesService.toggleEventFlag(warRoomId, eventId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTimelineEvent;
			events = events.map((x) => (x.id === next.id ? next : x));
		}
	};

	const duplicateEventById = async (eventId: number | string) => {
		if (typeof eventId !== 'number') return;
		const res = await WarRoomTimelinesService.duplicateEvent(warRoomId, eventId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			// Reload so the new event lands in the right chronological slot.
			await load();
		}
	};

	const editEventById = (eventId: number | string) => {
		const e = events.find((x) => x.id === eventId);
		if (e) openEditEvent(e);
	};

	// Track which parent-event cards are collapsed (children hidden).
	let foldedEventIds = $state<Set<number | string>>(new Set());
	const toggleFold = (eventId: number | string) => {
		const next = new Set(foldedEventIds);
		if (next.has(eventId)) next.delete(eventId);
		else next.add(eventId);
		foldedEventIds = next;
	};

	// List (default) or tree render mode. Tree renders roots
	// alternating on either side of a central spine with children
	// branching off (see `timeline-view.svelte`). Toggle sits in the
	// filter bar's right-hand cluster.
	let viewMode = $state<'list' | 'tree'>('list');

	// Bulk-select mode + selection set. Multi-select toolbar comes in
	// Stage 2; for now the card just supports the visual "selected"
	// state so the ring styles render correctly.
	let selecting = $state(false);
	let selectedEventIds = $state<Set<number | string>>(new Set());
	const toggleSelectEvent = (eventId: number | string) => {
		const next = new Set(selectedEventIds);
		if (next.has(eventId)) next.delete(eventId);
		else next.add(eventId);
		selectedEventIds = next;
	};

	// Drag-and-drop: move an event to another timeline.
	//
	// We use HTML5 native DnD so we don't pull in a library for one
	// feature. The dataTransfer payload is just the event id as text,
	// and `dragEventId` mirrors it so Svelte reactivity can highlight
	// drop targets during the drag.
	//
	// These handlers are wired up in the template but not yet used there
	// (DnD UI is in-progress), so they appear unused to the linter.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const onDragStart = (ev: DragEvent, e: WarRoomTimelineEvent) => {
		// Only native war-room events are draggable. Case-projected
		// events would need a copy-in semantic to move onto a native
		// timeline, which we explicitly ruled out — edits belong on
		// the source case, not here.
		if (isProjected(e) || typeof e.id !== 'number') {
			ev.preventDefault();
			return;
		}
		dragEventId = e.id;
		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'move';
			ev.dataTransfer.setData('text/plain', String(e.id));
		}
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const onDragEnd = () => {
		dragEventId = null;
		dragOverTimelineId = null;
	};

	const onTimelineDragOver = (ev: DragEvent, timelineId: number) => {
		if (dragEventId == null) return;
		const e = events.find((x) => x.id === dragEventId);
		if (!e || e.timeline_id === timelineId) return;
		ev.preventDefault();
		if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
		dragOverTimelineId = timelineId;
	};

	const onTimelineDrop = async (ev: DragEvent, timelineId: number) => {
		if (dragEventId == null) return;
		ev.preventDefault();
		const eventId = dragEventId;
		const draggedEvent = events.find((x) => x.id === eventId);
		dragEventId = null;
		dragOverTimelineId = null;
		if (!draggedEvent || draggedEvent.timeline_id === timelineId) return;
		const res = await WarRoomTimelinesService.updateEvent(warRoomId, eventId, {
			timeline_id: timelineId
		});
		if (res.ok && res.data && typeof res.data !== 'string') {
			const next = res.data as WarRoomTimelineEvent;
			events = events.map((x) => (x.id === next.id ? next : x));
			toast({ title: 'Event moved' });
		} else {
			toast({ title: 'Could not move event', variant: 'destructive' });
		}
	};

	const clearFilters = () => {
		filterText = '';
		filterFrom = '';
		filterTo = '';
		filterCategory = '';
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const fmtDate = (iso: string | null) => {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleString();
		} catch {
			return iso;
		}
	};

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const tlById = $derived(new Map(timelines.map((t) => [t.timeline_id, t])));

	// Case-timeline lookup for projected events. `timeline_id` on a
	// projected row is a *case* timeline id (not a war-room one), so
	// we can't reuse `tlById` — it'd either miss or, worse, alias to
	// a war-room timeline that happens to share the numeric id.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const caseTimelineById = $derived.by(() => {
		const m = new Map<
			number,
			{ name: string; color: string | null; caseId: number; caseName: string }
		>();
		for (const lc of linkedCases) {
			for (const ct of lc.timelines) {
				m.set(ct.timeline_id, {
					name: ct.name,
					color: ct.color,
					caseId: lc.case_id,
					caseName: lc.case_name
				});
			}
		}
		return m;
	});

	const filteredEvents = $derived.by(() => {
		const needle = filterText.trim().toLowerCase();
		const cat = filterCategory.trim().toLowerCase();
		const from = filterFrom ? new Date(filterFrom).getTime() : null;
		const to = filterTo ? new Date(filterTo).getTime() : null;
		return events.filter((e) => {
			if (needle) {
				const hay = (
					(e.title ?? '') +
					' ' +
					(e.content ?? '') +
					' ' +
					(e.category ?? '')
				).toLowerCase();
				if (!hay.includes(needle)) return false;
			}
			if (cat) {
				if (!e.category || !e.category.toLowerCase().includes(cat)) return false;
			}
			if (from != null || to != null) {
				const ts = e.event_date ? new Date(e.event_date).getTime() : NaN;
				if (Number.isNaN(ts)) return false;
				if (from != null && ts < from) return false;
				if (to != null && ts > to) return false;
			}
			return true;
		});
	});

	const filtersActive = $derived(Boolean(filterText || filterCategory || filterFrom || filterTo));

	/**
	 * Group filtered events by calendar day for the date-header
	 * sticky sections. Only *root* events (no `parent_id` OR whose
	 * parent isn't in the filtered set) are put in the group buckets
	 * — children hang off their parent in the tree render.
	 *
	 * Projected case events currently arrive with `parent_id = null`
	 * (the projection layer doesn't cross the boundary), so they
	 * behave as roots — which is what we want visually.
	 */
	const rootEventsByDate = $derived.by(() => {
		const filteredIds = new Set(filteredEvents.map((e) => e.id));
		const roots = filteredEvents.filter(
			(e) => e.parent_id == null || !filteredIds.has(e.parent_id)
		);
		const groups = new Map<string, WarRoomTimelineEvent[]>();
		for (const e of roots) {
			const day = e.event_date ? e.event_date.slice(0, 10) : '';
			const bucket = groups.get(day);
			if (bucket) bucket.push(e);
			else groups.set(day, [e]);
		}
		// Return sorted by day ascending (nulls / '' last).
		return Array.from(groups.entries())
			.sort(([a], [b]) => {
				if (!a && !b) return 0;
				if (!a) return 1;
				if (!b) return -1;
				return a.localeCompare(b);
			})
			.map(([date, evs]) => ({ date, events: evs }));
	});

	/**
	 * Map of `parent_id → children[]` built from the *filtered* event
	 * set so the tree only shows children whose parents are visible.
	 * Keyed by event id (numeric or synthetic string), matching what
	 * `TimelineView` expects.
	 */
	const childrenByParent = $derived.by(() => {
		const map = new Map<number | string, WarRoomTimelineEvent[]>();
		for (const e of filteredEvents) {
			if (e.parent_id == null) continue;
			const bucket = map.get(e.parent_id);
			if (bucket) bucket.push(e);
			else map.set(e.parent_id, [e]);
		}
		return map;
	});
</script>

<div class="grid h-full w-full grid-cols-[240px_minmax(0,1fr)] overflow-hidden">
	<aside class="flex flex-col border-r bg-card/30 text-xs">
		<header class="flex items-center justify-between border-b px-3 py-2">
			<h3 class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
				Timelines
			</h3>
			<Button size="icon" variant="ghost" class="h-6 w-6" onclick={() => (addOpen = true)}>
				<Plus class="h-3 w-3" />
			</Button>
		</header>

		<div class="flex items-center border-b px-3 py-2">
			<button
				type="button"
				class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
				onclick={showAll}
			>
				{selectedIds.size === 0 ? 'Showing all' : 'Show all'}
			</button>
		</div>

		<div class="flex-1 overflow-y-auto py-1">
			{#if loading}
				<div class="px-3 py-4 text-center text-2xs text-muted-foreground">Loading…</div>
			{:else if timelines.length === 0}
				<div class="px-3 py-4 text-center text-2xs text-muted-foreground">No timelines yet.</div>
			{:else}
				<ul class="flex flex-col gap-0.5">
					{#each timelines as t (t.timeline_id)}
						{@const checked = selectedIds.has(t.timeline_id)}
						{@const safeColor = safeHexColor(t.color)}
						{@const isDropTarget = dragOverTimelineId === t.timeline_id}
						<li class="group">
							{#if editingId === t.timeline_id}
								<div class="flex flex-col gap-1 px-2 py-1.5">
									<Input
										value={editingName}
										oninput={(e) => (editingName = (e.target as HTMLInputElement).value)}
										class="h-6 text-xs"
									/>
									<div class="flex items-center gap-1">
										<input
											type="color"
											bind:value={editingColor}
											class="h-6 w-8 cursor-pointer rounded border bg-transparent p-0"
										/>
										<Button
											size="sm"
											class="h-6 flex-1 text-2xs"
											disabled={saving}
											onclick={submitEdit}
										>
											Save
										</Button>
										<Button
											size="sm"
											variant="ghost"
											class="h-6 px-2 text-2xs"
											disabled={saving}
											onclick={() => (editingId = null)}
										>
											Cancel
										</Button>
									</div>
								</div>
							{:else}
								<div
									role="group"
									class="flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-muted/50"
									class:bg-muted={checked}
									class:ring-2={isDropTarget}
									class:ring-primary={isDropTarget}
									ondragover={(e) => onTimelineDragOver(e, t.timeline_id)}
									ondragleave={() => (dragOverTimelineId = null)}
									ondrop={(e) => onTimelineDrop(e, t.timeline_id)}
								>
									<Checkbox
										{checked}
										onCheckedChange={() => toggleSelect(t.timeline_id)}
										aria-label={`Toggle ${t.name}`}
									/>
									{#if safeColor}
										<span
											class="h-2 w-2 shrink-0 rounded-full"
											style:background-color={safeColor}
											aria-hidden="true"
										></span>
									{/if}
									<span class="min-w-0 flex-1 truncate" title={t.name}>{t.name}</span>
									{#if t.is_default}
										<span
											class="shrink-0 rounded border bg-muted/60 px-1 text-[9px] uppercase tracking-wider text-muted-foreground"
										>
											Default
										</span>
									{/if}
									<div class="hidden shrink-0 items-center gap-0.5 group-hover:flex">
										<Button
											size="icon"
											variant="ghost"
											class="h-5 w-5"
											onclick={() => openCreateEvent(t)}
											aria-label={`Add event to ${t.name}`}
										>
											<Plus class="h-3 w-3" />
										</Button>
										<Button
											size="icon"
											variant="ghost"
											class="h-5 w-5"
											onclick={() => startEdit(t)}
											aria-label={`Edit ${t.name}`}
										>
											<Pencil class="h-2.5 w-2.5" />
										</Button>
										{#if !t.is_default}
											<Button
												size="icon"
												variant="ghost"
												class="h-5 w-5 text-destructive hover:text-destructive"
												onclick={() => removeTimeline(t)}
												aria-label={`Delete ${t.name}`}
											>
												<Trash2 class="h-2.5 w-2.5" />
											</Button>
										{/if}
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
				{#if dragEventId != null}
					<p class="px-3 py-2 text-2xs italic text-muted-foreground">
						Drop on a timeline to move the event.
					</p>
				{/if}
			{/if}

			<!--
			  Linked-case timelines. Each attached case is a collapsible
			  group of its own timelines. Selection persists per-user +
			  per-war-room in `war_room_timeline_sources:<war_room_id>`.
			  Cases the caller can't read are elided server-side, so no
			  client-side filtering is needed here.
			-->
			{#if linkedCases.length > 0}
				<header class="mt-3 flex items-center justify-between border-b border-t px-3 py-2">
					<h3 class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
						Linked case timelines
					</h3>
				</header>
				<ul class="flex flex-col gap-0.5 py-1">
					{#each linkedCases as lc (lc.case_id)}
						{@const expanded = expandedCaseIds.has(lc.case_id)}
						{@const anySelected = lc.timelines.some((t) =>
							selectedCaseTimelineIds.has(t.timeline_id)
						)}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-1 rounded-sm px-2 py-1 text-left transition-colors hover:bg-muted/50"
								onclick={() => toggleCaseExpand(lc.case_id)}
								aria-expanded={expanded}
							>
								<span
									class="inline-block w-3 shrink-0 text-center text-muted-foreground"
									aria-hidden="true">{expanded ? '▾' : '▸'}</span
								>
								<span class="min-w-0 flex-1 truncate" title={lc.case_name}>
									<span class="text-muted-foreground">#{lc.case_id}</span>
									·
									{lc.case_name}
								</span>
								{#if anySelected}
									<span
										class="shrink-0 rounded border bg-primary/10 px-1 text-[9px] uppercase tracking-wider text-primary"
										title="At least one timeline from this case is visible"
									>
										On
									</span>
								{/if}
							</button>
							{#if expanded}
								{#if lc.timelines.length === 0}
									<p class="px-6 py-1 text-2xs italic text-muted-foreground">
										No timelines on this case.
									</p>
								{:else}
									<ul class="ml-4 flex flex-col gap-0.5">
										{#each lc.timelines as ct (ct.timeline_id)}
											{@const checked = selectedCaseTimelineIds.has(ct.timeline_id)}
											{@const safeCTColor = safeHexColor(ct.color)}
											<li>
												<label
													class="flex items-center gap-2 rounded-sm px-2 py-1 transition-colors hover:bg-muted/50"
													class:bg-muted={checked}
												>
													<Checkbox
														{checked}
														onCheckedChange={() => toggleCaseTimeline(ct.timeline_id)}
														aria-label={`Toggle ${ct.name} from case #${lc.case_id}`}
													/>
													{#if safeCTColor}
														<span
															class="h-2 w-2 shrink-0 rounded-full"
															style:background-color={safeCTColor}
															aria-hidden="true"
														></span>
													{/if}
													<span class="min-w-0 flex-1 truncate" title={ct.name}>{ct.name}</span>
													{#if ct.is_default}
														<span
															class="shrink-0 rounded border bg-muted/60 px-1 text-[9px] uppercase tracking-wider text-muted-foreground"
														>
															Default
														</span>
													{/if}
												</label>
											</li>
										{/each}
									</ul>
								{/if}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</aside>

	<div class="flex h-full flex-col overflow-hidden">
		<!-- Filter bar — search/category/date range, mirrors the case-timeline UX. -->
		<div class="flex flex-wrap items-center gap-2 border-b bg-card/20 px-4 py-2">
			<div class="relative">
				<Search class="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
				<Input
					value={filterText}
					oninput={(e) => (filterText = (e.target as HTMLInputElement).value)}
					placeholder="Search title/content/category…"
					class="h-8 w-64 pl-7 text-xs"
				/>
			</div>
			<Input
				value={filterCategory}
				oninput={(e) => (filterCategory = (e.target as HTMLInputElement).value)}
				placeholder="Category"
				class="h-8 w-36 text-xs"
			/>
			<label class="flex items-center gap-1 text-2xs text-muted-foreground">
				From
				<Input
					type="datetime-local"
					value={filterFrom}
					oninput={(e) => (filterFrom = (e.target as HTMLInputElement).value)}
					class="h-8 w-44 text-xs"
				/>
			</label>
			<label class="flex items-center gap-1 text-2xs text-muted-foreground">
				To
				<Input
					type="datetime-local"
					value={filterTo}
					oninput={(e) => (filterTo = (e.target as HTMLInputElement).value)}
					class="h-8 w-44 text-xs"
				/>
			</label>
			{#if filtersActive}
				<Button variant="ghost" size="sm" class="h-8" onclick={clearFilters}>
					<X class="mr-1 h-3 w-3" /> Clear
				</Button>
			{/if}
			<div class="ml-auto flex items-center gap-3">
				<!--
				  List / tree view toggle. Tree mode alternates root
				  events on either side of a central spine with children
				  branching off (see `timeline-view.svelte`). List mode
				  is the default because it scales better on narrow
				  screens; tree mode shines when the analyst has
				  actually structured events into parent-child chains.
				-->
				<div
					class="flex items-center rounded-md border bg-background p-0.5"
					role="group"
					aria-label="View mode"
				>
					<button
						type="button"
						class="rounded px-2 py-0.5 text-2xs font-medium transition-colors {viewMode === 'list'
							? 'bg-muted text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (viewMode = 'list')}
						aria-pressed={viewMode === 'list'}
					>
						<ListIcon class="inline h-3 w-3" /> List
					</button>
					<button
						type="button"
						class="rounded px-2 py-0.5 text-2xs font-medium transition-colors {viewMode === 'tree'
							? 'bg-muted text-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (viewMode = 'tree')}
						aria-pressed={viewMode === 'tree'}
					>
						<ListTreeIcon class="inline h-3 w-3" /> Tree
					</button>
				</div>
				<span class="text-2xs text-muted-foreground">
					{filteredEvents.length} / {events.length} events
				</span>
			</div>
		</div>

		<!--
		  Events pane. `relative` on the container so the floating
		  "Add event" FAB in the bottom-right can be positioned
		  absolutely without escaping the pane. The FAB is the
		  primary way to create events — the tiny `+` on hover next
		  to each timeline row in the sidebar is still there for
		  when the analyst wants to target a specific timeline, but
		  the FAB is the discoverable default.
		-->
		<div class="relative flex-1 overflow-y-auto p-6">
			{#if loading}
				<Skeleton class="h-32 w-full" />
			{:else if events.length === 0}
				<div
					class="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground"
				>
					<p class="text-sm">No events on the selected timelines yet.</p>
					<!--
					  Empty-state CTA. Turns a dead-end message into a
					  one-click path to the first event — matches the
					  discoverability bump the FAB provides for the
					  populated case.
					-->
					<Button onclick={openCreateEventFromFab} disabled={timelines.length === 0}>
						<Plus class="mr-1 h-4 w-4" />
						Add first event
					</Button>
				</div>
			{:else if filteredEvents.length === 0}
				<div
					class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
				>
					<p class="text-sm">No events match the current filters.</p>
				</div>
			{:else}
				<!--
				  Rendered through the shared `TimelineView` component
				  — full parity with the case-timeline layout: sticky
				  date-group headers, list-vs-tree toggle, tree spine
				  with alternating sides + L-shaped elbows for
				  children.

				  Native events get full edit/flag/duplicate/delete/
				  add-child affordances; projected case events are
				  gated to read-only inside the card.
				-->
				<TimelineView
					groups={rootEventsByDate}
					{childrenByParent}
					folded={foldedEventIds}
					selected={selectedEventIds}
					{selecting}
					mode={viewMode}
					onToggleFold={toggleFold}
					onToggleSelect={toggleSelectEvent}
					onEdit={editEventById}
					onAddChild={openCreateChildEvent}
					onFlag={flagEventById}
					onDuplicate={duplicateEventById}
					onDelete={removeEventById}
				/>
			{/if}

			<!--
			  Floating "Add event" FAB. Bottom-right, always visible
			  when the pane has events. Skipped in the empty state
			  because the empty-state CTA already handles that path
			  (avoid two competing "add" buttons visible at once).
			  Hidden if there are no timelines to add to — the empty
			  state's disabled button already communicates that state.
			-->
			{#if !loading && events.length > 0 && timelines.length > 0}
				<Button
					size="lg"
					class="fixed bottom-6 right-6 z-10 h-12 gap-2 rounded-full px-5 shadow-lg shadow-primary/25 hover:shadow-primary/40"
					onclick={openCreateEventFromFab}
					title="Add event to the timeline"
				>
					<Plus class="h-5 w-5" />
					Add event
				</Button>
			{/if}
		</div>
	</div>
</div>

<Dialog bind:open={addOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New timeline</DialogTitle>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<Input
				value={newName}
				oninput={(e) => (newName = (e.target as HTMLInputElement).value)}
				placeholder="Timeline name"
			/>
			<input
				type="color"
				bind:value={newColor}
				class="h-8 w-16 cursor-pointer rounded border bg-transparent p-0"
			/>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (addOpen = false)} disabled={saving}>Cancel</Button>
			<Button onclick={submitCreate} disabled={saving || !newName.trim()}>
				{saving ? 'Creating…' : 'Create'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<Dialog bind:open={entryOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle
				>{entryMode === 'create' ? 'New timeline entry' : 'Edit timeline entry'}</DialogTitle
			>
		</DialogHeader>
		<div class="flex flex-col gap-3 py-2">
			<Input
				value={entryTitle}
				oninput={(e) => (entryTitle = (e.target as HTMLInputElement).value)}
				placeholder="Title"
			/>
			<Input
				type="datetime-local"
				value={entryDate}
				oninput={(e) => (entryDate = (e.target as HTMLInputElement).value)}
			/>
			<div class="flex items-center gap-2">
				<Input
					value={entryCategory}
					oninput={(e) => (entryCategory = (e.target as HTMLInputElement).value)}
					placeholder="Category (optional)"
					class="flex-1"
				/>
				<input
					type="color"
					value={entryColor || '#3b82f6'}
					oninput={(e) => (entryColor = (e.target as HTMLInputElement).value)}
					class="h-8 w-12 cursor-pointer rounded border bg-transparent p-0"
					title="Event color"
				/>
				{#if entryColor}
					<Button
						size="icon"
						variant="ghost"
						class="h-8 w-8"
						onclick={() => (entryColor = '')}
						aria-label="Clear color"
					>
						<X class="h-3.5 w-3.5" />
					</Button>
				{/if}
			</div>
			<textarea
				value={entryContent}
				oninput={(e) => (entryContent = (e.target as HTMLTextAreaElement).value)}
				placeholder="Notes (optional)"
				rows="5"
				class="w-full rounded-md border bg-background p-2 text-sm"
			></textarea>
		</div>
		<DialogFooter>
			<Button variant="ghost" onclick={() => (entryOpen = false)} disabled={saving}>Cancel</Button>
			<Button onclick={submitEntry} disabled={saving || !entryTitle.trim()}>
				{saving ? 'Saving…' : entryMode === 'create' ? 'Save' : 'Update'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
