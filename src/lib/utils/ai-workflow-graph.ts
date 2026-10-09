/**
 * Conversion between the AI-workflow graph stored by the backend
 * (`ai_workflow.graph`) and the nodes / edges xyflow renders.
 *
 * xyflow nodes only carry what the canvas needs (id, position, the
 * node type); the label and config live in a separate `meta` map the
 * editor mutates deeply, so editing a field never rebuilds the node
 * array. `flowToGraph` folds the three back into the stored format.
 * A node's `handles` (the sides its connectors sit on by default) is
 * kept only when it is not the default. Every node also has connectors
 * on its other sides: handle ids are the port (`out`, `true`…) or `in`
 * on the default side, `<port>@<side>` / `in@<side>` elsewhere, and an
 * edge drawn on another side stores `source_side` / `target_side`.
 */
import type { Edge, Node } from '@xyflow/svelte';
import type {
	AiBlockDefinition,
	AiGraphEdge,
	AiGraphNode,
	AiNodeTypeInfo,
	AiValidationError,
	AiWorkflowGraph
} from '$lib/services/ai-workflows.service';

/** Every workflow node renders with one custom component. */
export const FLOW_NODE_TYPE = 'workflow';

export interface FlowNodeData extends Record<string, unknown> {
	/** The workflow node type (`ai_agent`, `condition`…). */
	nodeType: string;
}

export type FlowNode = Node<FlowNodeData>;
export type FlowEdge = Edge;

export type HandleSide = 'left' | 'top' | 'right' | 'bottom';

export interface NodeHandles {
	input: HandleSide;
	output: HandleSide;
}

export const HANDLE_SIDES: HandleSide[] = ['left', 'top', 'right', 'bottom'];
export const DEFAULT_HANDLES: NodeHandles = { input: 'left', output: 'right' };

export interface NodeMeta {
	label: string;
	config: Record<string, unknown>;
	/** Absent = DEFAULT_HANDLES. */
	handles?: NodeHandles;
}

const isSide = (v: unknown): v is HandleSide => HANDLE_SIDES.includes(v as HandleSide);

/** Stored `handles` → the sides, or undefined when they are the default. */
export function readHandles(raw: unknown): NodeHandles | undefined {
	if (!raw || typeof raw !== 'object') return undefined;
	const r = raw as Record<string, unknown>;
	const handles: NodeHandles = {
		input: isSide(r.input) ? r.input : DEFAULT_HANDLES.input,
		output: isSide(r.output) ? r.output : DEFAULT_HANDLES.output
	};
	return sameHandles(handles, DEFAULT_HANDLES) ? undefined : handles;
}

export function sameHandles(a: NodeHandles, b: NodeHandles): boolean {
	return a.input === b.input && a.output === b.output;
}

export type NodeMetaMap = Record<string, NodeMeta>;

/** Ids that would reach Object.prototype when used as a map key; the backend refuses them too. */
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function metaOf(meta: NodeMetaMap | undefined, id: string): NodeMeta | undefined {
	return meta && Object.hasOwn(meta, id) ? meta[id] : undefined;
}

/** The default sides of node `id`. */
export function handlesOf(meta: NodeMetaMap | undefined, id: string): NodeHandles {
	return metaOf(meta, id)?.handles ?? DEFAULT_HANDLES;
}

/** The target handle's name. */
export const INPUT_HANDLE = 'in';

/** Handle id of `name` (a port or `in`) on `side`: the bare name on the default side. */
export function handleId(name: string, side: HandleSide, defaultSide: HandleSide): string {
	return side === defaultSide ? name : `${name}@${side}`;
}

/** Handle id → its name and, when not the default one, its side. */
export function parseHandle(
	id: string | null | undefined,
	fallback: string
): { name: string; side?: HandleSide } {
	if (!id) return { name: fallback };
	const at = id.lastIndexOf('@');
	const side = at > 0 ? id.slice(at + 1) : '';
	return isSide(side) ? { name: id.slice(0, at), side } : { name: id };
}

