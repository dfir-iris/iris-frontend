<!--
  War-room timeline view. Structural mirror of the case-timeline
  `timeline-view.svelte` — same list-vs-tree rendering, same sticky
  date-group headers, same alternating-side spine for tree mode.

  Field-name adaptations for the war-room event shape:
    * `event.event_id` → `event.id` (numeric or synthetic string for
      projected case events)
    * No `commentsCount` — war-room chat plays the per-event-comments
      role, so this pane doesn't surface comments per event.

  The `childrenByParent` map is keyed on `id` — numeric for native
  events, string for projected. Projected events never have children
  in the war-room view (the projection layer sets `parent_id=null`
  on every case-sourced row) so the map's numeric keys are always
  sufficient for tree rendering.
-->
<script lang="ts">
	import type { WarRoomTimelineEvent } from '$lib/services/war-room-timelines.service';
	import TimelineEventCard from './timeline-event-card.svelte';

	type EventId = number | string;

	type TimelineGroup = {
		date: string;
		events: WarRoomTimelineEvent[];
	};

	type Props = {
		groups: TimelineGroup[];
		childrenByParent: Map<EventId, WarRoomTimelineEvent[]>;
		folded: Set<EventId>;
		selected: Set<EventId>;
		selecting: boolean;
		mode: 'list' | 'tree';
		matchedEventIds?: Set<EventId>;
		currentMatchEventId?: EventId | null;
		searchQuery?: string;
		onToggleSelect: (eventId: EventId) => void;
		onToggleFold: (eventId: EventId) => void;
		onEdit: (eventId: EventId) => void;
		onAddChild: (eventId: EventId) => void;
		onFlag: (eventId: EventId) => void;
		onDuplicate: (eventId: EventId) => void;
		onDelete: (eventId: EventId) => void;
		canEdit?: boolean;
	};

	let {
		groups,
		childrenByParent,
		folded,
		selected,
		selecting,
		mode,
		matchedEventIds = new Set<EventId>(),
		currentMatchEventId = null,
		searchQuery = '',
		onToggleSelect,
		onToggleFold,
		onEdit,
		onAddChild,
		onFlag,
		onDuplicate,
		onDelete,
		canEdit = true
	}: Props = $props();

	const formatGroupDate = (raw: string) => {
		const d = new Date(raw);
		if (isNaN(d.getTime())) return raw;

		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(today.getDate() - 1);

		const isSameDay = (a: Date, b: Date) =>
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();

		const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
		const monthDay = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		const year = d.getFullYear() !== today.getFullYear() ? `, ${d.getFullYear()}` : '';

		if (isSameDay(d, today)) return `Today · ${monthDay}${year}`;
		if (isSameDay(d, yesterday)) return `Yesterday · ${monthDay}${year}`;
		return `${weekday}, ${monthDay}${year}`;
	};

	// Tree mode: roots alternate sides of a central spine. Each root
	// carries a stable side index across the full timeline (not per-group)
	// so the alternation reads continuously when you scroll through
	// dated sections.
	const rootIndex = $derived.by(() => {
		const idx = new Map<EventId, number>();
		let i = 0;
		for (const g of groups) for (const e of g.events) idx.set(e.id, i++);
		return idx;
	});

	const sideFor = (rootId: EventId): 'left' | 'right' =>
		(rootIndex.get(rootId) ?? 0) % 2 === 0 ? 'left' : 'right';
</script>

