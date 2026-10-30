<!-- Canvas / table switch of the graph page (the canvas stays mounted under the table). -->
<script lang="ts">
	import { SplineIcon, TableIcon } from 'lucide-svelte';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';

	let { graph }: { graph: CaseGraphState } = $props();

	const modes = [
		{ value: 'canvas', label: 'Canvas', icon: SplineIcon },
		{ value: 'table', label: 'Table', icon: TableIcon }
	] as const;
</script>

<div class="inline-flex h-7 overflow-hidden rounded-md border" role="group" aria-label="Display">
	{#each modes as m (m.value)}
		<button
			type="button"
			class="flex items-center gap-1 px-2 text-xs transition-colors {graph.viewMode === m.value
				? 'bg-secondary text-secondary-foreground'
				: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
			aria-pressed={graph.viewMode === m.value}
			title={m.value === 'table' ? 'Nodes and relations as tables' : 'Graph canvas'}
			onclick={() => (graph.viewMode = m.value)}
		>
			<m.icon class="h-3.5 w-3.5" />{m.label}
		</button>
	{/each}
</div>
