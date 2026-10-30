<!--
  Path finder: shortest paths between two nodes (GET /graph/paths). The
  active path is highlighted on the canvas, the others are listed.
-->
<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowUpDownIcon,
		LoaderCircleIcon,
		RouteIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Switch } from '$lib/components/ui/switch';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';
	import { KIND_LABEL } from '../lib/model';
	import NodeKindIcon from './NodeKindIcon.svelte';
	import ObjectPickerDialog from './ObjectPickerDialog.svelte';

	interface Props {
		graph: CaseGraphState;
		refs: GraphReferenceData;
	}

	let { graph, refs }: Props = $props();

	let picking = $state<'source' | 'target' | null>(null);
	let pickerOpen = $state(false);

	const source = $derived(graph.node(graph.path.source));
	const target = $derived(graph.node(graph.path.target));
	const result = $derived(graph.path.result);
	const candidates = $derived(graph.nodes.filter((n) => n.kind !== 'case'));
	const onCanvas = $derived(graph.visibility.nodes);

	const pick = (which: 'source' | 'target') => {
		picking = which;
		pickerOpen = true;
	};

	const swap = () => {
		const { source: s, target: t } = graph.path;
		graph.path.source = t;
		graph.path.target = s;
		graph.clearPath();
	};

	const showPath = (i: number) => {
		graph.path.active = i;
		const p = graph.path.result?.paths[i];
		if (p) queueMicrotask(() => graph.fit(p.node_keys.map((k) => graph.canvasIdOf(k) ?? k)));
	};

	const find = async () => {
		await graph.findPaths();
		if (graph.path.result?.paths.length) showPath(0);
	};

	const edgeLabel = (key: string) => {
		const e = graph.edge(key);
		return e ? e.label || e.relation.label : '';
	};
</script>

<div class="space-y-3 p-4">
	<header class="flex items-center gap-2">
		<RouteIcon class="h-4 w-4" />
		<h2 class="flex-1 text-sm font-semibold">Path finder</h2>
		{#if result}
			<Button size="xs" variant="ghost" onclick={() => graph.clearPath()}>
				<XIcon class="mr-1 h-3 w-3" />Clear
			</Button>
		{/if}
	</header>

	<div class="space-y-1">
		{#each [['source', source], ['target', target]] as const as [which, n], i (which)}
			{#if i === 1}
				<div class="flex justify-center">
					<button
						type="button"
						class="rounded p-0.5 text-muted-foreground hover:bg-accent"
						title="Swap"
						aria-label="Swap source and target"
						onclick={swap}
					>
						<ArrowUpDownIcon class="h-3.5 w-3.5" />
					</button>
				</div>
			{/if}
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:bg-accent"
				onclick={() => pick(which)}
			>
				{#if n}
					<NodeKindIcon
						kind={n.kind}
						color={n.kind === 'node' ? n.color : null}
						class="h-3.5 w-3.5"
					/>
					<span class="min-w-0 flex-1 truncate">{n.label}</span>
					<span class="text-muted-foreground">{KIND_LABEL[n.kind]}</span>
				{:else}
					<span class="text-muted-foreground">Choose the {which}…</span>
				{/if}
			</button>
		{/each}
	</div>

	<div class="flex items-center justify-between gap-2 text-xs">
		<label class="flex items-center gap-2">
			<Switch
				checked={graph.path.directed}
				onCheckedChange={(v) => {
					graph.path.directed = v;
					graph.clearPath();
				}}
			/>
			Follow directions
		</label>
		<label class="flex items-center gap-1">
			Max hops
			<input
				type="number"
				min="1"
				max="12"
				class="h-7 w-14 rounded border bg-background px-1"
				value={graph.path.maxLength}
				onchange={(e) => {
					const v = Number((e.currentTarget as HTMLInputElement).value);
					graph.path.maxLength = Math.max(1, Math.min(12, Number.isFinite(v) ? v : 8));
				}}
			/>
		</label>
	</div>

	<Button
		size="sm"
		class="w-full"
		disabled={!source || !target || source.key === target.key || graph.path.loading}
		onclick={find}
	>
		{#if graph.path.loading}
			<LoaderCircleIcon class="mr-1 h-3.5 w-3.5 animate-spin" />
		{/if}
		Find paths
	</Button>

	{#if graph.path.error}
		<p class="text-xs text-destructive" role="alert">{graph.path.error}</p>
	{/if}

	{#if result}
		{#if !result.paths.length}
			<p class="text-xs text-muted-foreground">
				No path within {graph.path.maxLength} hops{graph.path.directed
					? ' following the directions'
					: ''}.
			</p>
		{:else}
			<p class="text-xs text-muted-foreground">
				{result.paths.length} path{result.paths.length > 1 ? 's' : ''}, shortest {result.shortest_length}
				hop{result.shortest_length === 1 ? '' : 's'}.
			</p>
			<ol class="space-y-2">
				{#each result.paths as p, i (i)}
					<li>
						<button
							type="button"
							class="w-full rounded-md border p-2 text-left text-xs {graph.path.active === i
								? 'border-primary bg-primary/5'
								: 'hover:bg-accent'}"
							onclick={() => showPath(i)}
							aria-pressed={graph.path.active === i}
						>
							<span class="mb-1 block font-medium">
								Path {i + 1} · {p.edge_keys.length} hop{p.edge_keys.length === 1 ? '' : 's'}
							</span>
							{#each p.node_keys as k, j (k)}
								{@const n = graph.node(k)}
								<span class="flex items-center gap-1.5">
									{#if n}
										<NodeKindIcon
											kind={n.kind}
											color={n.kind === 'node' ? n.color : null}
											class="h-3 w-3"
										/>
									{/if}
									<span class="truncate">{n?.label ?? k}</span>
								</span>
								{#if j < p.edge_keys.length}
									<span class="flex items-center gap-1 pl-0.5 text-muted-foreground">
										<ArrowDownIcon class="h-3 w-3" />
										<span class="truncate italic">{edgeLabel(p.edge_keys[j])}</span>
									</span>
								{/if}
							{/each}
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	{/if}
</div>

<ObjectPickerDialog
	bind:open={pickerOpen}
	caseId={graph.caseId}
	title={picking === 'target' ? 'Path target' : 'Path source'}
	nodes={candidates}
	{refs}
	{onCanvas}
	allowCreate={false}
	confirmLabel="Choose"
	onPick={(key) => {
		if (picking === 'target') graph.path.target = key;
		else graph.path.source = key;
		graph.clearPath();
	}}
/>