/**
 * The side of a node's box (`x`, `y`, `width`, `height`) facing `point`,
 * weighted by the box's proportions so a wide node is entered on top /
 * bottom only when the point is really above / below it.
 */
export function facingSide(
	box: { x: number; y: number; width: number; height: number },
	point: { x: number; y: number }
): HandleSide {
	const dx = (point.x - (box.x + box.width / 2)) / Math.max(box.width, 1);
	const dy = (point.y - (box.y + box.height / 2)) / Math.max(box.height, 1);
	if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
	return dy < 0 ? 'top' : 'bottom';
}

/** Which way a graph reads: connectors left → right, or top → bottom. */
export type FlowDirection = 'horizontal' | 'vertical';

export const DIRECTION_HANDLES: Record<FlowDirection, NodeHandles> = {
	horizontal: DEFAULT_HANDLES,
	vertical: { input: 'top', output: 'bottom' }
};

/** The direction most nodes follow; horizontal on a tie. */
export function flowDirection(meta: NodeMetaMap): FlowDirection {
	let vertical = 0;
	let horizontal = 0;
	for (const m of Object.values(meta)) {
		const output = (m.handles ?? DEFAULT_HANDLES).output;
		if (output === 'top' || output === 'bottom') vertical++;
		else horizontal++;
	}
	return vertical > horizontal ? 'vertical' : 'horizontal';
}

/** Puts the connectors of `ids` (every node when omitted) on the sides of `direction`. */
export function applyDirection(meta: NodeMetaMap, direction: FlowDirection, ids?: string[]): void {
	const handles = readHandles(DIRECTION_HANDLES[direction]);
	for (const id of ids ?? Object.keys(meta)) {
		const m = meta[id];
		if (!m) continue;
		if (handles) m.handles = { ...handles };
		else delete m.handles;
	}
}

/** Ports per node type when the catalogue is not loaded (spec table). */
export const DEFAULT_PORTS: Record<string, string[]> = {
	trigger: ['out'],
	ai_agent: ['out', 'error'],
	condition: ['true', 'false'],
	http_request: ['out', 'error', 'timeout'],
	ask_analyst: ['answered', 'timeout'],
	find_related: ['out', 'error'],
	find_war_room_tasks: ['found', 'none'],
	suggest: ['out'],
	action: ['out', 'error'],
	notify: ['out'],
	delay: ['out'],
	set_variables: ['out'],
	python: ['out', 'error'],
	stop: []
};

/** Config defaults when the catalogue is not loaded (spec table). */
export const DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
	trigger: {},
	ai_agent: {
		prompt: '',
		tools: [],
		output_schema: null,
		max_turns: 6,
		max_tool_calls: 10,
		model: null,
		include_entity: true
	},
	condition: { mode: 'rules', expression: '', logic: 'and', rules: [] },
	http_request: {
		method: 'POST',
		url: '',
		headers: [],
		query_params: [],
		auth_type: 'none',
		auth_username: '',
		auth_secret: '',
		body_mode: 'default',
		body_template: '',
		content_type: 'application/json',
		mode: 'sync',
		timeout_seconds: 15,
		wait_timeout_minutes: 60,
		verify_tls: true,
		use_proxy: true,
		response_format: 'json'
	},
	ask_analyst: { title: '', question: '', fields: [], fields_from: '', timeout_minutes: 1440 },
	find_related: {
		source: 'alert',
		days_back: 30,
		open_alerts: true,
		closed_alerts: false,
		open_cases: true,
		closed_cases: false,
		number_of_nodes: 100,
		search_value: ''
	},
	find_war_room_tasks: { since: 'last_run', minutes: 60 },
	suggest: {
		kind: 'generic_action',
		title: '',
		body: '',
		proposed_action: null,
		confidence: null,
		severity: 'medium'
	},
	action: { tool: '', arguments: {} },
	notify: { audience: 'entity', user_ids: [], title: '', body: '' },
	delay: { minutes: 5 },
	set_variables: { variables: [] },
	python: { code: 'result = {}', inputs: [], timeout_seconds: 5, max_steps: 200000 },
	stop: { status: 'succeeded', reason: '' }
};

