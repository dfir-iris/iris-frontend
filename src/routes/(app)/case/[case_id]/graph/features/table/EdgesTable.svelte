<!--
  Relations of the graph as a table. Stored relations are editable in place
  (relation type, direction, confidence, review, delete) and in bulk; derived
  ones (timeline, links) are read-only.
-->
<script lang="ts">
	import {
		ArrowLeftRightIcon,
		ArrowRightIcon,
		CheckIcon,
		CrosshairIcon,
		EyeIcon,
		MinusIcon,
		Trash2Icon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { GraphEdge, UpdateGraphEdgeBody } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import type { GraphActions } from '../../lib/actions';
	import {
		edgeMatchesSearch,
		edgeRow,
		filterRows,
		headerSelection,
		pageOf,
		parseConfidence,
		sortRows,
		toCsv,
		toggleRowSelection,
		type EdgeColumn,
		type EdgeRow,
		type SortState
	} from '../../lib/table';
	import SortHeader from './SortHeader.svelte';
	import { indeterminate } from './indeterminate';
	import TablePager from './TablePager.svelte';

	interface Props {
		graph: CaseGraphState;
		filter: string;
		locate: (nodeKeys: string[], edgeKeys?: string[]) => void;
		canEdit: boolean;
		actions: GraphActions;
		csv: (() => string) | null;
	}

	let { graph, filter, locate, canEdit, actions, csv = $bindable() }: Props = $props();

	const PAGE_SIZE = 100;
	const ORIGIN_LABEL: Record<string, string> = {
		manual: 'Manual',
		ai: 'AI',
		module: 'Module',
		import: 'Import',
		suggestion: 'Suggestion',
		event: 'Timeline',
		ioc_asset_link: 'IOC link',
		parent_event: 'Parent event',
		alert: 'Alert',
		cross_case: 'Cross-case'
	};
	const REVIEW_CLASS: Record<string, string> = {
		accepted: 'bg-green-500/15 text-green-700 dark:text-green-300',
		pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		rejected: 'bg-red-500/15 text-red-700 dark:text-red-300'
	};

	let sort = $state<SortState<EdgeColumn> | null>({ column: 'source', dir: 'asc' });
	let page = $state(1);
	let selected = $state.raw<Set<string>>(new Set());
	let anchor = $state<string | null>(null);
	let busy = $state.raw<Set<string>>(new Set());
	let bulkConfidence = $state('');

	const labelOf = (key: string) => graph.node(key)?.label ?? key;

	const rows = $derived.by<EdgeRow[]>(() => {
		const matches = graph.matches ? new Set(graph.matches) : null;
		return graph.edges
			.filter((e) => graph.visibility.edges.has(e.key) && edgeMatchesSearch(e, matches))
			.map((e) => edgeRow(e, labelOf));
	});

	const filtered = $derived(
		filterRows(rows, filter, ['source', 'target', 'relation', 'label', 'origin', 'review'])
	);
	const sorted = $derived(sortRows(filtered, sort));
	const paged = $derived(pageOf(sorted, page, PAGE_SIZE));
	const listedKeys = $derived(sorted.map((r) => r.key));
	const head = $derived(headerSelection(selected, listedKeys));
	const selectedRows = $derived(sorted.filter((r) => selected.has(r.key)));
	const selectedStored = $derived(selectedRows.filter((r) => r.stored).map((r) => r.edge));

	$effect(() => {
		void filter;
		void sort;
		page = 1;
	});

	$effect(() => {
		csv = () =>
			toCsv(
				[
					'source',
					'relation',
					'target',
					'directed',
					'label',
					'confidence',
					'origin',
					'review_state',
					'events',
					'first_seen'
				],
				sorted.map((r) => [
					r.source,
					r.relation,
					r.target,
					r.directed,
					r.label,
					r.confidence,
					r.origin,
					r.review,
					r.count,
					r.firstSeen
				])
			);
		return () => (csv = null);
	});

	const toggle = (key: string, e: MouseEvent) => {
		selected = toggleRowSelection(selected, key, {
			ordered: listedKeys,
			anchor,
			range: e.shiftKey
		});
		anchor = key;
	};

	const toggleAll = () => {
		selected = head === 'all' ? new Set() : new Set(listedKeys);
	};

	/** Run an edit with the row(s) marked busy; errors are toasted by `actions.run`. */
	const edit = async (keys: string[], fn: () => Promise<unknown>, success?: string) => {
		busy = new Set([...busy, ...keys]);
		try {
			await actions.run(fn, success);
		} finally {
			const next = new Set(busy);
			keys.forEach((k) => next.delete(k));
			busy = next;
		}
	};

	const patch = (e: GraphEdge, body: UpdateGraphEdgeBody) =>
		edit([e.key], () => graph.updateEdge(e, body));

	const setRelation = (e: GraphEdge, value: string) => {
		const id = Number(value);
		if (!Number.isInteger(id) || id === e.relation.id) return;
		void patch(e, { relation_type_id: id });
	};

	const commitConfidence = (e: GraphEdge, input: HTMLInputElement) => {
		const value = parseConfidence(input.value);
		if (value === undefined) {
			toast({ title: 'Confidence is a whole percentage, 0 to 100', variant: 'warning' });
			input.value = e.confidence === null ? '' : String(e.confidence);
			return;
		}
		if (value !== e.confidence) void patch(e, { confidence: value });
	};

	const bulk = (body: UpdateGraphEdgeBody, label: string, success: string) => {
		const edges = selectedStored;
		void edit(
			edges.map((e) => e.key),
			() => graph.updateEdges(edges, body, label),
			success
		);
	};

	const bulkSetConfidence = () => {
		const value = parseConfidence(bulkConfidence);
		if (value === undefined) {
			toast({ title: 'Confidence is a whole percentage, 0 to 100', variant: 'warning' });
			return;
		}
		bulk({ confidence: value }, 'Set confidence', 'Confidence updated');
		bulkConfidence = '';
	};

	const date = (v: string | null) => (v ? formatDateTime(v) : '');
	const selectClass =
		'h-6 max-w-40 rounded border border-input bg-background px-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50';
</script>

{#if selectedRows.length}
	<div
		class="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-3 py-1 text-xs"
		role="toolbar"
		aria-label="Actions on the selected relations"
	>
		<span class="mr-1 font-medium">
			{selectedRows.length} selected{selectedStored.length !== selectedRows.length
				? ` (${selectedStored.length} editable)`
				: ''}
		</span>
		<Button
			size="xs"
			variant="outline"
			onclick={() =>
				locate(
					[],
					selectedRows.map((r) => r.key)
				)}
		>
			<CrosshairIcon class="mr-1 h-3.5 w-3.5" />Show on the canvas
		</Button>
		{#if canEdit && selectedStored.length}
			<select
				class={selectClass}
				aria-label="Set the relation of the selected relations"
				value=""
				onchange={(e) => {
					const id = Number(e.currentTarget.value);
					e.currentTarget.value = '';
					if (Number.isInteger(id) && id > 0)
						bulk({ relation_type_id: id }, 'Change relation type', 'Relations updated');
				}}
			>
				<option value="" disabled>Set relation…</option>
				{#each graph.relationTypes as t (t.id)}
					<option value={String(t.id)}>{t.label}</option>
				{/each}
			</select>
			<form
				class="flex items-center gap-1"
				onsubmit={(e) => {
					e.preventDefault();
					bulkSetConfidence();
				}}
			>
				<input
					class="h-6 w-14 rounded border border-input bg-background px-1 text-xs"
					placeholder="0-100"
					inputmode="numeric"
					aria-label="Confidence of the selected relations (empty clears it)"
					bind:value={bulkConfidence}
				/>
				<Button size="xs" variant="outline" type="submit">Set confidence</Button>
			</form>
			<Button
				size="xs"
				variant="outline"
				onclick={() => bulk({ review_state: 'accepted' }, 'Accept relations', 'Relations accepted')}
			>
				<CheckIcon class="mr-1 h-3.5 w-3.5" />Accept
			</Button>
			<Button
				size="xs"
				variant="outline"
				onclick={() => bulk({ review_state: 'rejected' }, 'Reject relations', 'Relations rejected')}
			>
				<XIcon class="mr-1 h-3.5 w-3.5" />Reject
			</Button>
			<Button
				size="xs"
				variant="outline"
				class="text-destructive"
				onclick={() => actions.deleteEdges(selectedStored)}
			>
				<Trash2Icon class="mr-1 h-3.5 w-3.5" />Delete
			</Button>
		{/if}
		<Button size="xs" variant="ghost" onclick={() => (selected = new Set())}>Clear</Button>
	</div>
{/if}

<div class="min-h-0 flex-1 overflow-auto">
	<table class="w-full border-separate border-spacing-0 text-xs">
		<caption class="sr-only">Relations of the graph</caption>
		<thead
			class="sticky top-0 z-10 bg-background text-left text-muted-foreground shadow-[0_1px_0] shadow-border"
		>
			<tr>
				<th scope="col" class="w-8 px-2 py-1.5">
					<input
						type="checkbox"
						class="h-3.5 w-3.5 accent-primary"
						checked={head === 'all'}
						use:indeterminate={head === 'some'}
						onchange={toggleAll}
						aria-label="Select every listed relation"
					/>
				</th>
				<SortHeader column="source" label="From" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="relation" label="Relation" {sort} onSort={(s) => (sort = s)} />
				<th scope="col" class="px-2 py-1.5 font-medium">Direction</th>
				<SortHeader column="target" label="To" {sort} onSort={(s) => (sort = s)} />
				<SortHeader
					column="confidence"
					label="Confidence"
					{sort}
					onSort={(s) => (sort = s)}
					class="text-right"
					align="right"
				/>
				<SortHeader column="origin" label="Origin" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="review" label="Review" {sort} onSort={(s) => (sort = s)} />
				<SortHeader
					column="count"
					label="Events"
					{sort}
					onSort={(s) => (sort = s)}
					class="text-right"
					align="right"
				/>
				<SortHeader column="firstSeen" label="First seen" {sort} onSort={(s) => (sort = s)} />
				<th scope="col" class="w-20 px-2 py-1.5"><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			{#each paged.rows as r (r.key)}
				{@const e = r.edge}
				{@const isSel = selected.has(r.key)}
				{@const editable = canEdit && r.stored}
				{@const working = busy.has(r.key)}
				{@const name = `${r.source} ${r.relation} ${r.target}`}
				<tr class={isSel ? 'bg-primary/5' : 'hover:bg-accent/50'}>
					<td class="border-b px-2 py-1">
						<input
							type="checkbox"
							class="h-3.5 w-3.5 accent-primary"
							checked={isSel}
							onclick={(ev) => toggle(r.key, ev)}
							aria-label={`Select ${name}`}
						/>
					</td>
					<td class="max-w-48 truncate border-b px-2 py-1" title={r.source}>
						<button
							type="button"
							class="max-w-full truncate hover:underline"
							onclick={() => (graph.rail = { type: 'node', key: e.source })}
						>
							{r.source}
						</button>
					</td>
					<td class="border-b px-2 py-1">
						{#if editable}
							<select
								class={selectClass}
								value={e.relation.id === null ? '' : String(e.relation.id)}
								disabled={working}
								aria-label={`Relation type of ${name}`}
								onchange={(ev) => setRelation(e, ev.currentTarget.value)}
							>
								{#if e.relation.id === null}
									<option value="" disabled>{r.relation}</option>
								{/if}
								{#each graph.relationTypes as t (t.id)}
									<option value={String(t.id)}>{t.label}</option>
								{/each}
							</select>
						{:else}
							<span>{r.relation}</span>
						{/if}
						{#if r.label}
							<span class="ml-1 text-muted-foreground" title={r.label}>“{r.label}”</span>
						{/if}
					</td>
					<td class="whitespace-nowrap border-b px-2 py-1">
						{#if editable}
							<span class="inline-flex items-center gap-1">
								<select
									class={selectClass}
									value={e.directed ? 'directed' : 'undirected'}
									disabled={working}
									aria-label={`Direction of ${name}`}
									onchange={(ev) => {
										const directed = ev.currentTarget.value === 'directed';
										if (directed !== e.directed) void patch(e, { directed });
									}}
								>
									<option value="directed">From → to</option>
									<option value="undirected">Both ways</option>
								</select>
								{#if e.directed}
									<button
										type="button"
										class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
										disabled={working}
										title="Reverse the direction"
										aria-label={`Reverse ${name}`}
										onclick={() => edit([r.key], () => graph.reverseEdge(e), 'Relation reversed')}
									>
										<ArrowLeftRightIcon class="h-3.5 w-3.5" />
									</button>
								{/if}
							</span>
						{:else if r.directed}
							<ArrowRightIcon class="h-3.5 w-3.5 text-muted-foreground" aria-label="Directed" />
						{:else}
							<MinusIcon class="h-3.5 w-3.5 text-muted-foreground" aria-label="Undirected" />
						{/if}
					</td>
					<td class="max-w-48 truncate border-b px-2 py-1" title={r.target}>
						<button
							type="button"
							class="max-w-full truncate hover:underline"
							onclick={() => (graph.rail = { type: 'node', key: e.target })}
						>
							{r.target}
						</button>
					</td>
					<td class="border-b px-2 py-1 text-right tabular-nums">
						{#if editable}
							<input
								class="h-6 w-12 rounded border border-input bg-background px-1 text-right text-xs disabled:opacity-50"
								value={e.confidence === null ? '' : String(e.confidence)}
								inputmode="numeric"
								placeholder="–"
								disabled={working}
								aria-label={`Confidence of ${name}, percent`}
								onblur={(ev) => commitConfidence(e, ev.currentTarget)}
								onkeydown={(ev) => {
									if (ev.key === 'Enter') ev.currentTarget.blur();
									else if (ev.key === 'Escape') {
										ev.currentTarget.value = e.confidence === null ? '' : String(e.confidence);
										ev.currentTarget.blur();
									}
								}}
							/>
						{:else if r.confidence !== null}
							{r.confidence}%
						{/if}
					</td>
					<td class="whitespace-nowrap border-b px-2 py-1">{ORIGIN_LABEL[r.origin] ?? r.origin}</td>
					<td class="whitespace-nowrap border-b px-2 py-1">
						<span class="rounded px-1 text-[10px] {REVIEW_CLASS[r.review] ?? ''}">{r.review}</span>
						{#if editable && r.review !== 'accepted'}
							<button
								type="button"
								class="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
								disabled={working}
								title="Accept"
								aria-label={`Accept ${name}`}
								onclick={() =>
									edit([r.key], () => graph.reviewEdge(e, 'accept'), 'Relation accepted')}
							>
								<CheckIcon class="h-3 w-3" />
							</button>
						{/if}
						{#if editable && r.review !== 'rejected'}
							<button
								type="button"
								class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
								disabled={working}
								title="Reject"
								aria-label={`Reject ${name}`}
								onclick={() =>
									edit([r.key], () => graph.reviewEdge(e, 'reject'), 'Relation rejected')}
							>
								<XIcon class="h-3 w-3" />
							</button>
						{/if}
					</td>
					<td class="border-b px-2 py-1 text-right tabular-nums">{r.count}</td>
					<td class="whitespace-nowrap border-b px-2 py-1 tabular-nums">{date(r.firstSeen)}</td>
					<td class="whitespace-nowrap border-b px-2 py-1 text-right">
						<button
							type="button"
							class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							title="Details"
							aria-label={`Details of ${name}`}
							onclick={() => (graph.rail = { type: 'edge', key: r.key })}
						>
							<EyeIcon class="h-3.5 w-3.5" />
						</button>
						<button
							type="button"
							class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							title="Show on the canvas"
							aria-label={`Show ${name} on the canvas`}
							onclick={() => locate([], [r.key])}
						>
							<CrosshairIcon class="h-3.5 w-3.5" />
						</button>
						{#if editable}
							<button
								type="button"
								class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
								disabled={working}
								title="Delete"
								aria-label={`Delete ${name}`}
								onclick={() => actions.deleteEdges([e])}
							>
								<Trash2Icon class="h-3.5 w-3.5" />
							</button>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="11" class="px-3 py-8 text-center text-muted-foreground">
						{rows.length ? 'No relation matches the filter.' : 'No relation on the canvas.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<TablePager
	page={paged.page}
	pages={paged.pages}
	total={sorted.length}
	of={rows.length}
	unit="relation"
	onPage={(p) => (page = p)}
/>
