<!-- Legend: node kinds, relation types, line styles and the active overlays. -->
<script lang="ts">
	import { mode } from 'mode-watcher';
	import { XIcon } from 'lucide-svelte';
	import { paletteHex } from '$lib/components/common/CytoscapeGraph';
	import type { GraphNodeKind } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import { KIND_LABEL } from '../lib/model';
	import NodeKindIcon from './NodeKindIcon.svelte';

	interface Props {
		graph: CaseGraphState;
		onClose: () => void;
	}

	let { graph, onClose }: Props = $props();

	const isDark = $derived($mode === 'dark');

	const kinds = $derived(
		[...new Set(graph.nodes.filter((n) => graph.isVisible(n.key)).map((n) => n.kind))].sort()
	);

	const usedRelations = $derived.by(() => {
		const used = new Set(
			graph.edges.filter((e) => graph.visibility.edges.has(e.key)).map((e) => e.relation.name)
		);
		return graph.relationTypes.filter((r) => used.has(r.name));
	});

	const stroke = (style: 'solid' | 'dashed' | 'dotted', color: string) =>
		`border-top: 2px ${style} ${color};`;
	const neutral = $derived(isDark ? '#cbd5e1' : '#475569');
	const amber = $derived(paletteHex('amber', isDark));
	const red = $derived(paletteHex('red', isDark));
</script>

<div
	class="w-64 rounded-lg border bg-card/95 p-3 text-xs shadow-lg backdrop-blur"
	role="region"
	aria-label="Legend"
>
	<div class="mb-2 flex items-center">
		<h2 class="flex-1 font-semibold">Legend</h2>
		<button
			type="button"
			class="rounded p-0.5 text-muted-foreground hover:bg-accent"
			aria-label="Close the legend"
			onclick={onClose}
		>
			<XIcon class="h-3.5 w-3.5" />
		</button>
	</div>

	<div class="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
		{#if kinds.length}
			<section>
				<h3 class="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Objects</h3>
				<ul class="grid grid-cols-2 gap-1">
					{#each kinds as k (k)}
						<li class="flex items-center gap-1.5">
							<NodeKindIcon kind={k} class="h-3.5 w-3.5" />{KIND_LABEL[k as GraphNodeKind]}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section>
			<h3 class="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Relations</h3>
			<ul class="space-y-1">
				<li class="flex items-center gap-2">
					<span class="w-6" style={stroke('solid', neutral)}></span>Stored (analyst, module, import)
				</li>
				<li class="flex items-center gap-2">
					<span class="w-6" style={stroke('dashed', neutral)}></span>Derived from the timeline
				</li>
				<li class="flex items-center gap-2">
					<span class="w-6" style={stroke('dotted', amber)}></span>Pending review (AI / suggestion)
				</li>
				<li class="flex items-center gap-2">
					<span class="w-6 border-t-[5px]" style="border-color: {neutral}"></span>Thicker = more
					events
				</li>
				<li class="flex items-center gap-2">
					<span
						class="inline-flex h-4 min-w-6 items-center justify-center rounded-full border px-1 text-[9px]"
						>×3</span
					>Bundled parallel relations
				</li>
			</ul>
			{#if usedRelations.length}
				<ul class="mt-2 grid grid-cols-2 gap-1">
					{#each usedRelations as r (r.id)}
						<li class="flex items-center gap-1.5" title={r.description ?? r.name}>
							<span class="w-4 shrink-0" style={stroke(r.line_style, paletteHex(r.color, isDark))}
							></span>
							<span class="truncate">{r.label}{r.directed ? ' →' : ''}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section>
			<h3 class="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Overlays</h3>
			<ul class="space-y-1">
				{#if graph.overlays.compromise}
					<li class="flex items-center gap-2">
						<span
							class="h-3.5 w-3.5 rounded-full border-[3px]"
							style="border-color: {red}; background: {isDark ? '#450a0a' : '#fef2f2'}"
						></span>
						Compromised asset
					</li>
				{/if}
				{#if graph.overlays.flags}
					<li class="flex items-center gap-2">
						<span class="flex gap-0.5">
							<span class="h-2 w-2 rounded-full" style="background: {amber}"></span>
							<span class="h-2 w-2 rounded-full" style="background: {red}"></span>
						</span>
						Asset flags (top-right)
					</li>
				{/if}
				{#if graph.overlays.criticality}
					<li class="flex items-center gap-2">
						<span
							class="h-3.5 w-3.5 rounded-full"
							style="box-shadow: 0 0 0 3px {paletteHex('orange', isDark)}"
						></span>
						Criticality (outer ring)
					</li>
				{/if}
				{#if graph.overlays.analysisStatus}
					<li class="flex items-center gap-2">
						<span class="h-2 w-2 rounded-full" style="background: {paletteHex('violet', isDark)}"
						></span>
						Analysis status (left dot)
					</li>
				{/if}
				{#if graph.overlays.tlp}
					<li class="flex items-center gap-2">
						<span class="h-2 w-2 rounded-full" style="background: {amber}"></span>TLP (bottom-left
						dot)
					</li>
				{/if}
				{#if graph.overlays.enrichment}
					<li class="flex items-center gap-2">
						<span class="rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">87</span
						>Enrichment score
					</li>
				{/if}
				{#if graph.overlays.crossCase}
					<li class="flex items-center gap-2">
						<span
							class="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 text-[8px]"
							style="border-color: {paletteHex('violet', isDark)}">2</span
						>Seen in other cases
					</li>
				{/if}
				<li class="flex items-center gap-2">
					<span
						class="h-3.5 w-3.5 rounded-full border-4 border-double"
						style="border-color: {neutral}"
					></span>
					Pinned node
				</li>
			</ul>
		</section>
	</div>
</div>
