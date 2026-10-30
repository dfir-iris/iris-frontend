<!-- Chip shown while a `?focus=` / `?events=` link highlights part of the graph. -->
<script lang="ts">
	import { LinkIcon, XIcon } from 'lucide-svelte';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { getGraphFeatures } from '../context';

	let { graph }: { graph: CaseGraphState } = $props();

	const { deepLink } = getGraphFeatures();

	const count = $derived(deepLink.resolved?.nodes.size ?? 0);
	const what = $derived(
		deepLink.target.events.length
			? `${deepLink.target.events.length} timeline event${deepLink.target.events.length > 1 ? 's' : ''}`
			: `${deepLink.target.focus.length} linked object${deepLink.target.focus.length > 1 ? 's' : ''}`
	);
</script>

{#if deepLink.resolved}
	<div
		class="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border bg-background/90 px-2 py-1 text-xs shadow-sm backdrop-blur"
		role="status"
	>
		<LinkIcon class="h-3.5 w-3.5 text-primary" />
		{#if count}
			<span>{what}: {count} object{count > 1 ? 's' : ''} highlighted</span>
			<button
				type="button"
				class="rounded px-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
				onclick={() => graph.fit([...(deepLink.resolved?.nodes ?? [])])}
			>
				Fit
			</button>
		{:else}
			<span class="text-muted-foreground">{what}: nothing of it is in the graph</span>
		{/if}
		<button
			type="button"
			class="rounded p-0.5 hover:bg-accent"
			aria-label="Clear the highlight"
			onclick={() => deepLink.clear()}
		>
			<XIcon class="h-3 w-3" />
		</button>
	</div>
{/if}
