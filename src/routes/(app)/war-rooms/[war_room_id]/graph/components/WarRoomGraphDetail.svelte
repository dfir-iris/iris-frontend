<!-- War-room graph: details of the clicked node or relation, with links to the object. -->
<script lang="ts">
	import {
		ArrowRightIcon,
		ExternalLinkIcon,
		LockIcon,
		NetworkIcon,
		ScrollTextIcon,
		XIcon
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { paletteHex } from '$lib/components/common/CytoscapeGraph/palette';
	import type { GraphEdge, GraphNode, WarRoomGraph } from '$lib/types/resources/case-graph';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import { KIND_LABEL } from '../../../../case/[case_id]/graph/lib/model';
	import {
		caseIdOfElement,
		isSameAsEdge,
		parseWarRoomKey,
		sameAsCounterparts,
		warRoomEdgeEventsUrl,
		warRoomNodeLinks,
		type WarRoomCase
	} from '../lib/war-room-graph';

	type Props = {
		graph: WarRoomGraph;
		cases: WarRoomCase[];
		isDark: boolean;
		node?: GraphNode | null;
		/** One relation, or the relations of a bundle. */
		edges?: GraphEdge[];
		onSelectNode: (key: string) => void;
		onClose: () => void;
	};

	let { graph, cases, isDark, node = null, edges = [], onSelectNode, onClose }: Props = $props();

	const caseById = $derived(new Map(cases.map((c) => [c.id, c])));
	const nodeByKey = $derived(new Map(graph.nodes.map((n) => [n.key, n])));

	const caseOf = (key: string) => {
		const parsed = parseWarRoomKey(key);
		return parsed ? (caseById.get(parsed.caseId) ?? null) : null;
	};

	const nodeCase = $derived(node ? caseOf(node.key) : null);
	const isCaseNode = $derived(node?.kind === 'case');
	const restricted = $derived(
		!!node && (node.accessible === false || nodeCase?.accessible === false)
	);
	const links = $derived(node ? warRoomNodeLinks(node, !restricted) : null);
	const counterparts = $derived(
		node && !isCaseNode ? sameAsCounterparts(graph, node.key) : ([] as GraphNode[])
	);

	const labelOf = (key: string) => nodeByKey.get(key)?.label ?? key;
	const dates = (first?: string | null, last?: string | null) => {
		const a = first ? formatDateTime(first) : '';
		const b = last ? formatDateTime(last) : '';
		if (!a && !b) return '';
		return a === b || !b ? a : `${a || '…'} → ${b}`;
	};
</script>

{#snippet caseChip(c: WarRoomCase | null)}
	{#if c}
		<span class="inline-flex min-w-0 items-center gap-1.5">
			<span
				class="h-2.5 w-2.5 shrink-0 rounded-sm"
				style:background-color={paletteHex(c.accessible ? c.color : 'slate', isDark)}
			></span>
			<span class="truncate">#{c.id} {c.name}</span>
		</span>
	{/if}
{/snippet}

<aside class="flex h-full w-80 shrink-0 flex-col border-l bg-background" aria-label="Details">
	<header class="flex items-center gap-2 border-b px-3 py-2">
		<h2 class="min-w-0 flex-1 truncate text-sm font-semibold">
			{#if node}
				{isCaseNode ? (restricted ? 'Restricted case' : 'Case') : KIND_LABEL[node.kind]}
			{:else if edges.length > 1}
				{edges.length} relations
			{:else}
				Relation
			{/if}
		</h2>
		<Button variant="ghost" size="icon" class="h-7 w-7" aria-label="Close" onclick={onClose}>
			<XIcon class="h-4 w-4" />
		</Button>
	</header>

	<div class="flex-1 space-y-4 overflow-y-auto p-3 text-sm">
		{#if node && restricted}
			<div class="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
				<LockIcon class="h-8 w-8" />
				<p class="font-medium text-foreground">You cannot read this case</p>
				<p class="text-xs">
					It is attached to the war room, but none of its objects are shown. Ask a case
					administrator for access.
				</p>
			</div>
		{:else if node}
			<section class="space-y-1">
				<p class="break-words font-medium">{node.label}</p>
				{#if node.subtitle}
					<p class="break-words text-xs text-muted-foreground">{node.subtitle}</p>
				{/if}
				<div class="flex flex-wrap gap-1 pt-1">
					{#if node.type}
						<Badge variant="secondary">{node.type}</Badge>
					{/if}
					{#if node.compromised}
						<Badge variant="compromised">Compromised</Badge>
					{/if}
					{#if node.analysis_status}
						<Badge variant="outline">{node.analysis_status}</Badge>
					{/if}
					{#if node.tlp}
						<Badge variant="outline">TLP:{node.tlp.toUpperCase()}</Badge>
					{/if}
					{#each node.tags ?? [] as tag (tag)}
						<Badge variant="outline">{tag}</Badge>
					{/each}
				</div>
			</section>

			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
				{#if nodeCase && !isCaseNode}
					<dt class="text-muted-foreground">Case</dt>
					<dd class="min-w-0">{@render caseChip(nodeCase)}</dd>
				{/if}
				{#if isCaseNode && nodeCase}
					<dt class="text-muted-foreground">Objects</dt>
					<dd>{nodeCase.nodeCount}</dd>
				{/if}
				{#if dates(node.first_seen, node.last_seen)}
					<dt class="text-muted-foreground">Seen</dt>
					<dd>{dates(node.first_seen, node.last_seen)}</dd>
				{/if}
				{#if node.event_count}
					<dt class="text-muted-foreground">Events</dt>
					<dd>{node.event_count}</dd>
				{/if}
				{#if node.criticality}
					<dt class="text-muted-foreground">Criticality</dt>
					<dd class="capitalize">{node.criticality}</dd>
				{/if}
			</dl>

			{#if node.description}
				<p class="line-clamp-6 whitespace-pre-wrap break-words text-xs text-muted-foreground">
					{node.description}
				</p>
			{/if}

			{#if counterparts.length}
				<section class="space-y-1.5">
					<h3 class="text-xs font-medium text-muted-foreground">
						Same {node.kind === 'ioc' ? 'IOC' : 'object'} in other cases
					</h3>
					<ul class="space-y-1">
						{#each counterparts as other (other.key)}
							<li>
								<button
									type="button"
									class="flex w-full min-w-0 flex-col items-start rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
									onclick={() => onSelectNode(other.key)}
								>
									<span class="w-full truncate font-medium">{other.label}</span>
									<span class="w-full text-muted-foreground">
										{@render caseChip(caseOf(other.key))}
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			<div class="flex flex-col gap-2">
				{#if links?.object}
					<Button href={links.object} size="sm" variant="default" class="justify-start">
						<ExternalLinkIcon class="mr-2 h-4 w-4" />
						Open {isCaseNode ? 'case' : KIND_LABEL[node.kind].toLowerCase()}
					</Button>
				{/if}
				{#if links?.caseGraph}
					<Button href={links.caseGraph} size="sm" variant="outline" class="justify-start">
						<NetworkIcon class="mr-2 h-4 w-4" />
						Open in the case graph
					</Button>
				{/if}
			</div>
		{:else}
			<ul class="space-y-3">
				{#each edges as edge (edge.key)}
					{@const sameAs = isSameAsEdge(edge)}
					{@const eventsUrl = warRoomEdgeEventsUrl(edge)}
					{@const edgeCase = caseById.get(edge.case_id ?? caseIdOfElement(edge.key) ?? -1) ?? null}
					<li class="space-y-2 rounded-md border p-2.5">
						<div class="flex items-center gap-2">
							<span
								class="h-0.5 w-5 shrink-0 rounded"
								style:background-color={paletteHex(
									sameAs ? 'fuchsia' : edge.relation?.color,
									isDark
								)}
							></span>
							<span class="min-w-0 flex-1 truncate font-medium">
								{sameAs ? 'Same object' : edge.label || edge.relation?.label || edge.relation?.name}
							</span>
							{#if edge.review_state === 'pending'}
								<Badge variant="outline">Pending</Badge>
							{/if}
						</div>
						<p class="flex flex-wrap items-center gap-1 text-xs">
							<button
								type="button"
								class="max-w-full truncate underline-offset-2 hover:underline"
								onclick={() => onSelectNode(edge.source)}>{labelOf(edge.source)}</button
							>
							<ArrowRightIcon
								class="h-3 w-3 shrink-0 text-muted-foreground {edge.directed ? '' : 'opacity-40'}"
							/>
							<button
								type="button"
								class="max-w-full truncate underline-offset-2 hover:underline"
								onclick={() => onSelectNode(edge.target)}>{labelOf(edge.target)}</button
							>
						</p>
						{#if sameAs}
							<p class="text-xs text-muted-foreground">
								Same IOC value and type, or the same managed asset, in two cases.
							</p>
							<div class="space-y-0.5 text-xs">
								<div>{@render caseChip(caseOf(edge.source))}</div>
								<div>{@render caseChip(caseOf(edge.target))}</div>
							</div>
						{:else}
							<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
								{#if edgeCase}
									<dt class="text-muted-foreground">Case</dt>
									<dd class="min-w-0">{@render caseChip(edgeCase)}</dd>
								{/if}
								<dt class="text-muted-foreground">Origin</dt>
								<dd class="capitalize">{edge.origin.replace(/_/g, ' ')}</dd>
								{#if edge.confidence !== null && edge.confidence !== undefined}
									<dt class="text-muted-foreground">Confidence</dt>
									<dd>{edge.confidence}%</dd>
								{/if}
								{#if dates(edge.first_seen, edge.last_seen)}
									<dt class="text-muted-foreground">Seen</dt>
									<dd>{dates(edge.first_seen, edge.last_seen)}</dd>
								{/if}
							</dl>
							{#if edge.description}
								<p class="whitespace-pre-wrap break-words text-xs text-muted-foreground">
									{edge.description}
								</p>
							{/if}
							{#if eventsUrl}
								<Button href={eventsUrl} size="sm" variant="outline" class="w-full justify-start">
									<ScrollTextIcon class="mr-2 h-4 w-4" />
									{edge.event_ids.length} supporting event{edge.event_ids.length === 1 ? '' : 's'}
								</Button>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</aside>
