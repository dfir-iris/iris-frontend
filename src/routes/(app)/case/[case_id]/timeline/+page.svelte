<script lang="ts">
	import { page } from '$app/state';
	import TimelineTopbar from './components/timeline-topbar.svelte';
	import TimelineDetailsCard from './components/timeline-details-card.svelte';
	import TimelineSideToolbar from './components/timeline-side-toolbar.svelte';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';

	type TimelineView = 'normal' | 'tree';

	let events = $state<CaseTimelineEvent[]>([]);
	let filter = $state<string>('');
	let view = $state<TimelineView>('normal');
	let compact = $state<boolean>(false);
	let folded = $state<Set<number>>(new Set());

	const caseId = $derived(Number(page.url.searchParams.get('cid') ?? page.params.case_id));

	const filteredEvents = $derived(
		events.filter((event) => event.event_title.toLowerCase().includes(filter.toLowerCase()))
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

	const toggleView = () => {
		view = view === 'normal' ? 'tree' : 'normal';
	};

	const toggleFold = (eventId: number) => {
		const next = new Set(folded);

		if (next.has(eventId)) {
			next.delete(eventId);
		} else {
			next.add(eventId);
		}

		folded = next;
	};

	const refresh = async () => {
		console.log('refresh timeline', caseId);
	};

	const addEvent = () => {
		console.log('add event', caseId);
	};
</script>

<div class="flex h-full min-h-0 w-full flex-col bg-slate-50 dark:bg-black">
	<TimelineTopbar
		bind:filter
		{compact}
		{view}
		onRefresh={refresh}
		onAddEvent={addEvent}
		onToggleView={toggleView}
		onToggleCompact={() => (compact = !compact)}
	/>

	<div class="relative min-h-0 flex-1 overflow-auto px-6 py-6">
		<div class={view === 'tree' ? 'mx-auto max-w-5xl' : 'mx-auto max-w-6xl'}>
			<div class={view === 'tree' ? 'relative border-l-2 border-slate-900 pl-8' : 'relative'}>
				{#each rootEvents as event (event.event_id)}
					<TimelineDetailsCard
						{event}
						{compact}
						{view}
						childCount={childrenByParent.get(event.event_id)?.length ?? 0}
						folded={folded.has(event.event_id)}
						onToggleFold={() => toggleFold(event.event_id)}
					/>

					{#if !folded.has(event.event_id)}
						{#each childrenByParent.get(event.event_id) ?? [] as child (child.event_id)}
							<div class={view === 'tree' ? 'ml-8' : 'ml-10'}>
								<TimelineDetailsCard
									event={child}
									{compact}
									{view}
									childCount={0}
									folded={false}
									onToggleFold={() => toggleFold(child.event_id)}
								/>
							</div>
						{/each}
					{/if}
				{/each}
			</div>
		</div>

		<TimelineSideToolbar />
	</div>
</div>
