<script lang="ts">
	import { setContext } from 'svelte';
	import { page } from '$app/state';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import {
		CASE_TIMELINE_CTX,
		createCaseTimelineContext,
		type CaseTimelineContext
	} from '$lib/contexts/case-timeline.context.svelte';
	import TimelineTopbar from './components/timeline-topbar.svelte';
	import TimelineSideToolbar from './components/timeline-side-toolbar.svelte';
	import TimelineNormalView from './components/timeline-normal-view.svelte';
	import TimelineTreeView from './components/timeline-tree-view.svelte';

	type TimelineView = 'normal' | 'tree';

	type TimelineGroup = {
		date: string;
		events: CaseTimelineEvent[];
	};

	const timeline = createCaseTimelineContext(() => Number(page.params.case_id));

	setContext<CaseTimelineContext>(CASE_TIMELINE_CTX, timeline);

	let filter = $state<string>('');
	let view = $state<TimelineView>('normal');
	let compact = $state<boolean>(false);
	let folded = $state<Set<number>>(new Set());

	const filteredEvents = $derived(
		timeline
			.events()
			.filter((event) => event.event_title.toLowerCase().includes(filter.toLowerCase()))
	);

	const rootEvents = $derived(filteredEvents.filter((event) => !event.parent_event_id));

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
			const date = new Date(event.event_date).toLocaleDateString();

			groups.set(date, [...(groups.get(date) ?? []), event]);
		}

		return [...groups.entries()].map(([date, events]) => ({ date, events })) satisfies TimelineGroup[];
	});

	$effect(() => {
		timeline.loadEvents();
	});

	const toggleView = () => (view = view === 'normal' ? 'tree' : 'normal');

	const toggleFold = (eventId: number) => {
		const next = new Set(folded);

		if (next.has(eventId)) {
			next.delete(eventId);
		} else {
			next.add(eventId);
		}

		folded = next;
	};

	const addEvent = () => {
		console.log('add event');
	};
</script>

<div class="flex h-full min-h-0 w-full flex-col bg-slate-50 dark:bg-black">
	<TimelineTopbar
		bind:filter
		{compact}
		{view}
		onRefresh={timeline.refresh}
		onAddEvent={addEvent}
		onToggleView={toggleView}
		onToggleCompact={() => (compact = !compact)}
	/>

	<div class="relative min-h-0 flex-1 overflow-auto py-6 pl-6 pr-20">
		{#if timeline.list.status === 'loading'}
			<div class="p-6 text-sm text-muted-foreground">Loading timeline...</div>
		{:else if timeline.list.error}
			<div class="p-6 text-sm text-destructive">{timeline.list.error}</div>
		{:else if groupedRootEvents.length === 0}
			<div class="p-6 text-sm text-muted-foreground">No timeline events found.</div>
		{:else if view === 'normal'}
			<TimelineNormalView
				groups={groupedRootEvents}
				{childrenByParent}
				{compact}
				{folded}
				onToggleFold={toggleFold}
			/>
		{:else}
			<TimelineTreeView
				groups={groupedRootEvents}
				{childrenByParent}
				{compact}
				{folded}
				onToggleFold={toggleFold}
			/>
		{/if}

		<TimelineSideToolbar />
	</div>
</div>