const deepClone = <T>(value: T): T =>
	value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

function catalogueEntry(
	type: string,
	catalogue: AiNodeTypeInfo[] | null | undefined
): AiNodeTypeInfo | undefined {
	return catalogue?.find((t) => t.type === type);
}

export function portsFor(type: string, catalogue?: AiNodeTypeInfo[] | null): string[] {
	return catalogueEntry(type, catalogue)?.ports ?? DEFAULT_PORTS[type] ?? ['out'];
}

export function labelFor(type: string, catalogue?: AiNodeTypeInfo[] | null): string {
	const entry = catalogueEntry(type, catalogue);
	if (entry?.label) return entry.label;
	return type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function defaultConfigFor(
	type: string,
	catalogue?: AiNodeTypeInfo[] | null
): Record<string, unknown> {
	const fromCatalogue = catalogueEntry(type, catalogue)?.config_defaults;
	return deepClone({ ...(DEFAULT_CONFIGS[type] ?? {}), ...(fromCatalogue ?? {}) });
}

/** Stored graph → canvas nodes / edges + the editable meta map. */
export function graphToFlow(graph: AiWorkflowGraph | null | undefined): {
	nodes: FlowNode[];
	edges: FlowEdge[];
	meta: NodeMetaMap;
} {
	const meta: NodeMetaMap = {};
	const graphNodes = (graph?.nodes ?? []).filter((n) => !RESERVED_IDS.has(n.id));
	const nodes: FlowNode[] = graphNodes.map((n) => {
		meta[n.id] = { label: n.label ?? '', config: deepClone(n.config ?? {}) };
		const handles = readHandles(n.handles);
		if (handles) meta[n.id].handles = handles;
		return {
			id: n.id,
			type: FLOW_NODE_TYPE,
			position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
			data: { nodeType: n.type },
			// The trigger is the entry point: never deletable from the canvas.
			deletable: n.type !== 'trigger'
		};
	});
	const edges: FlowEdge[] = (graph?.edges ?? []).map((e) => toFlowEdge(e, meta));
	return { nodes, edges, meta };
}

/** Stored edge → canvas edge; `meta` gives the nodes' default sides. */
export function toFlowEdge(e: AiGraphEdge, meta?: NodeMetaMap): FlowEdge {
	const port = e.source_port || 'out';
	const from = handlesOf(meta, e.source);
	const to = handlesOf(meta, e.target);
	return {
		id: e.id,
		source: e.source,
		target: e.target,
		sourceHandle: handleId(port, isSide(e.source_side) ? e.source_side : from.output, from.output),
		targetHandle: handleId(
			INPUT_HANDLE,
			isSide(e.target_side) ? e.target_side : to.input,
			to.input
		),
		label: port !== 'out' ? port : undefined
	};
}

/** Canvas edge → stored edge; a side is kept only when not the node's default. */
export function fromFlowEdge(e: FlowEdge, meta: NodeMetaMap): AiGraphEdge {
	const from = parseHandle(e.sourceHandle, 'out');
	const to = parseHandle(e.targetHandle, INPUT_HANDLE);
	const edge: AiGraphEdge = {
		id: e.id,
		source: e.source,
		target: e.target,
		source_port: from.name
	};
	if (from.side && from.side !== handlesOf(meta, e.source).output) edge.source_side = from.side;
	if (to.side && to.side !== handlesOf(meta, e.target).input) edge.target_side = to.side;
	return edge;
}

/** Canvas state → stored graph. Edges whose ends are gone are dropped. */
export function flowToGraph(
	nodes: FlowNode[],
	edges: FlowEdge[],
	meta: NodeMetaMap
): AiWorkflowGraph {
	const ids = new Set(nodes.map((n) => n.id));
	return {
		nodes: nodes.map((n): AiGraphNode => {
			const node: AiGraphNode = {
				id: n.id,
				type: n.data.nodeType,
				label: metaOf(meta, n.id)?.label ?? '',
				position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
				config: deepClone(metaOf(meta, n.id)?.config ?? {})
			};
			const handles = readHandles(metaOf(meta, n.id)?.handles);
			if (handles) node.handles = { ...handles };
			return node;
		}),
		edges: edges
			.filter((e) => ids.has(e.source) && ids.has(e.target))
			.map((e) => fromFlowEdge(e, meta))
	};
}

/**
 * The edges again after the default sides of `ids` (every node when
 * omitted) changed: their ends move to the new default sides, other
 * ends keep theirs. `graph` is the `flowToGraph` taken before the change.
 */
export function reattachEdges(
	graph: AiWorkflowGraph,
	meta: NodeMetaMap,
	ids?: string[]
): FlowEdge[] {
	const moved = (id: string) => !ids || ids.includes(id);
	return graph.edges.map((e) => {
		const edge = { ...e };
		if (moved(e.source)) delete edge.source_side;
		if (moved(e.target)) delete edge.target_side;
		return toFlowEdge(edge, meta);
	});
}

function nextId(prefix: string, taken: string[]): string {
	let max = 0;
	const re = new RegExp(`^${prefix}(\\d+)$`);
	for (const id of taken) {
		const m = re.exec(id);
		if (m) max = Math.max(max, Number(m[1]));
	}
	return `${prefix}${max + 1}`;
}

export function nextNodeId(nodes: { id: string }[]): string {
	return nextId(
		'n',
		nodes.map((n) => n.id)
	);
}

export function nextEdgeId(edges: { id: string }[]): string {
	return nextId(
		'e',
		edges.map((e) => e.id)
	);
}

/** A new node of `type` at `position`, with its id, label and defaults. */
export function createFlowNode(
	type: string,
	position: { x: number; y: number },
	existing: FlowNode[],
	catalogue?: AiNodeTypeInfo[] | null
): { node: FlowNode; meta: NodeMeta } {
	const id = nextNodeId(existing);
	return {
		node: {
			id,
			type: FLOW_NODE_TYPE,
			position: { x: Math.round(position.x), y: Math.round(position.y) },
			data: { nodeType: type },
			deletable: type !== 'trigger'
		},
		meta: { label: labelFor(type, catalogue), config: defaultConfigFor(type, catalogue) }
	};
}

/** A fresh workflow: just the trigger. */
export function emptyGraph(): AiWorkflowGraph {
	return {
		nodes: [{ id: 'n1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: {} }],
		edges: []
	};
}

/**
 * A connection is acceptable when it does not loop onto its own node
 * and does not enter the trigger. Cycles through other nodes are left
 * to the backend validator (they are allowed through waiting nodes).
 */
export function isConnectionAllowed(
	connection: { source: string; target: string },
	nodes: FlowNode[]
): boolean {
	if (connection.source === connection.target) return false;
	const target = nodes.find((n) => n.id === connection.target);
	if (!target) return false;
	return target.data.nodeType !== 'trigger';
}

/**
 * Appends the edge unless the same (source, port, target) exists, on
 * whichever sides. The handle ids are kept: they carry the sides.
 */
export function addConnection(
	edges: FlowEdge[],
	connection: {
		source: string;
		target: string;
		sourceHandle?: string | null;
		targetHandle?: string | null;
	}
): FlowEdge[] {
	const port = parseHandle(connection.sourceHandle, 'out').name;
	const duplicate = edges.some(
		(e) =>
			e.source === connection.source &&
			e.target === connection.target &&
			parseHandle(e.sourceHandle, 'out').name === port
	);
	if (duplicate) return edges;
	return [
		...edges,
		{
			id: nextEdgeId(edges),
			source: connection.source,
			target: connection.target,
			sourceHandle: connection.sourceHandle || port,
			targetHandle: connection.targetHandle || INPUT_HANDLE,
			label: port !== 'out' ? port : undefined
		}
	];
}

/** Validation errors grouped by node; node-less ones under `global`. */
export function groupErrors(errors: AiValidationError[]): {
	byNode: Record<string, string[]>;
	global: string[];
} {
	const byNode: Record<string, string[]> = {};
	const global: string[] = [];
	for (const e of errors) {
		const text = e.field ? `${e.field}: ${e.message}` : e.message;
		if (e.node_id) (byNode[e.node_id] ??= []).push(text);
		else global.push(text);
	}
	return { byNode, global };
}

// ---- Saved blocks ----------------------------------------------------------------

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `value` with every reference to a renamed node rewritten: `nodes.<id>`
 * in templates, `$path` values and scripts, and `nodes['<id>']`. One
 * pass, so renaming `a`→`b` and `b`→`c` never chains.
 */
export function rewriteNodeReferences<T>(value: T, renames: Record<string, string>): T {
	const olds = Object.keys(renames).filter((id) => renames[id] !== id);
	if (!olds.length) return value;
	const alternatives = olds
		.sort((a, b) => b.length - a.length)
		.map(escapeRegExp)
		.join('|');
	const dotted = new RegExp(`(?<![\\w.])nodes\\.(${alternatives})(?![\\w-])`, 'g');
	const indexed = new RegExp(`(?<![\\w.])nodes\\[(['"])(${alternatives})\\1\\]`, 'g');
	const walk = (item: unknown): unknown => {
		if (typeof item === 'string') {
			return item
				.replace(dotted, (_m, id: string) => `nodes.${renames[id]}`)
				.replace(
					indexed,
					(_m, quote: string, id: string) => `nodes[${quote}${renames[id]}${quote}]`
				);
		}
		if (Array.isArray(item)) return item.map(walk);
		if (item && typeof item === 'object') {
			return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, walk(v)]));
		}
		return item;
	};
	return walk(value) as T;
}

