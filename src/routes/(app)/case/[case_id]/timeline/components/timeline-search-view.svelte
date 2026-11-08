<!--
  Search view of the case timeline: a search bar compiled server-side,
  the event histogram over the matching events, and the events as log
  lines, loaded page by page as the list scrolls.

  The state lives in a `TimelineSearch` the page owns, so the sidebar
  (timelines, fields) and this view act on the same search. Everything
  that changes events — edit, delete, timeline moves — is the page's.
-->
<script lang="ts">
	import {
		ArrowUpDownIcon,
		ChevronDownIcon,
		EllipsisVerticalIcon,
		FlagIcon,
		FlagOffIcon,
		FolderInputIcon,
		FolderPlusIcon,
		RefreshCwIcon,
		SplineIcon,
		Trash2Icon,
		XIcon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import type { AlertSearchField } from '$lib/services/alerts.service';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import type { CaseTimeline } from '$lib/services/case-timelines.service';
	import type { HookOption } from '$lib/services/hooks.service';
	import { appendExpression } from '$lib/search/lucene';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { TimelineLayout } from '$lib/utils/timeline-default-view';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import LuceneSearchBar from '$lib/components/common/SearchBar/LuceneSearchBar.svelte';
	import BulkHooksMenu from '$lib/components/common/BulkHooksMenu.svelte';
	import { getGraphUrlForEvents } from '../helpers';
	import {
		ALL_TIME,
		EVENTS_DRAG_MIME,
		draggedEventIds,
		encodeDraggedEvents,
		fieldClause,
		timeRangeLabel,
		type TimeRange
	} from '../search-helpers';
	import type { TimelineSearch } from '../timeline-search.svelte';
	import TimelineHistogram from './timeline-histogram.svelte';
	import TimelineLayoutSwitch from './timeline-layout-switch.svelte';
	import TimelineSearchRow from './timeline-search-row.svelte';
	import TimelineTimeRangePicker from './timeline-time-range-picker.svelte';

	type Props = {
		search: TimelineSearch;
		caseId: number;
		/** The search vocabulary, from the events search schema. */
		searchFields: AlertSearchField[];
		timelines: CaseTimeline[];
		hookOptions?: HookOption[];
		canEdit?: boolean;
		layout: TimelineLayout;
		onLayoutChange: (layout: TimelineLayout) => void;
		onLoadFull: (eventId: number) => Promise<CaseTimelineEvent | null>;
		onEdit: (eventId: number) => void;
		onAddChild: (eventId: number) => void;
		onFlag: (eventIds: number[], flagged: boolean) => void;
		onComments: (eventId: number) => void;
		onDuplicate: (eventId: number) => void;
		onDelete: (eventIds: number[]) => void;
		onRunHook: (eventId: number, hookOption: HookOption) => void;
		onAssign: (timelineId: number, eventIds: number[], mode: 'move' | 'add') => void;
		onDownloadCsv: () => void;
		onUploadCsv: () => void;
	};

	let {
		search,
		caseId,
		searchFields,
		timelines,
		hookOptions = [],
		canEdit = true,
		layout,
		onLayoutChange,
		onLoadFull,
		onEdit,
		onAddChild,
		onFlag,
		onComments,
		onDuplicate,
		onDelete,
		onRunHook,
		onAssign,
		onDownloadCsv,
		onUploadCsv
	}: Props = $props();

	const timelinesById = $derived(new Map(timelines.map((t) => [t.timeline_id, t])));
	const loading = $derived(search.status === 'loading');
	const selectedIds = $derived([...search.selected]);
	const allSelected = $derived(
		search.events.length > 0 && search.events.every((e) => search.selected.has(e.event_id))
	);
	const someSelected = $derived(search.selected.size > 0 && !allSelected);

	let expanded = $state<Set<number>>(new Set());
	let lastClicked: number | null = null;

	// A new search starts from the top, with every row collapsed. A rerun
	// of the same one — after an edit, a move — keeps the reader's place.
	const newSearch = () => {
		expanded = new Set();
		lastClicked = null;
		scrollEl?.scrollTo({ top: 0 });
		void search.run();
	};

	const submit = (query: string) => {
		search.query = query;
		newSearch();
	};

	const setRange = (range: TimeRange) => {
		search.range = range;
		newSearch();
	};

	const addClause = (alias: string, value: string, exclude: boolean) => {
		submit(appendExpression(search.query, fieldClause(alias, value, exclude)));
	};

	const toggleOrder = () => {
		search.order = search.order === 'asc' ? 'desc' : 'asc';
		newSearch();
	};

	const rangeLabel = $derived(timeRangeLabel(search.range, (iso) => formatDateTime(iso)));

	// Whether the histogram is shown is the reader's taste, kept across
	// cases and sessions.
	const HISTOGRAM_HIDDEN_KEY = 'iris.timeline.histogram-hidden';
	let histogramHidden = $state(globalThis.localStorage?.getItem(HISTOGRAM_HIDDEN_KEY) === 'true');

	const toggleHistogram = () => {
		histogramHidden = !histogramHidden;
		if (histogramHidden) globalThis.localStorage?.setItem(HISTOGRAM_HIDDEN_KEY, 'true');
		else globalThis.localStorage?.removeItem(HISTOGRAM_HIDDEN_KEY);
	};

	// The values the bar offers after `field:` come from the field
	// summaries of the current results, plus every timeline name.
	const valuesFor = (alias: string): string[] => {
		const summary = (key: keyof typeof search.fields) =>
			(search.fields[key]?.values ?? []).map((v) => v.value).filter((v): v is string => !!v);
		switch (alias) {
			case 'category':
			case 'cat':
				return summary('category');
			case 'source':
				return summary('source');
			case 'tag':
			case 'tags':
				return summary('tag');
			case 'asset':
				return summary('asset');
			case 'ioc':
				return summary('ioc');
			case 'timeline':
				return timelines.map((t) => t.name);
			case 'author':
			case 'user':
				return summary('author');
			default:
				return [];
		}
	};

	const toggleExpanded = (eventId: number) => {
		const next = new Set(expanded);
		if (next.has(eventId)) next.delete(eventId);
		else next.add(eventId);
		expanded = next;
	};

	// Shift-click selects every loaded row between the last clicked one
	// and this one, as file lists do.
	const toggleSelect = (eventId: number, shiftKey: boolean) => {
		const ids = search.events.map((e) => e.event_id);
		const from = lastClicked === null ? -1 : ids.indexOf(lastClicked);
		const to = ids.indexOf(eventId);
		lastClicked = eventId;
		if (!shiftKey || from === -1 || to === -1) {
			search.toggleSelected(eventId);
			return;
		}
		const next = new Set(search.selected);
		const select = !next.has(eventId);
		for (const id of ids.slice(Math.min(from, to), Math.max(from, to) + 1)) {
			if (select) next.add(id);
			else next.delete(id);
		}
		search.selected = next;
	};

	const onRowDragStart = (e: DragEvent, eventId: number) => {
		if (!e.dataTransfer) return;
		const ids = draggedEventIds(eventId, search.selected);
		e.dataTransfer.setData(EVENTS_DRAG_MIME, encodeDraggedEvents(ids));
		e.dataTransfer.setData('text/plain', ids.map((id) => `#${id}`).join(' '));
		e.dataTransfer.effectAllowed = 'copyMove';

		// A whole row is a large, noisy ghost; a small badge says what
		// is being carried.
		const badge = document.createElement('div');
		badge.textContent = ids.length === 1 ? '1 event' : `${ids.length} events`;
		badge.style.cssText =
			'position:fixed;top:-100px;left:0;padding:2px 8px;border-radius:9999px;font:600 12px sans-serif;background:#2563eb;color:#fff;';
		document.body.appendChild(badge);
		e.dataTransfer.setDragImage(badge, 0, 0);
		setTimeout(() => badge.remove(), 0);
	};

	// Keep loading as the end of the list comes into view.
	let scrollEl = $state<HTMLDivElement | null>(null);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!scrollEl || !sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && search.hasMore) {
					void search.loadMore();
				}
			},
			{ root: scrollEl, rootMargin: '600px 0px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!--
	  The search bar may grow a message line under it, so the row aligns
	  to the top and every other control sits in a band as tall as the bar.
	-->
	<div class="flex items-start gap-2 border-b border-border bg-card px-4 py-2">
		<div class="flex h-10 shrink-0 items-center gap-2">
			<h2 class="mr-1 text-sm font-semibold">Timeline</h2>
			<TimelineLayoutSwitch {layout} onChange={onLayoutChange} />
		</div>

		<LuceneSearchBar
			class="min-w-0 flex-1"
			value={search.query}
			onSubmit={submit}
			fields={searchFields}
			{valuesFor}
			serverError={search.searchError}
			historyKey="iris.timeline.recent-queries"
			placeholder="Search events — try  asset:DC01 is:flagged"
		/>

		<div class="flex h-10 shrink-0 items-center gap-2">
			<TimelineTimeRangePicker range={search.range} onChange={setRange} />

			<Button
				variant="outline"
				size="sm"
				class="h-8 shrink-0 gap-1.5 text-xs"
				onclick={toggleOrder}
				title="Change the order"
			>
				<ArrowUpDownIcon class="size-3.5" />
				{search.order === 'asc' ? 'Oldest first' : 'Newest first'}
			</Button>

			<Button
				size="sm"
				class="h-8 shrink-0 gap-1.5 text-xs"
				disabled={loading}
				onclick={() => void search.run()}
			>
				<RefreshCwIcon class={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
				Search
			</Button>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button variant="ghost" size="icon" class="size-8" aria-label="More">
						<EllipsisVerticalIcon class="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onclick={onDownloadCsv}>Download results as CSV…</DropdownMenuItem>
					{#if canEdit}
						<DropdownMenuItem onclick={onUploadCsv}>Upload CSV of events</DropdownMenuItem>
					{/if}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	</div>

	<TimelineHistogram
		histogram={search.histogram}
		{loading}
		{rangeLabel}
		onZoom={({ start, end }) => setRange({ kind: 'custom', start, end })}
		onClearRange={() => setRange(ALL_TIME)}
		collapsed={histogramHidden}
		onToggleCollapsed={toggleHistogram}
	/>

	{#if search.selected.size}
		<div
			class="flex flex-wrap items-center gap-1.5 border-b border-border bg-amber-500/5 px-4 py-1.5 text-xs"
		>
			<span class="mr-1 font-medium tabular-nums">{search.selected.size} selected</span>

			{#if canEdit}
				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button size="xs" variant="outline" disabled={!timelines.length}>
							<FolderInputIcon class="mr-1 size-3" /> Move to <ChevronDownIcon size={12} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" class="max-h-72 overflow-y-auto">
						{#each timelines as t (t.timeline_id)}
							<DropdownMenuItem onclick={() => onAssign(t.timeline_id, selectedIds, 'move')}>
								{#if t.color}
									<span
										class="mr-2 size-2 rounded-full"
										style="background-color: {t.color}"
										aria-hidden="true"
									></span>
								{/if}
								{t.name}
							</DropdownMenuItem>
						{/each}
					</DropdownMenuContent>
				</DropdownMenu>

				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button size="xs" variant="outline" disabled={!timelines.length}>
							<FolderPlusIcon class="mr-1 size-3" /> Add to <ChevronDownIcon size={12} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" class="max-h-72 overflow-y-auto">
						{#each timelines as t (t.timeline_id)}
							<DropdownMenuItem onclick={() => onAssign(t.timeline_id, selectedIds, 'add')}>
								{#if t.color}
									<span
										class="mr-2 size-2 rounded-full"
										style="background-color: {t.color}"
										aria-hidden="true"
									></span>
								{/if}
								{t.name}
							</DropdownMenuItem>
						{/each}
					</DropdownMenuContent>
				</DropdownMenu>

				<Button size="xs" variant="outline" onclick={() => onFlag(selectedIds, true)}>
					<FlagIcon class="mr-1 size-3" /> Flag
				</Button>
				<Button size="xs" variant="outline" onclick={() => onFlag(selectedIds, false)}>
					<FlagOffIcon class="mr-1 size-3" /> Unflag
				</Button>

				<BulkHooksMenu hookType="event" {caseId} targets={selectedIds} options={hookOptions} />
			{/if}

			<Button size="xs" variant="outline" onclick={() => goto(getGraphUrlForEvents(selectedIds))}>
				<SplineIcon class="mr-1 size-3" /> Show in graph
			</Button>

			{#if canEdit}
				<Button size="xs" variant="destructive" onclick={() => onDelete(selectedIds)}>
					<Trash2Icon class="mr-1 size-3" /> Delete
				</Button>
			{/if}

			<Button size="xs" variant="ghost" class="ml-auto" onclick={() => search.clearSelection()}>
				<XIcon class="mr-1 size-3" /> Clear
			</Button>
		</div>
	{/if}

	<div
		class="grid grid-cols-[1.75rem_1.25rem_8.5rem_minmax(0,1fr)] items-center gap-x-1 border-b border-border bg-muted/30 py-1 pl-2 pr-3 text-2xs font-medium uppercase tracking-wider text-muted-foreground"
	>
		<Checkbox
			checked={allSelected}
			indeterminate={someSelected}
			disabled={!search.events.length}
			onclick={(e: MouseEvent) => {
				e.preventDefault();
				search.toggleSelectAll();
			}}
			aria-label="Select every loaded event"
		/>
		<span></span>
		<span>Time</span>
		<span class="flex items-center justify-between">
			Event
			{#if search.total !== null}
				<span class="normal-case tabular-nums tracking-normal">
					{search.events.length.toLocaleString()} of {search.total.toLocaleString()}
				</span>
			{/if}
		</span>
	</div>

	<div bind:this={scrollEl} class={['min-h-0 flex-1 overflow-y-auto', loading && 'opacity-60']}>
		{#if search.status === 'error' && !search.events.length}
			<div class="px-4 py-10 text-center text-xs text-muted-foreground">
				{search.searchError ? 'The search could not be read — see the search bar.' : search.error}
			</div>
		{:else if !search.events.length && !loading && search.total !== null}
			<div class="px-4 py-10 text-center text-xs text-muted-foreground">
				No event matches this search.
			</div>
		{:else}
			{#each search.events as event (event.event_id)}
				<TimelineSearchRow
					{event}
					{timelinesById}
					{canEdit}
					{hookOptions}
					expanded={expanded.has(event.event_id)}
					selected={search.selected.has(event.event_id)}
					onToggleExpand={() => toggleExpanded(event.event_id)}
					onToggleSelect={(shiftKey) => toggleSelect(event.event_id, shiftKey)}
					onDragStart={(e) => onRowDragStart(e, event.event_id)}
					onClause={addClause}
					{onLoadFull}
					{onEdit}
					{onAddChild}
					onFlag={(id, flagged) => onFlag([id], flagged)}
					{onComments}
					{onDuplicate}
					onDelete={(id) => onDelete([id])}
					{onRunHook}
				/>
			{/each}
		{/if}

		<div bind:this={sentinelEl} class="h-px"></div>

		{#if search.status === 'loading_more'}
			<div class="py-3 text-center text-2xs text-muted-foreground">Loading more events…</div>
		{:else if search.events.length && !search.hasMore && search.total !== null}
			<div class="py-3 text-center text-2xs text-muted-foreground">End of results</div>
		{/if}
	</div>
</div>
