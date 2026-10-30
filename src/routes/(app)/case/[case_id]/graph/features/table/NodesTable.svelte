<!--
  Objects of the graph as a table: sortable columns, row filter, multi-select
  with bulk actions (show on the canvas, hide, pin, task / tags / flag).
-->
<script lang="ts">
	import {
		CrosshairIcon,
		EyeOffIcon,
		FlagIcon,
		ListTodoIcon,
		PinIcon,
		SquareArrowOutUpRightIcon,
		TagIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDateTime } from '$lib/utils/time-formatter';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { searchNodes } from '../../lib/search';
	import {
		filterRows,
		headerSelection,
		nodeRow,
		pageOf,
		sortRows,
		toCsv,
		toggleRowSelection,
		type NodeColumn,
		type NodeRow,
		type SortState
	} from '../../lib/table';
	import NodeKindIcon from '../../components/NodeKindIcon.svelte';
	import { getGraphFeatures } from '../context';
	import SortHeader from './SortHeader.svelte';
	import { indeterminate } from './indeterminate';
	import TablePager from './TablePager.svelte';

	interface Props {
		graph: CaseGraphState;
		filter: string;
		locate: (nodeKeys: string[], edgeKeys?: string[]) => void;
		csv: (() => string) | null;
	}

	let { graph, filter, locate, csv = $bindable() }: Props = $props();

	const { canEdit, actions } = getGraphFeatures();

	const PAGE_SIZE = 100;

	let sort = $state<SortState<NodeColumn> | null>({ column: 'label', dir: 'asc' });
	let page = $state(1);
	let selected = $state.raw<Set<string>>(new Set());
	let anchor = $state<string | null>(null);
	let withOffCanvas = $state(false);

	const degrees = $derived.by(() => {
		const d = new Map<string, number>();
		for (const e of graph.edges) {
			if (!graph.visibility.edges.has(e.key)) continue;
			d.set(e.source, (d.get(e.source) ?? 0) + 1);
			d.set(e.target, (d.get(e.target) ?? 0) + 1);
		}
		return d;
	});

	const rows = $derived.by<NodeRow[]>(() => {
		const matches = graph.matches ? new Set(graph.matches) : null;
		const onCanvas = graph.nodes.filter(
			(n) => graph.visibility.nodes.has(n.key) && (!matches || matches.has(n.key))
		);
		let list = onCanvas;
		if (withOffCanvas) {
			const off = graph.offCanvas;
			const hits = searchNodes(off, graph.query);
			const keep = hits ? new Set(hits) : null;
			list = [...onCanvas, ...off.filter((n) => !keep || keep.has(n.key))];
		}
		return list.map((n) => nodeRow(n, degrees.get(n.key) ?? 0));
	});

	const filtered = $derived(
		filterRows(rows, filter, ['label', 'kind', 'type', 'subtitle', 'tags', 'flags'])
	);
	const sorted = $derived(sortRows(filtered, sort));
	const paged = $derived(pageOf(sorted, page, PAGE_SIZE));
	const listedKeys = $derived(sorted.map((r) => r.key));
	const head = $derived(headerSelection(selected, listedKeys));
	const selectedKeys = $derived(listedKeys.filter((k) => selected.has(k)));

	$effect(() => {
		// Back to the first page when the rows change shape.
		void filter;
		void sort;
		void withOffCanvas;
		page = 1;
	});

	$effect(() => {
		csv = () =>
			toCsv(
				['kind', 'label', 'type', 'details', 'tags', 'first_seen', 'last_seen', 'links', 'events'],
				sorted.map((r) => [
					r.kind,
					r.label,
					r.type,
					r.subtitle,
					r.tags,
					r.firstSeen,
					r.lastSeen,
					r.degree,
					r.events
				])
			);
		return () => (csv = null);
	});

	const toggle = (key: string, e: MouseEvent | KeyboardEvent) => {
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

	const onCanvas = (key: string) => graph.visibility.nodes.has(key);
	const kinds = $derived(new Set(selectedKeys.map((k) => graph.node(k)?.kind)));
	const date = (v: string | null) => (v ? formatDateTime(v) : '');
</script>

{#if selectedKeys.length}
	<div
		class="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-3 py-1 text-xs"
		role="toolbar"
		aria-label="Actions on the selected objects"
	>
		<span class="mr-1 font-medium">{selectedKeys.length} selected</span>
		<Button size="xs" variant="outline" onclick={() => locate(selectedKeys)}>
			<CrosshairIcon class="mr-1 h-3.5 w-3.5" />Show on the canvas
		</Button>
		<Button
			size="xs"
			variant="outline"
			onclick={() => {
				graph.hide(selectedKeys.filter(onCanvas));
				selected = new Set();
			}}
		>
			<EyeOffIcon class="mr-1 h-3.5 w-3.5" />Hide
		</Button>
		<Button size="xs" variant="outline" onclick={() => graph.togglePin(selectedKeys)}>
			<PinIcon class="mr-1 h-3.5 w-3.5" />Pin / unpin
		</Button>
		{#if canEdit()}
			<Button size="xs" variant="outline" onclick={() => actions.bulk('task', selectedKeys)}>
				<ListTodoIcon class="mr-1 h-3.5 w-3.5" />Task…
			</Button>
			<Button size="xs" variant="outline" onclick={() => actions.bulk('tag', selectedKeys)}>
				<TagIcon class="mr-1 h-3.5 w-3.5" />Tags…
			</Button>
			<Button
				size="xs"
				variant="outline"
				disabled={!kinds.has('asset')}
				onclick={() => actions.bulk('flag', selectedKeys)}
			>
				<FlagIcon class="mr-1 h-3.5 w-3.5" />Flag…
			</Button>
		{/if}
		<Button size="xs" variant="ghost" onclick={() => (selected = new Set())}>Clear</Button>
	</div>
{/if}

<div class="min-h-0 flex-1 overflow-auto">
	<table class="w-full border-separate border-spacing-0 text-xs">
		<caption class="sr-only">Objects of the graph</caption>
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
						aria-label="Select every listed object"
					/>
				</th>
				<SortHeader column="label" label="Name" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="kind" label="Kind" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="type" label="Type" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="subtitle" label="Details" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="tags" label="Tags" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="firstSeen" label="First seen" {sort} onSort={(s) => (sort = s)} />
				<SortHeader column="lastSeen" label="Last seen" {sort} onSort={(s) => (sort = s)} />
				<SortHeader
					column="degree"
					label="Links"
					{sort}
					onSort={(s) => (sort = s)}
					class="text-right"
					align="right"
				/>
				<SortHeader
					column="events"
					label="Events"
					{sort}
					onSort={(s) => (sort = s)}
					class="text-right"
					align="right"
				/>
				<th scope="col" class="w-16 px-2 py-1.5"><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody>
			{#each paged.rows as r (r.key)}
				{@const isSel = selected.has(r.key)}
				<tr
					class="group {isSel ? 'bg-primary/5' : 'hover:bg-accent/50'} {onCanvas(r.key)
						? ''
						: 'text-muted-foreground'}"
				>
					<td class="border-b px-2 py-1">
						<input
							type="checkbox"
							class="h-3.5 w-3.5 accent-primary"
							checked={isSel}
							onclick={(e) => toggle(r.key, e)}
							aria-label={`Select ${r.label}`}
						/>
					</td>
					<td class="max-w-72 border-b px-2 py-1">
						<button
							type="button"
							class="flex max-w-full items-center gap-1.5 text-left hover:underline"
							title="Show the details"
							onclick={() => (graph.rail = { type: 'node', key: r.key })}
						>
							<NodeKindIcon kind={r.node.kind} color={r.node.color} class="h-3.5 w-3.5 shrink-0" />
							<span class="truncate font-medium text-foreground">{r.label}</span>
							{#if r.compromised}
								<span
									class="shrink-0 rounded bg-red-500/15 px-1 text-[10px] text-red-700 dark:text-red-300"
								>
									compromised
								</span>
							{/if}
							{#if !onCanvas(r.key)}
								<span class="shrink-0 rounded border px-1 text-[10px]">not drawn</span>
							{/if}
						</button>
					</td>
					<td class="whitespace-nowrap border-b px-2 py-1">{r.kind}</td>
					<td class="max-w-40 truncate border-b px-2 py-1" title={r.type}>{r.type}</td>
					<td class="max-w-56 truncate border-b px-2 py-1" title={r.subtitle}>{r.subtitle}</td>
					<td class="max-w-48 truncate border-b px-2 py-1" title={r.tags}>{r.tags}</td>
					<td class="whitespace-nowrap border-b px-2 py-1 tabular-nums">{date(r.firstSeen)}</td>
					<td class="whitespace-nowrap border-b px-2 py-1 tabular-nums">{date(r.lastSeen)}</td>
					<td class="border-b px-2 py-1 text-right tabular-nums">{r.degree}</td>
					<td class="border-b px-2 py-1 text-right tabular-nums">{r.events || ''}</td>
					<td class="whitespace-nowrap border-b px-2 py-1 text-right">
						<button
							type="button"
							class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							aria-label={`Show ${r.label} on the canvas`}
							title="Show on the canvas"
							onclick={() => locate([r.key])}
						>
							<CrosshairIcon class="h-3.5 w-3.5" />
						</button>
						{#if r.node.url}
							<a
								href={r.node.url}
								class="inline-block rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
								aria-label={`Open ${r.label}`}
								title="Open"
							>
								<SquareArrowOutUpRightIcon class="h-3.5 w-3.5" />
							</a>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="11" class="px-3 py-8 text-center text-muted-foreground">
						{rows.length ? 'No object matches the filter.' : 'No object on the canvas.'}
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
	unit="object"
	onPage={(p) => (page = p)}
>
	{#if graph.offCanvas.length}
		<label class="flex items-center gap-1.5">
			<input type="checkbox" class="h-3.5 w-3.5 accent-primary" bind:checked={withOffCanvas} />
			Also list the {graph.offCanvas.length} objects not drawn
		</label>
	{/if}
</TablePager>
