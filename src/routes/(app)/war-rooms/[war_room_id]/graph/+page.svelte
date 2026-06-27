<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import cytoscape from 'cytoscape';
	import type { Core, ElementDefinition, EventObject } from 'cytoscape';
	import { Save, Plus, Trash2, ExternalLink, ListChecks, HardDriveIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { toast } from '$lib/components/ui/toast';
	import {
		WarRoomGraphService,
		type GraphEdge,
		type GraphNode,
		type CaseSummary
	} from '$lib/services/war-room-graph.service';
	import { safeHexColor } from '$lib/utils/color';

	const warRoomId = $derived(Number(page.params.war_room_id));

	let containerEl: HTMLDivElement | null = $state(null);
	let cy: Core | null = null;
	let loading = $state(true);
	let saving = $state(false);
	let dirty = $state(false);
	let selectedNode = $state<GraphNode | null>(null);
	let caseSummary = $state<CaseSummary | null>(null);
	let summaryLoading = $state(false);

	let nodes: GraphNode[] = [];
	let edges: GraphEdge[] = [];

	const buildElements = (): ElementDefinition[] => {
		const els: ElementDefinition[] = [];
		for (const n of nodes) {
			const safeColor = safeHexColor(n.color);
			els.push({
				group: 'nodes',
				data: {
					id: String(n.node_id),
					label: n.label ?? (n.kind === 'case' ? `Case #${n.ref_id}` : 'Note'),
					kind: n.kind,
					ref_id: n.ref_id ?? null,
					color: safeColor ?? (n.kind === 'case' ? '#ef4444' : '#94a3b8')
				},
				position: { x: n.x, y: n.y }
			});
		}
		for (const e of edges) {
			els.push({
				group: 'edges',
				data: {
					id: e.edge_id ? `e${e.edge_id}` : `tmp-e-${Math.random()}`,
					source: String(e.from_node_id),
					target: String(e.to_node_id),
					label: e.label ?? ''
				}
			});
		}
		return els;
	};

	const initCy = () => {
		if (!containerEl) return;
		if (cy) cy.destroy();
		cy = cytoscape({
			container: containerEl,
			elements: buildElements(),
			layout: { name: 'preset' },
			wheelSensitivity: 0.2,
			style: [
				{
					selector: 'node',
					style: {
						'background-color': 'data(color)',
						label: 'data(label)',
						'text-valign': 'bottom',
						'text-halign': 'center',
						'text-margin-y': 6,
						color: '#e5e7eb',
						'font-size': '11px',
						'text-outline-color': '#0f172a',
						'text-outline-width': 2,
						width: 36,
						height: 36
					}
				},
				{
					selector: 'node[kind = "case"]',
					style: {
						shape: 'round-rectangle',
						width: 56,
						height: 40
					}
				},
				{
					selector: 'node[kind = "annotation"]',
					style: {
						shape: 'diamond',
						width: 28,
						height: 28
					}
				},
				{
					selector: 'edge',
					style: {
						width: 2,
						'line-color': '#64748b',
						'target-arrow-color': '#64748b',
						'target-arrow-shape': 'triangle',
						'curve-style': 'bezier',
						label: 'data(label)',
						'font-size': '10px',
						color: '#94a3b8',
						'text-rotation': 'autorotate',
						'text-background-color': '#020617',
						'text-background-opacity': 0.7,
						'text-background-padding': '2px'
					}
				},
				{
					selector: 'node:selected',
					style: {
						'border-color': '#fde047',
						'border-width': 3
					}
				}
			]
		});

		cy.on('tap', 'node', (evt: EventObject) => {
			const id = evt.target.id();
			const n = nodes.find((x) => String(x.node_id) === id) ?? null;
			selectedNode = n;
			if (n && n.kind === 'case' && n.ref_id) {
				loadSummary(n.ref_id);
			} else {
				caseSummary = null;
			}
		});

		cy.on('dragfree', 'node', (evt: EventObject) => {
			const id = evt.target.id();
			const pos = evt.target.position();
			const n = nodes.find((x) => String(x.node_id) === id);
			if (n) {
				n.x = pos.x;
				n.y = pos.y;
				dirty = true;
			}
		});

		cy.on('tap', (evt: EventObject) => {
			if (evt.target === cy) {
				selectedNode = null;
				caseSummary = null;
			}
		});
	};

	const load = async () => {
		loading = true;
		const res = await WarRoomGraphService.get(warRoomId);
		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as { nodes: GraphNode[]; edges: GraphEdge[] };
			nodes = payload.nodes ?? [];
			edges = payload.edges ?? [];
		}
		loading = false;
		setTimeout(initCy, 0);
	};

	const loadSummary = async (caseId: number) => {
		summaryLoading = true;
		const res = await WarRoomGraphService.caseSummary(caseId);
		summaryLoading = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			caseSummary = res.data as CaseSummary;
		}
	};

	const addAnnotation = () => {
		const tmp_id = `tmp-${Math.random().toString(36).slice(2, 9)}`;
		const n: GraphNode = {
			node_id: tmp_id,
			tmp_id,
			kind: 'annotation',
			ref_id: null,
			label: 'New annotation',
			note_md: null,
			color: '#94a3b8',
			x: 100 + Math.random() * 300,
			y: 100 + Math.random() * 200
		};
		nodes = [...nodes, n];
		dirty = true;
		initCy();
	};

	const removeSelected = () => {
		if (!selectedNode) return;
		const id = String(selectedNode.node_id);
		nodes = nodes.filter((n) => String(n.node_id) !== id);
		edges = edges.filter(
			(e) => String(e.from_node_id) !== id && String(e.to_node_id) !== id
		);
		selectedNode = null;
		caseSummary = null;
		dirty = true;
		initCy();
	};

	const save = async () => {
		saving = true;
		const res = await WarRoomGraphService.save(warRoomId, {
			nodes: nodes.map((n) => ({ ...n })),
			edges: edges.map((e) => ({ ...e }))
		});
		saving = false;
		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as { nodes: GraphNode[]; edges: GraphEdge[] };
			nodes = payload.nodes ?? [];
			edges = payload.edges ?? [];
			dirty = false;
			toast({ title: 'Graph saved' });
			initCy();
		} else {
			toast({ title: 'Could not save graph', variant: 'destructive' });
		}
	};

	onMount(load);
	onDestroy(() => {
		if (cy) cy.destroy();
	});
