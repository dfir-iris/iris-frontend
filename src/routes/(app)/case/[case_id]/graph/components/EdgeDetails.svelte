<!--
  Right-rail card of a relation: endpoints, relation, origin / review state,
  supporting events, edit form, accept / reject, reverse, delete, and
  "materialise" for derived relations.
-->
<script lang="ts">
	import { mode } from 'mode-watcher';
	import {
		ArrowLeftRightIcon,
		ArrowRightIcon,
		CheckIcon,
		DatabaseIcon,
		MinusIcon,
		PencilIcon,
		Trash2Icon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { paletteHex } from '$lib/components/common/CytoscapeGraph';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { GraphEdge, UpdateGraphEdgeBody } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import type { GraphActions } from '../lib/actions';
	import { isStoredEdge } from '../lib/model';
	import NodeKindIcon from './NodeKindIcon.svelte';
	import EventList from './EventList.svelte';
	import RelationForm, { type RelationFormValues } from './RelationForm.svelte';

	interface Props {
		graph: CaseGraphState;
		edge: GraphEdge;
		canEdit: boolean;
		actions: GraphActions;
	}

	let { graph, edge, canEdit, actions }: Props = $props();

	let editing = $state(false);
	let lastKey = $state('');

	$effect(() => {
		if (edge.key !== lastKey) {
			lastKey = edge.key;
			editing = false;
		}
	});

	const isDark = $derived($mode === 'dark');
	const stored = $derived(isStoredEdge(edge));
	const source = $derived(graph.node(edge.source));
	const target = $derived(graph.node(edge.target));
	const events = $derived(
		edge.event_ids.map((id) => graph.eventsById.get(id)).filter((e) => e !== undefined)
	);
	const missing = $derived(edge.event_ids.filter((id) => !graph.eventsById.has(id)));

	const ORIGIN_LABEL: Record<string, string> = {
		manual: 'Drawn by an analyst',
		ai: 'Proposed by the AI',
		module: 'Added by a module',
		import: 'Imported',
		suggestion: 'Accepted suggestion',
		event: 'Derived from timeline events',
		ioc_asset_link: 'Derived from an IOC ↔ asset link',
		parent_event: 'Derived from a parent event'
	};

	const REVIEW_CLASS: Record<string, string> = {
		accepted: 'border-green-500/40 text-green-700 dark:text-green-400',
		pending: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
		rejected: 'border-red-500/40 text-red-600 dark:text-red-400'
	};

	const goTo = (key: string) => {
		graph.rail = { type: 'node', key };
		const id = graph.canvasIdOf(key);
		if (id) graph.select([id], { center: true });
	};

	const save = async (v: RelationFormValues) => {
		const patch: UpdateGraphEdgeBody = {};
		if (v.relationTypeId !== null && v.relationTypeId !== edge.relation.id)
			patch.relation_type_id = v.relationTypeId;
		if (v.directed !== edge.directed) patch.directed = v.directed;
		if ((v.label || null) !== (edge.label || null)) patch.label = v.label || null;
		if ((v.description || null) !== (edge.description || null))
			patch.description = v.description || null;
		if (v.confidence !== edge.confidence) patch.confidence = v.confidence;
		if (Object.keys(patch).length) await graph.updateEdge(edge, patch);
		if (v.swapped) await graph.reverseEdge(edge);
		editing = false;
	};

	const badge =
		'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium';
</script>

<div class="space-y-4 p-4">
	<header class="space-y-2">
		<div class="flex items-center gap-2">
			<span
				class="h-1 w-6 rounded"
				style="background: {paletteHex(edge.relation.color, isDark)}"
				aria-hidden="true"
			></span>
			<h2 class="flex-1 text-sm font-semibold">{edge.label || edge.relation.label}</h2>
			{#if edge.count > 1}
				<span class={badge} title="Supporting events">×{edge.count}</span>
			{/if}
		</div>
		{#if edge.label && edge.label !== edge.relation.label}
			<p class="text-xs text-muted-foreground">Relation: {edge.relation.label}</p>
		{/if}
		<div class="flex items-center gap-1.5 rounded-md border bg-muted/40 p-1.5 text-xs">
			{#each [source, target] as end, i (i)}
				{#if i === 1}
					{#if edge.directed}
						<ArrowRightIcon class="h-3.5 w-3.5 shrink-0" aria-label="directed" />
					{:else}
						<MinusIcon class="h-3.5 w-3.5 shrink-0" aria-label="undirected" />
					{/if}
				{/if}
				<button
					type="button"
					class="flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent"
					onclick={() => end && goTo(end.key)}
					disabled={!end}
				>
					{#if end}
						<NodeKindIcon
							kind={end.kind}
							color={end.kind === 'node' ? end.color : null}
							class="h-3.5 w-3.5"
						/>
					{/if}
					<span class="truncate">{end?.label ?? (i === 0 ? edge.source : edge.target)}</span>
				</button>
			{/each}
		</div>
	</header>

	<div class="flex flex-wrap gap-1.5">
		<span class="{badge} {REVIEW_CLASS[edge.review_state] ?? ''}">{edge.review_state}</span>
		<span class={badge}>{ORIGIN_LABEL[edge.origin] ?? edge.origin}</span>
		{#if edge.confidence !== null}
			<span class={badge}>{edge.confidence}% confidence</span>
		{/if}
		{#if edge.tlp}
			<span class={badge}>TLP:{edge.tlp.toUpperCase()}</span>
		{/if}
	</div>

	{#if edge.description}
		<p class="whitespace-pre-wrap break-words text-xs">{edge.description}</p>
	{/if}

	{#if edge.first_seen || edge.last_seen}
		<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
			{#if edge.first_seen}
				<dt class="text-muted-foreground">First seen</dt>
				<dd>{formatDateTime(edge.first_seen)}</dd>
			{/if}
			{#if edge.last_seen}
				<dt class="text-muted-foreground">Last seen</dt>
				<dd>{formatDateTime(edge.last_seen)}</dd>
			{/if}
		</dl>
	{/if}

	{#if canEdit}
		{#if stored && edge.review_state !== 'accepted'}
			<div class="flex gap-1.5">
				<Button
					size="xs"
					class="flex-1"
					onclick={() => actions.run(() => graph.reviewEdge(edge, 'accept'), 'Relation accepted.')}
				>
					<CheckIcon class="mr-1 h-3 w-3" />Accept
				</Button>
				{#if edge.review_state !== 'rejected'}
					<Button
						size="xs"
						variant="outline"
						class="flex-1"
						onclick={() =>
							actions.run(() => graph.reviewEdge(edge, 'reject'), 'Relation rejected.')}
					>
						<XIcon class="mr-1 h-3 w-3" />Reject
					</Button>
				{/if}
			</div>
		{/if}

		{#if stored}
			{#if editing}
				{#key edge.key}
					<RelationForm
						relationTypes={graph.relationTypes}
						sourceLabel={source?.label ?? edge.source}
						targetLabel={target?.label ?? edge.target}
						initial={{
							relationTypeId: edge.relation.id,
							relationName: edge.relation.name,
							directed: edge.directed,
							label: edge.label ?? '',
							confidence: edge.confidence,
							description: edge.description ?? ''
						}}
						onSubmit={save}
						onCancel={() => (editing = false)}
					/>
				{/key}
			{:else}
				<div class="grid grid-cols-3 gap-1.5">
					<Button size="xs" variant="outline" onclick={() => (editing = true)}>
						<PencilIcon class="mr-1 h-3 w-3" />Edit
					</Button>
					<Button
						size="xs"
						variant="outline"
						disabled={!edge.directed}
						title={edge.directed ? 'Swap source and target' : 'Undirected relation'}
						onclick={() => actions.run(() => graph.reverseEdge(edge))}
					>
						<ArrowLeftRightIcon class="mr-1 h-3 w-3" />Reverse
					</Button>
					<Button size="xs" variant="destructive" onclick={() => actions.deleteEdges([edge])}>
						<Trash2Icon class="mr-1 h-3 w-3" />Delete
					</Button>
				</div>
			{/if}
		{:else}
			<div class="space-y-1">
				<Button
					size="xs"
					variant="outline"
					class="w-full"
					onclick={() =>
						actions.run(async () => {
							const created = await graph.materialiseEdge(edge);
							graph.rail = { type: 'edge', key: created.key };
						}, 'Relation stored.')}
				>
					<DatabaseIcon class="mr-1 h-3 w-3" />Materialise as stored edge
				</Button>
				<p class="text-[11px] text-muted-foreground">
					Derived relations follow the timeline. Materialising keeps this one (and its events) even
					if the events change, and makes it editable.
				</p>
			</div>
		{/if}
	{/if}

	<section class="space-y-1">
		<h3 class="text-xs font-semibold uppercase text-muted-foreground">
			Supporting events ({edge.event_ids.length})
		</h3>
		<EventList caseId={graph.caseId} {events} {missing} />
	</section>
</div>
