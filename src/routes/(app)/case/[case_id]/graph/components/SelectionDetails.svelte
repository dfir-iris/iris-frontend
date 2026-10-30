<!-- Rail card of a multi-selection with the bulk actions. -->
<script lang="ts">
	import {
		CrosshairIcon,
		EyeOffIcon,
		FlagIcon,
		ListTodoIcon,
		PinIcon,
		SquareArrowOutUpRightIcon,
		TagIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { GraphEdge, GraphNode } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import type { GraphActions } from '../lib/actions';
	import { timelineEventsUrl } from '$lib/utils/graph-links';
	import { isFanId, isBundleId } from '../lib/elements';
	import { isStoredEdge, KIND_LABEL } from '../lib/model';
	import NodeKindIcon from './NodeKindIcon.svelte';

	interface Props {
		graph: CaseGraphState;
		canEdit: boolean;
		actions: GraphActions;
	}

	let { graph, canEdit, actions }: Props = $props();

	/** Selected node keys, with fan-outs expanded to their IOCs. */
	const nodes = $derived.by<GraphNode[]>(() => {
		const keys = new Set<string>();
		for (const id of graph.selection) {
			if (isFanId(id)) graph.output.fanouts.get(id)?.iocs.forEach((k) => keys.add(k));
			else if (graph.node(id)) keys.add(id);
		}
		return [...keys].map((k) => graph.node(k)).filter((n): n is GraphNode => !!n);
	});

	const edges = $derived.by<GraphEdge[]>(() => {
		const keys = new Set<string>();
		for (const id of graph.selection) {
			if (isBundleId(id)) graph.output.bundles.get(id)?.forEach((k) => keys.add(k));
			else if (graph.edge(id)) keys.add(id);
		}
		return [...keys].map((k) => graph.edge(k)).filter((e): e is GraphEdge => !!e);
	});

	const storedEdges = $derived(edges.filter(isStoredEdge));
	const nodeKeys = $derived(nodes.map((n) => n.key));
	const counts = $derived(
		Object.entries(
			nodes.reduce<Record<string, number>>((acc, n) => {
				acc[n.kind] = (acc[n.kind] ?? 0) + 1;
				return acc;
			}, {})
		)
	);
	/** Timeline events behind the selection: selected events and supporting events. */
	const eventIds = $derived.by(() => {
		const ids = new Set<number>();
		for (const n of nodes) if (n.kind === 'event') ids.add(n.id);
		for (const e of edges) e.event_ids.forEach((id) => ids.add(id));
		return [...ids].sort((a, b) => a - b);
	});
	const hasAssets = $derived(nodes.some((n) => n.kind === 'asset'));
	const hasTaggable = $derived(nodes.some((n) => n.kind === 'asset' || n.kind === 'ioc'));

	const open = (n: GraphNode) => {
		graph.rail = { type: 'node', key: n.key };
		const id = graph.canvasIdOf(n.key);
		if (id) graph.select([id], { center: true });
	};
</script>

<div class="space-y-3 p-4">
	<header>
		<h2 class="text-sm font-semibold">
			{nodes.length} object{nodes.length === 1 ? '' : 's'}{edges.length
				? `, ${edges.length} relation${edges.length === 1 ? '' : 's'}`
				: ''} selected
		</h2>
		<p class="text-xs text-muted-foreground">
			{counts
				.map(([k, c]) => `${c} ${KIND_LABEL[k as keyof typeof KIND_LABEL].toLowerCase()}`)
				.join(' · ')}
		</p>
	</header>

	<div class="grid grid-cols-2 gap-1.5">
		<Button
			size="xs"
			variant="outline"
			disabled={!nodes.length}
			onclick={() => graph.hide(nodeKeys)}
		>
			<EyeOffIcon class="mr-1 h-3 w-3" />Hide
		</Button>
		<Button
			size="xs"
			variant="outline"
			disabled={!nodes.length}
			onclick={() => graph.togglePin(nodeKeys)}
		>
			<PinIcon class="mr-1 h-3 w-3" />Pin / unpin
		</Button>
		<Button
			size="xs"
			variant="outline"
			disabled={!graph.selection.length}
			onclick={() => graph.fit(graph.selection)}
		>
			<CrosshairIcon class="mr-1 h-3 w-3" />Zoom to
		</Button>
		{#if canEdit}
			<Button
				size="xs"
				variant="outline"
				disabled={!nodes.length}
				onclick={() => actions.bulk('task', nodeKeys)}
			>
				<ListTodoIcon class="mr-1 h-3 w-3" />Create task
			</Button>
			<Button
				size="xs"
				variant="outline"
				disabled={!hasTaggable}
				onclick={() => actions.bulk('tag', nodeKeys)}
			>
				<TagIcon class="mr-1 h-3 w-3" />Add tag
			</Button>
			<Button
				size="xs"
				variant="outline"
				disabled={!hasAssets}
				onclick={() => actions.bulk('flag', nodeKeys)}
			>
				<FlagIcon class="mr-1 h-3 w-3" />Flag assets
			</Button>
			{#if storedEdges.length}
				<Button
					size="xs"
					variant="destructive"
					class="col-span-2"
					onclick={() => actions.deleteEdges(storedEdges)}
				>
					<Trash2Icon class="mr-1 h-3 w-3" />Delete {storedEdges.length} relation{storedEdges.length ===
					1
						? ''
						: 's'}
				</Button>
			{/if}
		{/if}
	</div>

	{#if eventIds.length}
		<a
			href={timelineEventsUrl(graph.caseId, eventIds)}
			class="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
		>
			<SquareArrowOutUpRightIcon class="h-3 w-3" />Open the {eventIds.length} supporting event{eventIds.length >
			1
				? 's'
				: ''} in the timeline
		</a>
	{/if}

	<ul class="max-h-[50vh] space-y-0.5 overflow-y-auto">
		{#each nodes as n (n.key)}
			<li>
				<button
					type="button"
					class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent"
					onclick={() => open(n)}
				>
					<NodeKindIcon
						kind={n.kind}
						color={n.kind === 'node' ? n.color : null}
						class="h-3.5 w-3.5"
					/>
					<span class="min-w-0 flex-1 truncate">{n.label}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>
