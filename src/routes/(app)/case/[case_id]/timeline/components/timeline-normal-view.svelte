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
	};

	let { groups, childrenByParent, compact, folded, onToggleFold }: Props = $props();
</script>

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
				<TimelineDetailsCard
					{event}
					{compact}
					view="normal"
					childCount={childrenByParent.get(event.event_id)?.length ?? 0}
					folded={folded.has(event.event_id)}
					onToggleFold={() => onToggleFold(event.event_id)}
				/>

				{#if !folded.has(event.event_id)}
					{#each childrenByParent.get(event.event_id) ?? [] as child (child.event_id)}
						<div class="ml-8">
							<TimelineDetailsCard
								event={child}
								{compact}
								view="normal"
								childCount={0}
								folded={false}
								onToggleFold={() => onToggleFold(child.event_id)}
							/>
						</div>
					{/each}
				{/if}
			{/each}
		</section>
	{/each}
</div>
