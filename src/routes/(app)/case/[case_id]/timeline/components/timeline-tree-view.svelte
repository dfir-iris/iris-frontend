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
				<div class={i % 2 === 0 ? 'ml-auto w-[47%]' : 'mr-auto w-[47%]'}>
					<TimelineDetailsCard
						{event}
						{compact}
						view="tree"
						childCount={childrenByParent.get(event.event_id)?.length ?? 0}
						folded={folded.has(event.event_id)}
						onToggleFold={() => onToggleFold(event.event_id)}
					/>
				</div>

				{#if !folded.has(event.event_id)}
					{#each childrenByParent.get(event.event_id) ?? [] as child (child.event_id)}
						<div class={i % 2 === 0 ? 'mr-auto w-[47%]' : 'ml-auto w-[47%]'}>
							<TimelineDetailsCard
								event={child}
								{compact}
								view="tree"
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
