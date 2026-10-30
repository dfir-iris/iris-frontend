<!-- Right-rail card of a node: fields, flags, tags, events, neighbours, actions. -->
<script lang="ts">
	import { mode } from 'mode-watcher';
	import {
		ArrowUpRightIcon,
		ClipboardPasteIcon,
		CrosshairIcon,
		EyeOffIcon,
		Link2Icon,
		ListPlusIcon,
		ListMinusIcon,
		PencilIcon,
		PinIcon,
		PinOffIcon,
		RouteIcon,
		SparklesIcon,
		Trash2Icon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { paletteHex, tlpHex } from '$lib/components/common/CytoscapeGraph';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { GraphNode } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import type { GraphActions } from '../lib/actions';
	import { analysisStatusColor, CRITICALITY_COLOR, isLinkable, KIND_LABEL } from '../lib/model';
	import NodeKindIcon from './NodeKindIcon.svelte';
	import EventList from './EventList.svelte';

	interface Props {
		graph: CaseGraphState;
		node: GraphNode;
		canEdit: boolean;
		actions: GraphActions;
	}

	let { graph, node, canEdit, actions }: Props = $props();

	const isDark = $derived($mode === 'dark');
	const pinned = $derived(graph.pinned.has(node.key));
	const focused = $derived(graph.focus?.key === node.key);
	const expanded = $derived(graph.expanded.has(node.key));

	const events = $derived((graph.graph?.events ?? []).filter((e) => e.keys.includes(node.key)));

	interface Neighbour {
		node: GraphNode;
		relations: string[];
		visible: boolean;
	}

	const neighbours = $derived.by<Neighbour[]>(() => {
		const out = new Map<string, Neighbour>();
		for (const ek of graph.index.edgesOf.get(node.key) ?? []) {
			const e = graph.index.edges.get(ek);
			if (!e || e.review_state === 'rejected') continue;
			const other = e.source === node.key ? e.target : e.source;
			const n = graph.node(other);
			if (!n || other === node.key) continue;
			const entry = out.get(other) ?? { node: n, relations: [], visible: graph.isVisible(other) };
			const arrow = e.directed ? (e.source === node.key ? '→ ' : '← ') : '';
			const rel = `${arrow}${e.label || e.relation.label}`;
			if (!entry.relations.includes(rel)) entry.relations.push(rel);
			out.set(other, entry);
		}
		return [...out.values()].sort(
			(a, b) => a.node.kind.localeCompare(b.node.kind) || a.node.label.localeCompare(b.node.label)
		);
	});

	const goTo = (key: string) => {
		if (!graph.isVisible(key)) graph.addToCanvas([key]);
		graph.rail = { type: 'node', key };
		queueMicrotask(() => {
			const id = graph.canvasIdOf(key);
			if (id) graph.select([id], { center: true });
		});
	};

	const badge =
		'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium';
	const score = $derived(typeof node.enrichment?.score === 'number' ? node.enrichment.score : null);
</script>

<div class="space-y-4 p-4">
	<header class="flex items-start gap-3">
		<div class="mt-0.5 rounded-md border bg-muted/40 p-2">
			<NodeKindIcon
				kind={node.kind}
				color={node.kind === 'node' ? node.color : null}
				class="h-5 w-5"
			/>
		</div>
		<div class="min-w-0 flex-1">
			<h2 class="break-words text-sm font-semibold">{node.label}</h2>
			<p class="text-xs text-muted-foreground">
				{KIND_LABEL[node.kind]}{node.type ? ` · ${node.type}` : ''}
			</p>
			{#if node.subtitle}
				<p class="truncate font-mono text-xs text-muted-foreground" title={node.subtitle}>
					{node.subtitle}
				</p>
			{/if}
		</div>
		{#if node.url}
			<a
				href={node.url}
				class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				title="Open {KIND_LABEL[node.kind].toLowerCase()}"
				aria-label="Open {KIND_LABEL[node.kind].toLowerCase()}"
			>
				<ArrowUpRightIcon class="h-4 w-4" />
			</a>
		{/if}
	</header>

	<div class="flex flex-wrap gap-1.5">
		{#if node.compromised}
			<span class="{badge} border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400">
				Compromised
			</span>
		{:else if node.compromised === false}
			<span class="{badge} text-muted-foreground">Not compromised</span>
		{/if}
		{#if node.analysis_status && analysisStatusColor(node.analysis_status)}
			<span
				class={badge}
				style="color: {paletteHex(analysisStatusColor(node.analysis_status), isDark)}"
			>
				{node.analysis_status}
			</span>
		{/if}
		{#if node.criticality}
			<span
				class={badge}
				style="color: {paletteHex(CRITICALITY_COLOR[node.criticality.toLowerCase()], isDark)}"
			>
				{node.criticality} criticality
			</span>
		{/if}
		{#if node.tlp}
			<span class={badge} style="color: {tlpHex(node.tlp, isDark) ?? 'inherit'}">
				TLP:{node.tlp.replace(/^tlp[:\s-]*/i, '').toUpperCase()}
			</span>
		{/if}
		{#if node.cross_case_count}
			<span class={badge} title="Also seen in other cases">
				{node.cross_case_count} other case{node.cross_case_count > 1 ? 's' : ''}
			</span>
		{/if}
		{#if score !== null}
			<span class={badge} title="Enrichment score">
				<SparklesIcon class="h-3 w-3" />{score}
			</span>
		{/if}
		{#if pinned}
			<span class={badge}><PinIcon class="h-3 w-3" />Pinned</span>
		{/if}
	</div>

	{#if node.flags?.length}
		<section class="space-y-1">
			<h3 class="text-xs font-semibold uppercase text-muted-foreground">Flags</h3>
			<div class="flex flex-wrap gap-1.5">
				{#each node.flags as f (f.id)}
					<span class={badge}>
						<span class="h-2 w-2 rounded-full" style="background: {paletteHex(f.color, isDark)}"
						></span>
						{f.name}
					</span>
				{/each}
			</div>
		</section>
	{/if}

	{#if node.tags?.length}
		<section class="space-y-1">
			<h3 class="text-xs font-semibold uppercase text-muted-foreground">Tags</h3>
			<div class="flex flex-wrap gap-1">
				{#each node.tags as t (t)}
					<span class="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>
				{/each}
			</div>
		</section>
	{/if}

	{#if node.description}
		<section class="space-y-1">
			<h3 class="text-xs font-semibold uppercase text-muted-foreground">Description</h3>
			<p class="whitespace-pre-wrap break-words text-xs">{node.description}</p>
		</section>
	{/if}

	{#if node.first_seen || node.last_seen}
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
			{#if node.first_seen}
				<dt class="text-muted-foreground">First seen</dt>
				<dd>{formatDateTime(node.first_seen)}</dd>
			{/if}
			{#if node.last_seen}
				<dt class="text-muted-foreground">Last seen</dt>
				<dd>{formatDateTime(node.last_seen)}</dd>
			{/if}
		</dl>
	{/if}

	<section class="grid grid-cols-2 gap-1.5">
		<Button
			size="xs"
			variant={focused ? 'default' : 'outline'}
			onclick={() => graph.setFocus(focused ? null : node.key)}
		>
			<CrosshairIcon class="mr-1 h-3 w-3" />{focused ? 'Unfocus' : 'Focus'}
		</Button>
		{#if expanded}
			<Button size="xs" variant="outline" onclick={() => actions.collapse(node.key)}>
				<ListMinusIcon class="mr-1 h-3 w-3" />Collapse
			</Button>
		{:else}
			<Button size="xs" variant="outline" onclick={() => actions.expand(node.key)}>
				<ListPlusIcon class="mr-1 h-3 w-3" />Expand
			</Button>
		{/if}
		<Button size="xs" variant="outline" onclick={() => graph.togglePin([node.key])}>
			{#if pinned}
				<PinOffIcon class="mr-1 h-3 w-3" />Unpin
			{:else}
				<PinIcon class="mr-1 h-3 w-3" />Pin
			{/if}
		</Button>
		<Button size="xs" variant="outline" onclick={() => graph.hide([node.key])}>
			<EyeOffIcon class="mr-1 h-3 w-3" />Hide
		</Button>
		<Button size="xs" variant="outline" onclick={() => actions.pathFrom(node.key)}>
			<RouteIcon class="mr-1 h-3 w-3" />Paths
		</Button>
		{#if canEdit && isLinkable(node)}
			<Button size="xs" variant="outline" onclick={() => actions.connectFrom(node.key)}>
				<Link2Icon class="mr-1 h-3 w-3" />Connect
			</Button>
			<Button
				size="xs"
				variant="outline"
				onclick={() => actions.paste({ linkTo: node.key })}
				class="col-span-2"
			>
				<ClipboardPasteIcon class="mr-1 h-3 w-3" />Paste indicators linked to it
			</Button>
		{/if}
		{#if canEdit && node.kind === 'node'}
			<Button size="xs" variant="outline" onclick={() => actions.editFreeNode(node.key)}>
				<PencilIcon class="mr-1 h-3 w-3" />Edit
			</Button>
			<Button size="xs" variant="outline" onclick={() => actions.promote(node.key)}>
				<SparklesIcon class="mr-1 h-3 w-3" />Promote
			</Button>
			<Button
				size="xs"
				variant="destructive"
				class="col-span-2"
				onclick={() => actions.deleteFreeNode(node.key)}
			>
				<Trash2Icon class="mr-1 h-3 w-3" />Delete node
			</Button>
		{/if}
	</section>

	{#if focused && graph.focus}
		<label class="block space-y-1 text-xs">
			<span class="font-medium"
				>Focus depth: {graph.focus.hops} hop{graph.focus.hops > 1 ? 's' : ''}</span
			>
			<input
				type="range"
				min="1"
				max="6"
				class="w-full"
				value={graph.focus.hops}
				oninput={(e) =>
					graph.setFocus(node.key, Number((e.currentTarget as HTMLInputElement).value))}
			/>
		</label>
	{/if}

	<section class="space-y-1">
		<h3 class="text-xs font-semibold uppercase text-muted-foreground">
			Neighbours ({neighbours.length})
		</h3>
		{#if neighbours.length}
			<ul class="space-y-0.5">
				{#each neighbours as nb (nb.node.key)}
					<li>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-accent {nb.visible
								? ''
								: 'opacity-60'}"
							onclick={() => goTo(nb.node.key)}
							title={nb.visible ? nb.node.label : `${nb.node.label} (not on the canvas)`}
						>
							<NodeKindIcon
								kind={nb.node.kind}
								color={nb.node.kind === 'node' ? nb.node.color : null}
								class="h-3.5 w-3.5"
							/>
							<span class="min-w-0 flex-1 truncate">{nb.node.label}</span>
							<span class="max-w-[45%] truncate text-muted-foreground"
								>{nb.relations.join(', ')}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-xs text-muted-foreground">No relation yet.</p>
		{/if}
	</section>

	<section class="space-y-1">
		<h3 class="text-xs font-semibold uppercase text-muted-foreground">
			Supporting events ({events.length})
		</h3>
		<EventList caseId={graph.caseId} {events} />
	</section>
</div>
