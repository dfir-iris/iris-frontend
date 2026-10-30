<!-- Toolbar: opens the intelligence panels (suggestions, AI, gaps, explain) in the rail. -->
<script lang="ts">
	import { LightbulbIcon } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { INSIGHT_PANELS } from './panels';

	let { graph }: { graph: CaseGraphState } = $props();

	const panels = $derived(
		[...graph.panels.values()]
			.filter((p) => INSIGHT_PANELS.includes(p.id))
			.sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
	);

	const active = $derived(
		graph.rail?.type === 'panel' && INSIGHT_PANELS.includes(graph.rail.id) ? graph.rail.id : null
	);
</script>

{#if panels.length}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant={active ? 'secondary' : 'outline'}
					size="xs"
					title="Suggestions, gaps and AI"
				>
					<LightbulbIcon class="mr-1 h-3.5 w-3.5" />Insights
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-52">
			{#each panels as p (p.id)}
				<DropdownMenu.Item onclick={() => (graph.rail = { type: 'panel', id: p.id })}>
					{#if p.icon}
						<p.icon class="mr-2 h-4 w-4" />
					{/if}
					{p.title}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
