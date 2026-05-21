<script lang="ts">
	import { setContext } from 'svelte';
	import type { TimelineOptions } from 'vis-timeline';
	import { page } from '$app/state';
	import VisTimeline, {
		type VisTimelineGroup,
		type VisTimelineItem
	} from '$lib/components/common/VisTimeline.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import {
		CASE_TIMELINE_CTX,
		createCaseTimelineContext,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import { visualize } from './helpers';

	type GroupBy = 'none' | 'asset' | 'category';

	const timeline = createCaseTimelineContext(() => Number(page.params.case_id));

	setContext<CaseTimelineContext>(CASE_TIMELINE_CTX, timeline);

	const groupBy = $derived.by<GroupBy>(() => {
		const value = page.url.searchParams.get('group_by');

		return value === 'asset' || value === 'category' ? value : 'none';
	});

	const visibleEvents = $derived(timeline.events().filter((event) => event.event_in_summary));

	const timelineOptions: TimelineOptions = {
		stack: true,
		zoomable: true,
		moveable: true,
		height: '100%'
	};

	const timelineDate = (value: string) => value.replace(/\.(\d{3})\d+$/, '.$1');

	const titleFor = (event: CaseTimelineEvent) =>
		`${timelineDate(event.event_date)}\n${event.event_content ?? ''}`;

	const styleFor = (event: CaseTimelineEvent) =>
		event.event_color ? `background-color: ${event.event_color};` : undefined;

	const addGroup = (groups: Map<string, VisTimelineGroup>, name: string) => {
		if (groups.has(name)) return;

		groups.set(name, {
			id: name,
			content: name
		});
	};

	const visualizationData = $derived.by(() => {
		const groups = new Map<string, VisTimelineGroup>();
		const items: VisTimelineItem[] = [];

		for (const event of visibleEvents) {
			const start = timelineDate(event.event_date);

			if (groupBy === 'asset') {
				for (const asset of event.assets ?? []) {
					addGroup(groups, asset.name);

					items.push({
						id: `${event.event_id}-${asset.name}`,
						group: asset.name,
						start,
						content: event.event_title,
						title: titleFor(event),
						style: styleFor(event)
					});
				}

				continue;
			}

			const group = event.category_name ?? 'Uncategorized';

			if (groupBy === 'category') {
				addGroup(groups, group);
			}

			items.push({
				id: String(event.event_id),
				group: groupBy === 'category' ? group : undefined,
				start,
				content: event.event_title,
				title: titleFor(event),
				style: styleFor(event)
			});
		}

		return {
			items,
			groups: [...groups.values()]
		};
	});

	$effect(() => {
		timeline.loadEvents({}, { fetch });
	});
</script>

<div class="flex h-full min-h-0 w-full flex-col bg-slate-50 dark:bg-black">
	<div class="flex shrink-0 items-center gap-2 bg-primary px-6 py-3">
		<Button
			variant={groupBy === 'none' ? 'secondary' : 'ghost'}
			size="sm"
			class={groupBy === 'none' ? '' : 'text-white hover:bg-white/10 hover:text-white'}
			onclick={() => visualize()}
		>
			No group
		</Button>

		<Button
			variant={groupBy === 'asset' ? 'secondary' : 'ghost'}
			size="sm"
			class={groupBy === 'asset' ? '' : 'text-white hover:bg-white/10 hover:text-white'}
			onclick={() => visualize('asset')}
		>
			Group by asset
		</Button>

		<Button
			variant={groupBy === 'category' ? 'secondary' : 'ghost'}
			size="sm"
			class={groupBy === 'category' ? '' : 'text-white hover:bg-white/10 hover:text-white'}
			onclick={() => visualize('category')}
		>
			Group by category
		</Button>

		<Button
			class="ml-auto text-white hover:bg-white/10 hover:text-white"
			variant="ghost"
			size="sm"
			onclick={() => timeline.refresh({}, { fetch })}
		>
			Refresh
		</Button>
	</div>

	<Card.Root class="m-4">
		<Card.Content class="h-full min-h-[500px]">
			{#if timeline.list.status === 'loading'}
				<div class="p-6 text-sm text-muted-foreground">Loading visualization...</div>
			{:else if timeline.list.error}
				<div class="p-6 text-sm text-destructive">{timeline.list.error}</div>
			{:else if visibleEvents.length === 0}
				<div class="p-6 text-sm text-muted-foreground">No events in summary.</div>
			{:else if visualizationData.items.length === 0}
				<div class="p-6 text-sm text-muted-foreground">No events for this grouping.</div>
			{:else}
				<VisTimeline
					items={visualizationData.items}
					groups={visualizationData.groups}
					options={timelineOptions}
					className="w-full h-full"
				/>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
