<!--
  The xyflow canvas plus the node palette. Must be rendered inside a
  `SvelteFlowProvider` (palette drops convert screen to flow coordinates).
  `nodes` / `edges` are bound raw arrays; labels and configs live in the
  editor's meta map, read by WorkflowNode through context.
-->
<script lang="ts">
	import '@xyflow/svelte/dist/style.css';
	import {
		Background,
		Controls,
		MiniMap,
		SvelteFlow,
		useSvelteFlow,
		type Connection,
		type NodeTypes
	} from '@xyflow/svelte';
	import { mode } from 'mode-watcher';
	import {
		addConnection,
		DEFAULT_PORTS,
		isConnectionAllowed,
		labelFor,
		type FlowEdge,
		type FlowNode
	} from '$lib/utils/ai-workflow-graph';
	import type { AiWorkflowCatalogue } from '$lib/services/ai-workflows.service';
	import WorkflowNode from './WorkflowNode.svelte';
	import { nodeIcon, nodeTone } from '../helpers/ui';

	type Props = {
		nodes: FlowNode[];
		edges: FlowEdge[];
		catalogue: AiWorkflowCatalogue | null;
		readOnly?: boolean;
		onAddNode: (type: string, position: { x: number; y: number }) => void;
		onSelect: (id: string | null) => void;
		onChange?: () => void;
	};

	let {
		nodes = $bindable(),
		edges = $bindable(),
		catalogue,
		readOnly = false,
		onAddNode,
		onSelect,
		onChange
	}: Props = $props();

	const DRAG_MIME = 'application/x-iris-workflow-node';
	const nodeTypes: NodeTypes = { workflow: WorkflowNode };
	const { screenToFlowPosition } = useSvelteFlow();

	let wrapper = $state<HTMLDivElement | null>(null);

	/** Palette entries: the catalogue when loaded, else the built-in list. Never the trigger. */
	const palette = $derived.by(() => {
		const types = catalogue?.node_types?.length
			? catalogue.node_types.map((t) => ({
					type: t.type,
					label: t.label,
					description: t.description,
					category: t.category || 'Other'
				}))
			: Object.keys(DEFAULT_PORTS).map((type) => ({
					type,
					label: labelFor(type),
					description: '',
					category: 'Nodes'
				}));
		const groups = new Map<string, typeof types>();
		for (const t of types) {
			if (t.type === 'trigger') continue;
			const list = groups.get(t.category) ?? [];
			list.push(t);
			groups.set(t.category, list);
		}
		return [...groups.entries()];
	});

	function onDragStart(event: DragEvent, type: string) {
		if (!event.dataTransfer) return;
		event.dataTransfer.setData(DRAG_MIME, type);
		event.dataTransfer.effectAllowed = 'move';
	}

	function onDragOver(event: DragEvent) {
		if (readOnly) return;
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
	}

	function onDrop(event: DragEvent) {
		if (readOnly) return;
		event.preventDefault();
		const type = event.dataTransfer?.getData(DRAG_MIME);
		if (!type) return;
		onAddNode(type, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
	}

	/** Click-to-add: drop the node in the middle of the visible canvas. */
	function addAtCenter(type: string) {
		if (readOnly) return;
		const rect = wrapper?.getBoundingClientRect();
		const point = rect
			? { x: rect.left + rect.width / 2 - 112, y: rect.top + rect.height / 2 - 24 }
			: { x: 0, y: 0 };
		const jitter = (nodes.length % 5) * 24;
		const pos = screenToFlowPosition(point);
		onAddNode(type, { x: pos.x + jitter, y: pos.y + jitter });
	}

	function onBeforeConnect(connection: Connection): false {
		// Edges are built here (stable ids, port label, dedupe); xyflow's own add is skipped.
		if (!isConnectionAllowed(connection, nodes)) return false;
		const next = addConnection(edges, connection);
		if (next !== edges) {
			edges = next;
			onChange?.();
		}
		return false;
	}

	async function onBeforeDelete({
		nodes: deletingNodes,
		edges: deletingEdges
	}: {
		nodes: FlowNode[];
		edges: FlowEdge[];
	}) {
		if (readOnly) return false;
		const keptNodes = deletingNodes.filter((n) => n.data.nodeType !== 'trigger');
		return { nodes: keptNodes, edges: deletingEdges };
	}
</script>

<div class="flex h-full min-h-0">
	{#if !readOnly}
		<aside
			class="flex w-48 shrink-0 flex-col gap-3 overflow-y-auto border-r bg-muted/20 p-2"
			data-testid="wf-palette"
		>
			<p class="px-1 text-2xs text-muted-foreground">Drag onto the canvas, or click to add.</p>
			{#each palette as [category, items] (category)}
				<div class="flex flex-col gap-1">
					<span class="px-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
						{category}
					</span>
					{#each items as item (item.type)}
						{@const Icon = nodeIcon(item.type)}
						<button
							type="button"
							draggable="true"
							class="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs hover:border-primary"
							title={item.description || item.label}
							ondragstart={(e) => onDragStart(e, item.type)}
							onclick={() => addAtCenter(item.type)}
							data-testid={`wf-palette-${item.type}`}
						>
							<span
								class={`flex size-5 shrink-0 items-center justify-center rounded ${nodeTone(item.type)}`}
							>
								<Icon size={11} />
							</span>
							<span class="truncate">{item.label}</span>
						</button>
					{/each}
				</div>
			{/each}
		</aside>
	{/if}

	<div
		class="relative min-w-0 flex-1"
		bind:this={wrapper}
		ondragover={onDragOver}
		ondrop={onDrop}
		role="application"
		data-testid="wf-canvas"
	>
		<SvelteFlow
			bind:nodes
			bind:edges
			{nodeTypes}
			fitView
			colorMode={$mode === 'dark' ? 'dark' : 'light'}
			deleteKey={readOnly ? null : ['Backspace', 'Delete']}
			nodesDraggable={!readOnly}
			nodesConnectable={!readOnly}
			isValidConnection={(c) => isConnectionAllowed(c, nodes)}
			onbeforeconnect={onBeforeConnect}
			onbeforedelete={onBeforeDelete}
			ondelete={() => {
				onSelect(null);
				onChange?.();
			}}
			onnodeclick={({ node }) => onSelect(node.id)}
			onpaneclick={() => onSelect(null)}
			onnodedragstop={() => onChange?.()}
		>
			<Background />
			<Controls showLock={false} />
			<MiniMap pannable zoomable class="!hidden md:!block" />
		</SvelteFlow>
	</div>
</div>
