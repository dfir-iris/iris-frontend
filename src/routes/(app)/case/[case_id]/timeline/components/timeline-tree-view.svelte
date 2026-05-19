<script lang="ts">
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import TimelineDetailsCard from './timeline-details-card.svelte';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	type Props = {
		groups: TimelineGroup[];
		childrenByParent: Map<number, CaseTimelineEvent[]>;
		compact: boolean;
		folded: Set<number>;
		selected: Set<number>;
		selecting: boolean;
		onToggleSelect: (eventId: number) => void;
		onToggleFold: (eventId: number) => void;
		onEdit: (eventId: number) => void;
		onAddChild: (eventId: number) => void;
		onFlag: (eventId: number) => void;
		onComments: (eventId: number) => void;
		onDuplicate: (eventId: number) => void;
		onDelete: (eventId: number) => void;
		commentCounts: Record<number, number>;
	};

	let {
		groups,
		childrenByParent,
		compact,
		folded,
		selected,
		selecting,
		onToggleSelect,
		onToggleFold,
		onEdit,
		onAddChild,
		onFlag,
		onComments,
		onDuplicate,
		onDelete,
		commentCounts
	}: Props = $props();
</script>

{#snippet renderEvent(event: CaseTimelineEvent, right = true)}
	<div class={right ? 'ml-auto w-[47%]' : 'mr-auto w-[47%]'}>
		<TimelineDetailsCard
			{event}
			{compact}
			childCount={childrenByParent.get(event.event_id)?.length ?? 0}
			commentsCount={commentCounts[event.event_id] ?? 0}
			folded={folded.has(event.event_id)}
			selected={selected.has(event.event_id)}
			{selecting}
			{onToggleSelect}
			onToggleFold={() => onToggleFold(event.event_id)}
			{onEdit}
			{onAddChild}
			{onFlag}
			{onComments}
			{onDuplicate}
			{onDelete}
		/>
	</div>

	{#if !folded.has(event.event_id)}
		{#each childrenByParent.get(event.event_id) ?? [] as child (child.event_id)}
			{@render renderEvent(child, !right)}
		{/each}
	{/if}
{/snippet}

<div class="relative mx-auto max-w-5xl">
	<div class="absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-slate-900"></div>

	{#each groups as group}
		<section class="relative">
			<div
				class="sticky top-0 z-10 mx-auto mb-4 w-fit rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white"
			>
				{group.date}
			</div>

			{#each group.events as event, i (event.event_id)}
				{@render renderEvent(event, i % 2 === 0)}
			{/each}
		</section>
	{/each}
</div>
