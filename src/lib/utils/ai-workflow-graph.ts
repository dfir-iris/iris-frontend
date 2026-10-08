/**
 * Conversion between the AI-workflow graph stored by the backend
 * (`ai_workflow.graph`) and the nodes / edges xyflow renders.
 *
 * xyflow nodes only carry what the canvas needs (id, position, the
 * node type); the label and config live in a separate `meta` map the
 * editor mutates deeply, so editing a field never rebuilds the node
 * array. `flowToGraph` folds the three back into the stored format.
 * `source_port` ⇄ `sourceHandle`.
 */
import type { Edge, Node } from '@xyflow/svelte';
import type {
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

export interface NodeMeta {
	label: string;
	config: Record<string, unknown>;
}

export type NodeMetaMap = Record<string, NodeMeta>;

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
	const nodes: FlowNode[] = (graph?.nodes ?? []).map((n) => {
		meta[n.id] = { label: n.label ?? '', config: deepClone(n.config ?? {}) };
		return {
			id: n.id,
			type: FLOW_NODE_TYPE,
			position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
			data: { nodeType: n.type },
			// The trigger is the entry point: never deletable from the canvas.
			deletable: n.type !== 'trigger'
		};
	});
	const edges: FlowEdge[] = (graph?.edges ?? []).map((e) => toFlowEdge(e));
	return { nodes, edges, meta };
}

export function toFlowEdge(e: AiGraphEdge): FlowEdge {
	return {
		id: e.id,
		source: e.source,
		target: e.target,
		sourceHandle: e.source_port,
		label: e.source_port && e.source_port !== 'out' ? e.source_port : undefined
	};
}

/** Canvas state → stored graph. Edges whose ends are gone are dropped. */
export function flowToGraph(
	nodes: FlowNode[],
	edges: FlowEdge[],
	meta: NodeMetaMap
): AiWorkflowGraph {
	const ids = new Set(nodes.map((n) => n.id));
	return {
		nodes: nodes.map(
			(n): AiGraphNode => ({
				id: n.id,
				type: n.data.nodeType,
				label: meta[n.id]?.label ?? '',
				position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
				config: deepClone(meta[n.id]?.config ?? {})
			})
		),
		edges: edges
			.filter((e) => ids.has(e.source) && ids.has(e.target))
			.map(
				(e): AiGraphEdge => ({
					id: e.id,
					source: e.source,
					target: e.target,
					source_port: e.sourceHandle ?? 'out'
				})
			)
	};
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

/** Appends the edge unless the same (source, port, target) exists. */
export function addConnection(
	edges: FlowEdge[],
	connection: { source: string; target: string; sourceHandle?: string | null }
): FlowEdge[] {
	const port = connection.sourceHandle ?? 'out';
	const duplicate = edges.some(
		(e) =>
			e.source === connection.source &&
			e.target === connection.target &&
			(e.sourceHandle ?? 'out') === port
	);
	if (duplicate) return edges;
	return [
		...edges,
		toFlowEdge({
			id: nextEdgeId(edges),
			source: connection.source,
			target: connection.target,
			source_port: port
		})
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
