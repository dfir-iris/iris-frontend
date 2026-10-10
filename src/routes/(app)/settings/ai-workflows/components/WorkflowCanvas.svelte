<!--
  The xyflow canvas plus the node palette and the saved blocks. Must be
  rendered inside a
  `SvelteFlowProvider` (palette drops convert screen to flow coordinates).
  `nodes` / `edges` are bound raw arrays; labels and configs live in the
  editor's meta map, read by WorkflowNode through context.
  Links can leave and enter a node on any side: dropped on a connector
  they use it, dropped anywhere on a node they enter on its side facing
  the link's start.
-->
<script lang="ts">
	import '@xyflow/svelte/dist/style.css';
	import { getContext } from 'svelte';
	import {
		Background,
		Controls,
		MiniMap,
		Panel,
		SvelteFlow,
		useSvelteFlow,
		type Connection,
		type EdgeTypes,
		type OnConnectEnd,
		type NodeTypes
	} from '@xyflow/svelte';
	import { mode } from 'mode-watcher';
	import {
		ArrowDownIcon,
		ArrowRightIcon,
		BlocksIcon,
		DownloadIcon,
		PackagePlusIcon,
		Trash2Icon,
		UploadIcon
	} from 'lucide-svelte';
	import {
		addConnection,
		DEFAULT_PORTS,
		facingSide,
		handleId,
		handlesOf,
		INPUT_HANDLE,
		isConnectionAllowed,
		labelFor,
		type FlowDirection,
		type FlowEdge,
		type FlowNode
	} from '$lib/utils/ai-workflow-graph';
	import type { AiBlock, AiWorkflowCatalogue } from '$lib/services/ai-workflows.service';
	import WorkflowNode from './WorkflowNode.svelte';
	import RoutedEdge from './RoutedEdge.svelte';
	import PanelResizer from './PanelResizer.svelte';
	import { WORKFLOW_EDITOR_CTX, nodeIcon, nodeTone } from '../helpers/ui';
	import type { WorkflowEditorCtx } from '../helpers/editor';

	type Props = {
		nodes: FlowNode[];
		edges: FlowEdge[];
		catalogue: AiWorkflowCatalogue | null;
		readOnly?: boolean;
		onAddNode: (type: string, position: { x: number; y: number }) => void;
		onSelect: (id: string | null) => void;
		onChange?: () => void;
		/** Saved blocks; the section is hidden without `onInsertBlock`. */
		blocks?: AiBlock[];
		onInsertBlock?: (block: AiBlock, position: { x: number; y: number }) => void;
		onSaveSelection?: () => void;
		onImportBlock?: () => void;
		onExportBlock?: (block: AiBlock) => void;
		onDeleteBlock?: (block: AiBlock) => void;
		/** The way most connectors read; the toggle is hidden without `onSetDirection`. */
		direction?: FlowDirection;
		onSetDirection?: (direction: FlowDirection) => void;
	};

	let {
		nodes = $bindable(),
		edges = $bindable(),
		catalogue,
		readOnly = false,
		onAddNode,
		onSelect,
		onChange,
		blocks = [],
		onInsertBlock,
		onSaveSelection,
		onImportBlock,
		onExportBlock,
		onDeleteBlock,
		direction = 'horizontal',
		onSetDirection
	}: Props = $props();

	const PALETTE_WIDTH = 192;
	let paletteWidth = $state(PALETTE_WIDTH);
	const DIRECTIONS: { value: FlowDirection; label: string; icon: typeof ArrowRightIcon }[] = [
		{ value: 'horizontal', label: 'Left to right', icon: ArrowRightIcon },
		{ value: 'vertical', label: 'Top to bottom', icon: ArrowDownIcon }
	];

	const DRAG_MIME = 'application/x-iris-workflow-node';
	const DRAG_BLOCK_MIME = 'application/x-iris-workflow-block';
	const nodeTypes: NodeTypes = { workflow: WorkflowNode };
	// Every edge goes around the nodes in its way
	const edgeTypes: EdgeTypes = { default: RoutedEdge };
	const { screenToFlowPosition, getInternalNode } = useSvelteFlow();
	const editor = getContext<WorkflowEditorCtx | undefined>(WORKFLOW_EDITOR_CTX);

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

	const selectedCount = $derived(
		nodes.filter((n) => n.selected && n.data.nodeType !== 'trigger').length
	);
	const blockGroups = $derived.by(() => {
		const groups = new Map<string, AiBlock[]>();
		for (const b of blocks) {
			const key = b.category || 'Blocks';
			groups.set(key, [...(groups.get(key) ?? []), b]);
		}
		return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
	});

	// Only drags started from this palette are dropped: another page can set the same types.
	let paletteDrag = false;

	function onDragStart(event: DragEvent, type: string) {
		if (!event.dataTransfer) return;
		paletteDrag = true;
		event.dataTransfer.setData(DRAG_MIME, type);
		event.dataTransfer.effectAllowed = 'move';
	}

	function blockTitle(block: AiBlock): string {
		const count = block.definition.nodes.length;
		const keys = block.requirements?.keystore ?? [];
		return [
			block.description || block.name,
			`${count} node${count === 1 ? '' : 's'} · ${block.is_shared ? 'shared' : 'private'}`,
			keys.length ? `Keystore: ${keys.join(', ')}` : ''
		]
			.filter(Boolean)
			.join('\n');
	}

	function onBlockDragStart(event: DragEvent, block: AiBlock) {
		if (!event.dataTransfer) return;
		paletteDrag = true;
		event.dataTransfer.setData(DRAG_BLOCK_MIME, String(block.id));
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
		if (!paletteDrag) return;
		paletteDrag = false;
		const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
		const blockId = event.dataTransfer?.getData(DRAG_BLOCK_MIME);
		if (blockId) {
			const block = blocks.find((b) => String(b.id) === blockId);
			if (block) onInsertBlock?.(block, position);
			return;
		}
		const type = event.dataTransfer?.getData(DRAG_MIME);
		if (!type) return;
		onAddNode(type, position);
	}

	/** Middle of the visible canvas, shifted a little each time. */
	function centerPosition() {
		const rect = wrapper?.getBoundingClientRect();
		const point = rect
			? { x: rect.left + rect.width / 2 - 112, y: rect.top + rect.height / 2 - 24 }
			: { x: 0, y: 0 };
		const jitter = (nodes.length % 5) * 24;
		const pos = screenToFlowPosition(point);
		return { x: pos.x + jitter, y: pos.y + jitter };
	}

	/** Click-to-add: drop the node in the middle of the visible canvas. */
	function addAtCenter(type: string) {
		if (readOnly) return;
		onAddNode(type, centerPosition());
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

	/**
	 * A link from an output dropped on a node but off its connectors: it
	 * enters the node on the side facing where the link starts.
	 */
	const onConnectEnd: OnConnectEnd = (event, state) => {
		if (readOnly || state.isValid || !state.fromNode || state.fromHandle?.type !== 'source') return;
		const point = 'changedTouches' in event ? event.changedTouches[0] : event;
		if (!point) return;
		const targetId = document
			.elementFromPoint(point.clientX, point.clientY)
			?.closest('.svelte-flow__node')
			?.getAttribute('data-id');
		const target = targetId ? getInternalNode(targetId) : undefined;
		if (!targetId || !target) return;
		const side = facingSide(
			{
				...target.internals.positionAbsolute,
				width: target.measured.width ?? 0,
				height: target.measured.height ?? 0
			},
			state.from
		);
		onBeforeConnect({
			source: state.fromNode.id,
			sourceHandle: state.fromHandle.id ?? null,
			target: targetId,
			targetHandle: handleId(INPUT_HANDLE, side, handlesOf(editor?.meta, targetId).input)
		});
	};

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
			class="flex shrink-0 flex-col gap-3 overflow-y-auto border-r bg-muted/20 p-2"
			style={`width: ${paletteWidth}px`}
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
							ondragend={() => (paletteDrag = false)}
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

			{#if onInsertBlock}
				<div class="flex flex-col gap-1 border-t pt-2" data-testid="wf-blocks">
					<span
						class="flex items-center gap-1 px-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
					>
						<BlocksIcon size={11} /> Saved blocks
					</span>
					<div class="flex gap-1">
						<button
							type="button"
							class="flex flex-1 items-center justify-center gap-1 rounded-md border bg-card px-1.5 py-1 text-2xs hover:border-primary disabled:opacity-50"
							disabled={!selectedCount}
							title={selectedCount
								? `Save the ${selectedCount} selected node${selectedCount === 1 ? '' : 's'} as a block`
								: 'Select nodes on the canvas (shift + drag, or ctrl/cmd + click) to save them as a block'}
							onclick={() => onSaveSelection?.()}
							data-testid="wf-block-save-selection"
						>
							<PackagePlusIcon size={11} /> Save selection
						</button>
						<button
							type="button"
							class="flex items-center justify-center rounded-md border bg-card px-1.5 py-1 hover:border-primary"
							title="Import a block (JSON)"
							aria-label="Import a block"
							onclick={() => onImportBlock?.()}
							data-testid="wf-block-import"
						>
							<UploadIcon size={11} />
						</button>
					</div>
					{#if !blocks.length}
						<p class="px-1 text-2xs text-muted-foreground">
							No saved block yet: select nodes and save them to reuse them in any workflow.
						</p>
					{/if}
					{#each blockGroups as [category, items] (category)}
						<span class="mt-1 px-1 text-[10px] text-muted-foreground">{category}</span>
						{#each items as block (block.id)}
							<div class="group flex items-center gap-0.5">
								<button
									type="button"
									draggable="true"
									class="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-left text-xs hover:border-primary"
									title={blockTitle(block)}
									ondragstart={(e) => onBlockDragStart(e, block)}
									ondragend={() => (paletteDrag = false)}
									onclick={() => onInsertBlock?.(block, centerPosition())}
									data-testid={`wf-block-${block.id}`}
								>
									<span
										class="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary"
									>
										<BlocksIcon size={11} />
									</span>
									<span class="truncate">{block.name}</span>
								</button>
								<div class="hidden flex-col group-hover:flex">
									<button
										type="button"
										class="rounded p-0.5 text-muted-foreground hover:text-foreground"
										title="Export (JSON)"
										aria-label={`Export ${block.name}`}
										onclick={() => onExportBlock?.(block)}
									>
										<DownloadIcon size={10} />
									</button>
									{#if block.can_edit}
										<button
											type="button"
											class="rounded p-0.5 text-muted-foreground hover:text-destructive"
											title="Delete"
											aria-label={`Delete ${block.name}`}
											onclick={() => onDeleteBlock?.(block)}
										>
											<Trash2Icon size={10} />
										</button>
									{/if}
								</div>
							</div>
						{/each}
					{/each}
				</div>
			{/if}
		</aside>
		<PanelResizer
			bind:width={paletteWidth}
			side="left"
			storageKey="ai-wf-palette-width"
			initial={PALETTE_WIDTH}
			min={140}
			max={480}
			label="Resize the node palette"
		/>
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
			{edgeTypes}
			fitView
			colorMode={$mode === 'dark' ? 'dark' : 'light'}
			deleteKey={readOnly ? null : ['Backspace', 'Delete']}
			nodesDraggable={!readOnly}
			nodesConnectable={!readOnly}
			isValidConnection={(c) => isConnectionAllowed(c, nodes)}
			connectionRadius={36}
			onbeforeconnect={onBeforeConnect}
			onconnectend={onConnectEnd}
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
			{#if !readOnly && onSetDirection}
				<Panel position="top-right">
					<div
						class="flex items-center gap-0.5 rounded-md border bg-card p-0.5 shadow-sm"
						role="group"
						aria-label="Connector direction"
						data-testid="wf-direction"
					>
						{#each DIRECTIONS as d (d.value)}
							{@const DirectionIcon = d.icon}
							<button
								type="button"
								class={`flex items-center gap-1 rounded px-1.5 py-1 text-2xs ${
									direction === d.value
										? 'bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:bg-muted'
								}`}
								aria-pressed={direction === d.value}
								title={selectedCount
									? `${d.label}: connectors of the ${selectedCount} selected node${selectedCount === 1 ? '' : 's'}`
									: `${d.label}: connectors of every node (select nodes to change only them)`}
								onclick={() => onSetDirection(d.value)}
								data-testid={`wf-direction-${d.value}`}
							>
								<DirectionIcon size={11} />
								{d.label}
							</button>
						{/each}
					</div>
				</Panel>
			{/if}
			<Controls showLock={false} />
			<MiniMap pannable zoomable class="!hidden md:!block" />
		</SvelteFlow>
	</div>
</div>
