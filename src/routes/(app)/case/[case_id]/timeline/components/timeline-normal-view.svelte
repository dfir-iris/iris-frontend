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
		onToggleFold: (eventId: number) => void;
		onEdit: (eventId: number) => void;
	};

	let { groups, childrenByParent, compact, folded, onToggleFold, onEdit }: Props = $props();
</script>

{#snippet renderEvent(event: CaseTimelineEvent, depth = 0)}
	<div class={depth > 0 ? 'ml-8' : ''}>
		<TimelineDetailsCard
			{event}
			{compact}
			childCount={childrenByParent.get(event.event_id)?.length ?? 0}
			folded={folded.has(event.event_id)}
			onToggleFold={() => onToggleFold(event.event_id)}
			{onEdit}
		/>

		{#if !folded.has(event.event_id)}
			{#each childrenByParent.get(event.event_id) ?? [] as child (child.event_id)}
				{@render renderEvent(child, depth + 1)}
			{/each}
		{/if}
	</div>
{/snippet}

<div class="relative mx-auto max-w-5xl pl-28">
	<div class="absolute bottom-0 left-12 top-0 w-px bg-border"></div>

	{#each groups as group}
		<section class="relative">
			<div
				class="absolute -left-[7.25rem] top-1 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white"
			>
				{group.date}
			</div>

			{#each group.events as event (event.event_id)}
				{@render renderEvent(event)}
			{/each}
		</section>
	{/each}
</div>
