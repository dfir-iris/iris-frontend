<script lang="ts">
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import TimelineEventCard from './timeline-event-card.svelte';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	type Props = {
		groups: TimelineGroup[];
		childrenByParent: Map<number, CaseTimelineEvent[]>;
		commentCounts: Record<number, number>;
		folded: Set<number>;
		selected: Set<number>;
		selecting: boolean;
		mode: 'list' | 'tree';
		matchedEventIds?: Set<number>;
		currentMatchEventId?: number | null;
		searchQuery?: string;
		onToggleSelect: (eventId: number) => void;
		onToggleFold: (eventId: number) => void;
		onEdit: (eventId: number) => void;
		onAddChild: (eventId: number) => void;
		onFlag: (eventId: number) => void;
		onComments: (eventId: number) => void;
		onDuplicate: (eventId: number) => void;
		onDelete: (eventId: number) => void;
	};

	let {
		groups,
		childrenByParent,
		commentCounts,
		folded,
		selected,
		selecting,
		mode,
		matchedEventIds = new Set<number>(),
		currentMatchEventId = null,
		searchQuery = '',
		onToggleSelect,
		onToggleFold,
		onEdit,
		onAddChild,
		onFlag,
		onComments,
		onDuplicate,
		onDelete
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

	// Tree mode: roots alternate sides of a central spine. Each root carries
	// a stable side index across the full timeline (not per-group) so the
	// alternation reads continuously when you scroll through dated sections.
	const rootIndex = $derived.by(() => {
		const idx = new Map<number, number>();
		let i = 0;
		for (const g of groups) for (const e of g.events) idx.set(e.event_id, i++);
		return idx;
	});

	const sideFor = (rootId: number): 'left' | 'right' =>
		(rootIndex.get(rootId) ?? 0) % 2 === 0 ? 'left' : 'right';
</script>

{#snippet listEvent(event: CaseTimelineEvent, isLast: boolean)}
	{@const children = childrenByParent.get(event.event_id) ?? []}
	{@const childrenVisible = !folded.has(event.event_id) && children.length > 0}

	<TimelineEventCard
		{event}
		childCount={children.length}
		commentsCount={commentCounts[event.event_id] ?? 0}
		folded={folded.has(event.event_id)}
		selected={selected.has(event.event_id)}
		{selecting}
		isLast={isLast && !childrenVisible}
		showRail={true}
		matched={matchedEventIds.has(event.event_id)}
		isCurrentMatch={currentMatchEventId === event.event_id}
			{searchQuery}
		{onToggleSelect}
		onToggleFold={() => onToggleFold(event.event_id)}
		{onEdit}
		{onAddChild}
		{onFlag}
		{onComments}
		{onDuplicate}
		{onDelete}
	/>

	{#if childrenVisible}
		{#each children as child, i (child.event_id)}
			{@render listEvent(child, isLast && i === children.length - 1)}
		{/each}
	{/if}
{/snippet}

<!--
  Tree-side root: the card sits on its assigned side of the spine and a
  short horizontal branch connects it to the central rail. Children render
  immediately below on the same side, indented further, joined by L-shaped
  elbows so the branch structure stays legible.
-->
{#snippet treeChild(event: CaseTimelineEvent, side: 'left' | 'right', depth: number, isLastSibling: boolean)}
	{@const children = childrenByParent.get(event.event_id) ?? []}
	{@const childrenVisible = !folded.has(event.event_id) && children.length > 0}

	<div class="relative {side === 'left' ? 'pr-7' : 'pl-7'}">
		<!-- elbow connecting this child to its parent -->
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
			commentsCount={commentCounts[event.event_id] ?? 0}
			folded={folded.has(event.event_id)}
			selected={selected.has(event.event_id)}
			{selecting}
			isLast={false}
			showRail={false}
			matched={matchedEventIds.has(event.event_id)}
			isCurrentMatch={currentMatchEventId === event.event_id}
			{searchQuery}
			{onToggleSelect}
			onToggleFold={() => onToggleFold(event.event_id)}
			{onEdit}
			{onAddChild}
			{onFlag}
			{onComments}
			{onDuplicate}
			{onDelete}
		/>

		{#if childrenVisible}
			{#each children as gc, i (gc.event_id)}
				{@render treeChild(gc, side, depth + 1, i === children.length - 1)}
			{/each}
		{/if}
	</div>
{/snippet}

{#snippet treeRoot(event: CaseTimelineEvent)}
	{@const side = sideFor(event.event_id)}
	{@const children = childrenByParent.get(event.event_id) ?? []}
	{@const childrenVisible = !folded.has(event.event_id) && children.length > 0}

	<div class="relative grid grid-cols-2 gap-0">
		<!-- branch from spine to the side that holds the card -->
		{#if side === 'left'}
			<div class="relative pr-6">
				<!-- horizontal branch tying this card to the spine -->
				<span aria-hidden="true" class="absolute right-0 top-6 h-px w-6 bg-border dark:bg-slate-700"></span>

				<TimelineEventCard
					{event}
					childCount={children.length}
					commentsCount={commentCounts[event.event_id] ?? 0}
					folded={folded.has(event.event_id)}
					selected={selected.has(event.event_id)}
					{selecting}
					isLast={false}
					showRail={false}
					matched={matchedEventIds.has(event.event_id)}
					isCurrentMatch={currentMatchEventId === event.event_id}
			{searchQuery}
					{onToggleSelect}
					onToggleFold={() => onToggleFold(event.event_id)}
					{onEdit}
					{onAddChild}
					{onFlag}
					{onComments}
					{onDuplicate}
					{onDelete}
				/>

				{#if childrenVisible}
					<div class="mt-2 space-y-2">
						{#each children as child, i (child.event_id)}
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
					commentsCount={commentCounts[event.event_id] ?? 0}
					folded={folded.has(event.event_id)}
					selected={selected.has(event.event_id)}
					{selecting}
					isLast={false}
					showRail={false}
					matched={matchedEventIds.has(event.event_id)}
					isCurrentMatch={currentMatchEventId === event.event_id}
			{searchQuery}
					{onToggleSelect}
					onToggleFold={() => onToggleFold(event.event_id)}
					{onEdit}
					{onAddChild}
					{onFlag}
					{onComments}
					{onDuplicate}
					{onDelete}
				/>

				{#if childrenVisible}
					<div class="mt-2 space-y-2">
						{#each children as child, i (child.event_id)}
							{@render treeChild(child, side, 1, i === children.length - 1)}
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		<!-- dot on the spine, aligned with the card's time row -->
		<span
			aria-hidden="true"
			class="absolute left-1/2 top-5 size-3 -translate-x-1/2 rounded-full bg-primary ring-4 ring-background"
		></span>
	</div>
{/snippet}

{#if mode === 'tree'}
	<div class="relative mx-auto w-full max-w-[1400px]">
		<!-- central vertical spine running the full height of the tree -->
		<span aria-hidden="true" class="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border dark:bg-slate-700"></span>

		{#each groups as group (group.date)}
			<section class="relative">
				<div
					class="sticky top-0 z-10 mx-auto mb-3 flex w-fit items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs font-semibold backdrop-blur supports-[backdrop-filter]:bg-background/70"
				>
					{formatGroupDate(group.date)}
				</div>

				<div class="space-y-3">
					{#each group.events as event (event.event_id)}
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

				{#each group.events as event, ei (event.event_id)}
					{@const isLast = gi === groups.length - 1 && ei === group.events.length - 1}
					{@render listEvent(event, isLast)}
				{/each}
			</section>
		{/each}
	</div>
{/if}
