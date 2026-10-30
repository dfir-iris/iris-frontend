<!-- Toolbar toggle of the time bar; highlighted while a range or a replay filters the graph. -->
<script lang="ts">
	import { HistoryIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { getGraphFeatures } from '../context';

	let { graph: _graph }: { graph: CaseGraphState } = $props();

	const { time } = getGraphFeatures();
</script>

<Button
	variant={time.open || time.active ? 'secondary' : 'outline'}
	size="xs"
	title={time.bounds ? 'Time slider and replay' : 'No dated relation to slide over'}
	aria-pressed={time.open}
	disabled={!time.bounds && !time.active}
	onclick={() => (time.open = !time.open)}
>
	<HistoryIcon class="mr-1 h-3.5 w-3.5" />Time
	{#if time.active}
		<span class="ml-1 h-1.5 w-1.5 rounded-full bg-primary" aria-label="Time filter active"></span>
	{/if}
</Button>