/**
 * Why `id` cannot replace `current`, or null. Stricter than the backend
 * (which also takes `.`, `:` and `-`): the id must read as
 * `nodes.<id>` in a template.
 */
export function nodeIdError(id: string, current: string, taken: { id: string }[]): string | null {
	if (id === current) return null;
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(id)) {
		return 'Letters, digits and _, starting with a letter or _ (64 at most)';
	}
	if (RESERVED_IDS.has(id)) return `${id} is reserved`;
	if (taken.some((n) => n.id === id)) return `Another node is already called ${id}`;
	return null;
}

/**
 * The canvas after node `from` is renamed `to`: its edges follow and
 * every `nodes.<from>` reference in the configs is rewritten.
 */
export function renameFlowNode(
	nodes: FlowNode[],
	edges: FlowEdge[],
	meta: NodeMetaMap,
	from: string,
	to: string
): { nodes: FlowNode[]; edges: FlowEdge[]; meta: NodeMetaMap } {
	const renames: Record<string, string> = Object.create(null);
	renames[from] = to;
	const nextMeta: NodeMetaMap = {};
	for (const [id, m] of Object.entries(meta)) {
		nextMeta[id === from ? to : id] = { ...m, config: rewriteNodeReferences(m.config, renames) };
	}
	return {
		nodes: nodes.map((n) => (n.id === from ? { ...n, id: to } : n)),
		edges: edges.map((e) =>
			e.source === from || e.target === from
				? {
						...e,
						source: e.source === from ? to : e.source,
						target: e.target === from ? to : e.target
					}
				: e
		),
		meta: nextMeta
	};
}

