<!-- Subtle "updated by X" note after a refetch caused by someone else (no toast). -->
<script lang="ts">
	import { RefreshCwIcon, XIcon } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { getGraphFeatures } from '../context';

	let { graph }: { graph: CaseGraphState } = $props();

	const { live } = getGraphFeatures();
</script>

<div class="pointer-events-none absolute right-2 top-2 z-10" role="status" aria-live="polite">
	{#if live.updated && graph.viewMode === 'canvas'}
		<div
			transition:fade={{ duration: 200 }}
			class="pointer-events-auto flex items-center gap-1.5 rounded-md border bg-background/85 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
		>
			<RefreshCwIcon class="h-3 w-3 {graph.refreshing ? 'animate-spin' : ''}" aria-hidden="true" />
			<span>{live.updated.text}</span>
			<button
				type="button"
				class="rounded p-0.5 hover:bg-accent hover:text-foreground"
				aria-label="Dismiss"
				onclick={() => live.dismissUpdated()}
			>
				<XIcon class="h-3 w-3" />
			</button>
		</div>
	{/if}
</div>
