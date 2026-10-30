<!-- Role (source / target / involved) of each asset or IOC linked to an event. -->
<script lang="ts">
	import type { EventLinkRole } from '$lib/services/case-timeline.service';
	import { DEFAULT_EVENT_LINK_ROLE, EVENT_LINK_ROLES } from '$lib/utils/event-roles';

	type Props = {
		ids: number[];
		roles: Record<number, EventLinkRole>;
		labelOf: (id: number) => string;
		/** "asset" / "IOC", for the accessible names. */
		noun: string;
		onChange: (roles: Record<number, EventLinkRole>) => void;
	};

	let { ids, roles, labelOf, noun, onChange }: Props = $props();

	const ACTIVE: Record<EventLinkRole, string> = {
		source: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
		target: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
		involved: 'bg-muted text-foreground'
	};

	const set = (id: number, role: EventLinkRole) => onChange({ ...roles, [id]: role });
</script>

{#if ids.length}
	<ul class="mt-2 space-y-1" aria-label={`Role of each linked ${noun} in the investigation graph`}>
		{#each ids as id (id)}
			{@const current = roles[id] ?? DEFAULT_EVENT_LINK_ROLE}
			<li class="flex items-center gap-2 text-xs">
				<span class="min-w-0 flex-1 truncate" title={labelOf(id)}>{labelOf(id)}</span>
				<div
					class="inline-flex shrink-0 overflow-hidden rounded-md border"
					role="radiogroup"
					aria-label={`Role of ${noun} ${labelOf(id)}`}
				>
					{#each EVENT_LINK_ROLES as r (r.value)}
						<button
							type="button"
							role="radio"
							aria-checked={current === r.value}
							title={r.hint}
							class="px-2 py-0.5 text-2xs transition-colors {current === r.value
								? ACTIVE[r.value]
								: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
							onclick={() => set(id, r.value)}
						>
							{r.label}
						</button>
					{/each}
				</div>
			</li>
		{/each}
	</ul>
{/if}
