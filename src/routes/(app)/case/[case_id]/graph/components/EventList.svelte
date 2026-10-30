<!-- Supporting timeline events, each linking to the event on the timeline. -->
<script lang="ts">
	import { CalendarClockIcon } from 'lucide-svelte';
	import type { GraphEvent } from '$lib/types/resources/case-graph';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { timelineEventUrl } from '../lib/model';

	interface Props {
		caseId: number;
		events: GraphEvent[];
		/** Event ids not present in the graph payload (still linked). */
		missing?: number[];
		limit?: number;
	}

	let { caseId, events, missing = [], limit = 25 }: Props = $props();

	let showAll = $state(false);

	const sorted = $derived(
		[...events].sort(
			(a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.event_id - b.event_id
		)
	);
	const shown = $derived(showAll ? sorted : sorted.slice(0, limit));
</script>

{#if !events.length && !missing.length}
	<p class="text-xs text-muted-foreground">No supporting event.</p>
{:else}
	<ul class="space-y-1">
		{#each shown as ev (ev.event_id)}
			<li>
				<a
					href={timelineEventUrl(caseId, ev.event_id)}
					class="flex items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-accent"
				>
					<CalendarClockIcon
						class="mt-0.5 h-3.5 w-3.5 shrink-0"
						style={ev.color ? `color: ${ev.color}` : undefined}
					/>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{ev.title}</span>
						<span class="block truncate text-muted-foreground">
							{ev.date ? formatDateTime(ev.date) : 'No date'}{ev.category
								? ` · ${ev.category}`
								: ''}
						</span>
					</span>
				</a>
			</li>
		{/each}
		{#each missing as id (id)}
			<li>
				<a
					href={timelineEventUrl(caseId, id)}
					class="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-accent"
				>
					<CalendarClockIcon class="h-3.5 w-3.5 shrink-0" />
					Event #{id}
				</a>
			</li>
		{/each}
	</ul>
	{#if sorted.length > limit}
		<button
			type="button"
			class="text-xs text-muted-foreground hover:text-foreground"
			onclick={() => (showAll = !showAll)}
		>
			{showAll ? 'Show less' : `Show all ${sorted.length}`}
		</button>
	{/if}
{/if}