/** `id`, or `id_2`, `id_3`… when taken. */
function freeId(id: string, taken: Set<string>): string {
	const cleaned = id.replace(/[^A-Za-z0-9_-]/g, '_') || 'node';
	const base = RESERVED_IDS.has(cleaned) ? `${cleaned}node` : cleaned;
	if (!taken.has(base)) return base;
	let index = 2;
	while (taken.has(`${base}_${index}`)) index += 1;
	return `${base}_${index}`;
}

/**
 * The nodes and edges of a saved block, ready to add to the canvas:
 * node ids already used are renamed (with every `nodes.<id>` reference
 * in the block's configs), edges get fresh ids, trigger nodes are
 * dropped and the block's top-left corner lands at `position`.
 */
export function insertBlock(
	block: AiBlockDefinition,
	position: { x: number; y: number },
	existingNodes: { id: string }[],
	existingEdges: { id: string }[]
): { nodes: FlowNode[]; edges: FlowEdge[]; meta: NodeMetaMap; renames: Record<string, string> } {
	const blockNodes = (block.nodes ?? []).filter((n) => n.type !== 'trigger');
	const taken = new Set(existingNodes.map((n) => n.id));
	// Keys are the block's own ids: no prototype to reach.
	const renames: Record<string, string> = Object.create(null);
	for (const node of blockNodes) {
		const id = freeId(node.id, taken);
		taken.add(id);
		renames[node.id] = id;
	}
	const minX = Math.min(...blockNodes.map((n) => n.position?.x ?? 0));
	const minY = Math.min(...blockNodes.map((n) => n.position?.y ?? 0));
	const meta: NodeMetaMap = {};
	const nodes: FlowNode[] = blockNodes.map((n) => {
		const id = renames[n.id];
		meta[id] = {
			label: n.label ?? '',
			config: rewriteNodeReferences(deepClone(n.config ?? {}), renames)
		};
		const handles = readHandles(n.handles);
		if (handles) meta[id].handles = handles;
		return {
			id,
			type: FLOW_NODE_TYPE,
			position: {
				x: Math.round(position.x + (n.position?.x ?? 0) - minX),
				y: Math.round(position.y + (n.position?.y ?? 0) - minY)
			},
			data: { nodeType: n.type },
			deletable: true
		};
	});
	const edges: FlowEdge[] = [];
	let allEdges: { id: string }[] = [...existingEdges];
	for (const e of block.edges ?? []) {
		if (!Object.hasOwn(renames, e.source) || !Object.hasOwn(renames, e.target)) continue;
		const edge = toFlowEdge(
			{
				id: nextEdgeId(allEdges),
				source: renames[e.source],
				target: renames[e.target],
				source_port: e.source_port ?? 'out',
				source_side: e.source_side,
				target_side: e.target_side
			},
			meta
		);
		edges.push(edge);
		allEdges = [...allEdges, edge];
	}
	return { nodes, edges, meta, renames };
}

/**
 * The selected nodes (the trigger aside) and the edges between them, as
 * a block definition whose top-left node sits at (0, 0).
 */
export function selectionToBlock(
	nodes: FlowNode[],
	edges: FlowEdge[],
	meta: NodeMetaMap,
	selectedIds: string[]
): AiBlockDefinition {
	const ids = new Set(selectedIds);
	const graph = flowToGraph(
		nodes.filter((n) => ids.has(n.id) && n.data.nodeType !== 'trigger'),
		edges,
		meta
	);
	const minX = Math.min(...graph.nodes.map((n) => n.position.x));
	const minY = Math.min(...graph.nodes.map((n) => n.position.y));
	return {
		nodes: graph.nodes.map((n) => ({
			...n,
			position: { x: n.position.x - minX, y: n.position.y - minY }
		})),
		edges: graph.edges
	};
}