</script>

<div class="grid h-full grid-cols-[1fr_320px] overflow-hidden">
	<div class="relative flex h-full flex-col bg-slate-950">
		<div class="absolute right-3 top-3 z-10 flex gap-2">
			<Button size="sm" variant="secondary" onclick={addAnnotation}>
				<Plus class="mr-1 h-3.5 w-3.5" /> Annotation
			</Button>
			<Button
				size="sm"
				variant="secondary"
				disabled={!selectedNode}
				onclick={removeSelected}
			>
				<Trash2 class="mr-1 h-3.5 w-3.5" /> Remove
			</Button>
			<Button size="sm" disabled={!dirty || saving} onclick={save}>
				<Save class="mr-1 h-3.5 w-3.5" /> {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
			</Button>
		</div>

		{#if loading}
			<div class="m-4">
				<Skeleton class="h-full w-full" />
			</div>
		{/if}
		<div bind:this={containerEl} class="h-full w-full"></div>
	</div>

	<aside class="flex flex-col border-l bg-card/40 text-xs">
		{#if !selectedNode}
			<div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
				<p>Tap a node to see its details.</p>
				<p class="text-2xs">
					Drag nodes to reposition. Use the <em>Annotation</em> button to drop a free-floating note.
				</p>
			</div>
		{:else}
			<header class="border-b px-4 py-3">
				<p class="text-2xs uppercase tracking-wider text-muted-foreground">
					{selectedNode.kind}
				</p>
				<h3 class="truncate text-sm font-semibold">
					{selectedNode.label ?? 'Untitled'}
				</h3>
			</header>

			{#if selectedNode.kind === 'case' && selectedNode.ref_id}
				<div class="flex-1 overflow-y-auto px-4 py-3">
					{#if summaryLoading}
						<Skeleton class="h-24 w-full" />
					{:else if caseSummary}
						<div class="flex items-center justify-between">
							<a
								href={`/case/${caseSummary.case_id}`}
								class="text-xs text-primary hover:underline"
							>
								Open case <ExternalLink class="ml-0.5 inline h-3 w-3" />
							</a>
							{#if caseSummary.closed}
								<span class="rounded border px-1 text-2xs uppercase text-muted-foreground">
									Closed
								</span>
							{/if}
						</div>

						<div class="mt-3 grid grid-cols-3 gap-2 text-center">
							{#each [
								{ label: 'Open tasks', value: caseSummary.counts.tasks_open },
								{ label: 'Events', value: caseSummary.counts.events },
								{ label: 'Assets', value: caseSummary.counts.assets },
								{ label: 'IOCs', value: caseSummary.counts.iocs },
								{ label: 'Total tasks', value: caseSummary.counts.tasks_total },
								{ label: 'Owner', value: caseSummary.owner?.user_name ?? '—' }
							] as cell}
								<div class="rounded-md border bg-card/60 px-2 py-1.5">
									<p class="text-base font-semibold">{cell.value}</p>
									<p class="text-2xs uppercase tracking-wider text-muted-foreground">
										{cell.label}
									</p>
								</div>
							{/each}
						</div>

						{#if caseSummary.top_tasks.length > 0}
							<div class="mt-4">
								<p class="mb-1 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
									<ListChecks class="h-3 w-3" /> Recent tasks
								</p>
								<ul class="flex flex-col gap-1">
									{#each caseSummary.top_tasks as t (t.task_id)}
										<li class="rounded border bg-card/40 px-2 py-1 text-xs">
											{t.title ?? '(untitled)'}
										</li>
									{/each}
								</ul>
							</div>
						{/if}

						{#if caseSummary.last_activity}
							<div class="mt-4">
								<p class="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
									Last activity
								</p>
								<p class="text-xs">{caseSummary.last_activity.desc}</p>
								{#if caseSummary.last_activity.at}
									<p class="text-2xs text-muted-foreground">
										{new Date(caseSummary.last_activity.at).toLocaleString()}
									</p>
								{/if}
							</div>
						{/if}
					{:else}
						<p class="text-muted-foreground">No data.</p>
					{/if}
				</div>
			{:else}
				<div class="flex-1 overflow-y-auto p-4">
					<p class="text-muted-foreground">Annotation. Drag to reposition.</p>
				</div>
			{/if}
		{/if}
	</aside>
</div>