{#snippet listEvent(event: WarRoomTimelineEvent, isLast: boolean)}
	{@const children = childrenByParent.get(event.id) ?? []}
	{@const childrenVisible = !folded.has(event.id) && children.length > 0}

	<TimelineEventCard
		{event}
		childCount={children.length}
		folded={folded.has(event.id)}
		selected={selected.has(event.id)}
		{selecting}
		isLast={isLast && !childrenVisible}
		showRail={true}
		matched={matchedEventIds.has(event.id)}
		isCurrentMatch={currentMatchEventId === event.id}
		{searchQuery}
		{onToggleSelect}
		onToggleFold={() => onToggleFold(event.id)}
		{onEdit}
		{onAddChild}
		{onFlag}
		{onDuplicate}
		{onDelete}
		{canEdit}
	/>

	{#if childrenVisible}
		{#each children as child, i (child.id)}
			{@render listEvent(child, isLast && i === children.length - 1)}
		{/each}
	{/if}
{/snippet}

<!--
  Tree-side child: sits on its parent's side of the spine, joined by
  L-shaped elbows so the branch structure stays legible.
-->
{#snippet treeChild(event: WarRoomTimelineEvent, side: 'left' | 'right', depth: number, isLastSibling: boolean)}
	{@const children = childrenByParent.get(event.id) ?? []}
	{@const childrenVisible = !folded.has(event.id) && children.length > 0}

	<div class="relative {side === 'left' ? 'pr-7' : 'pl-7'}">
		<span
			aria-hidden="true"
			class="absolute top-0 w-px bg-border dark:bg-slate-700"
			style="{side === 'left' ? 'right: 12px;' : 'left: 12px;'} height: {isLastSibling ? '24px' : '100%'}"
		></span>
		<span
			aria-hidden="true"
			class="absolute top-6 h-px w-5 bg-border dark:bg-slate-700"
			style="{side === 'left' ? 'right: 12px;' : 'left: 12px;'}"
		></span>

		<TimelineEventCard
			{event}
			childCount={children.length}
			folded={folded.has(event.id)}
			selected={selected.has(event.id)}
			{selecting}
			isLast={false}
			showRail={false}
			matched={matchedEventIds.has(event.id)}
			isCurrentMatch={currentMatchEventId === event.id}
			{searchQuery}
			{onToggleSelect}
			onToggleFold={() => onToggleFold(event.id)}
			{onEdit}
			{onAddChild}
			{onFlag}
			{onDuplicate}
			{onDelete}
			{canEdit}
		/>

		{#if childrenVisible}
			{#each children as gc, i (gc.id)}
				{@render treeChild(gc, side, depth + 1, i === children.length - 1)}
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet treeRoot(event: WarRoomTimelineEvent)}
	{@const side = sideFor(event.id)}
	{@const children = childrenByParent.get(event.id) ?? []}
	{@const childrenVisible = !folded.has(event.id) && children.length > 0}

	<div class="relative grid grid-cols-2 gap-0">
		{#if side === 'left'}
			<div class="relative pr-6">
				<span aria-hidden="true" class="absolute right-0 top-6 h-px w-6 bg-border dark:bg-slate-700"></span>

				<TimelineEventCard
					{event}
					childCount={children.length}
					folded={folded.has(event.id)}
					selected={selected.has(event.id)}
					{selecting}
					isLast={false}
					showRail={false}
					matched={matchedEventIds.has(event.id)}
					isCurrentMatch={currentMatchEventId === event.id}
					{searchQuery}
					{onToggleSelect}
					onToggleFold={() => onToggleFold(event.id)}
					{onEdit}
					{onAddChild}
					{onFlag}
					{onDuplicate}
					{onDelete}
					{canEdit}
				/>

				{#if childrenVisible}
					<div class="mt-2 space-y-2">
						{#each children as child, i (child.id)}
							{@render treeChild(child, side, 1, i === children.length - 1)}
						{/each}
					</div>
				{/if}
			</div>
			<div></div>
		{:else}
			<div></div>
			<div class="relative pl-6">
				<span aria-hidden="true" class="absolute left-0 top-6 h-px w-6 bg-border dark:bg-slate-700"></span>

				<TimelineEventCard
					{event}
					childCount={children.length}
					folded={folded.has(event.id)}
					selected={selected.has(event.id)}
					{selecting}
					isLast={false}
					showRail={false}
					matched={matchedEventIds.has(event.id)}
					isCurrentMatch={currentMatchEventId === event.id}
					{searchQuery}
					{onToggleSelect}
					onToggleFold={() => onToggleFold(event.id)}
					{onEdit}
					{onAddChild}
					{onFlag}
					{onDuplicate}
					{onDelete}
					{canEdit}
				/>

				{#if childrenVisible}
					<div class="mt-2 space-y-2">
						{#each children as child, i (child.id)}
							{@render treeChild(child, side, 1, i === children.length - 1)}
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<span
			aria-hidden="true"
			class="absolute left-1/2 top-5 size-3 -translate-x-1/2 rounded-full bg-primary ring-4 ring-background"
		></span>
	</div>
{/snippet}

{#if mode === 'tree'}
	<div class="relative mx-auto w-full max-w-[1400px]">
		<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border dark:bg-slate-700"></span>

		{#each groups as group (group.date)}
			<section class="relative">
				<div
					class="sticky top-0 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/70"
				>
					{formatGroupDate(group.date)}
				</div>

				<div class="space-y-3">
					{#each group.events as event (event.id)}
						{@render treeRoot(event)}
					{/each}
				</div>
			</section>
		{/each}
	</div>
{:else}
	<div class="mx-auto w-full max-w-[1100px]">
		{#each groups as group, gi (group.date)}
			<section class="relative">
				<div
					class="sticky top-0 z-10 -mx-2 mb-2 flex items-center gap-2 bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70"
				>
					<div class="h-px flex-1 bg-border dark:bg-slate-700"></div>
					<div class="rounded-full border border-border bg-muted px-3 py-0.5 text-xs font-semibold text-foreground">
						{formatGroupDate(group.date)}
					</div>
					<div class="h-px flex-1 bg-border dark:bg-slate-700"></div>
				</div>

				{#each group.events as event, ei (event.id)}
					{@const isLast = gi === groups.length - 1 && ei === group.events.length - 1}
					{@render listEvent(event, isLast)}
				{/each}
			</section>
		{/each}
	</div>
{/if}
