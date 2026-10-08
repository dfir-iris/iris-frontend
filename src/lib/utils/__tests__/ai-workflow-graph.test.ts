import { describe, it, expect } from 'vitest';
import type { AiNodeTypeInfo, AiWorkflowGraph } from '$lib/services/ai-workflows.service';
import {
	FLOW_NODE_TYPE,
	addConnection,
	createFlowNode,
	defaultConfigFor,
	emptyGraph,
	flowToGraph,
	graphToFlow,
	groupErrors,
	isConnectionAllowed,
	labelFor,
	nextEdgeId,
	nextNodeId,
	portsFor
} from '../ai-workflow-graph';

const graph: AiWorkflowGraph = {
	nodes: [
		{ id: 'n1', type: 'trigger', label: 'New alert', position: { x: 0, y: 0 }, config: {} },
		{
			id: 'n2',
			type: 'condition',
			label: 'High?',
			position: { x: 240.4, y: 10.6 },
			config: { mode: 'rules', logic: 'and', rules: [{ path: 'entity.severity', operator: 'eq' }] }
		},
		{ id: 'n3', type: 'stop', label: 'Done', position: { x: 480, y: 0 }, config: {} }
	],
	edges: [
		{ id: 'e1', source: 'n1', target: 'n2', source_port: 'out' },
		{ id: 'e2', source: 'n2', target: 'n3', source_port: 'false' }
	]
};

const catalogue: AiNodeTypeInfo[] = [
	{
		type: 'ai_agent',
		label: 'AI agent',
		description: '',
		category: 'ai',
		ports: ['out', 'error'],
		config_defaults: { max_turns: 4, tools: ['get_alert'] }
	}
];

describe('graphToFlow / flowToGraph', () => {
	it('maps nodes, ports and meta', () => {
		const { nodes, edges, meta } = graphToFlow(graph);
		expect(nodes).toHaveLength(3);
		expect(nodes[0]).toMatchObject({
			id: 'n1',
			type: FLOW_NODE_TYPE,
			data: { nodeType: 'trigger' },
			deletable: false
		});
		expect(nodes[1].deletable).toBe(true);
		expect(edges[1]).toMatchObject({ source: 'n2', target: 'n3', sourceHandle: 'false' });
		expect(edges[1].label).toBe('false');
		expect(edges[0].label).toBeUndefined();
		expect(meta.n2.label).toBe('High?');
		expect(meta.n2.config.rules).toEqual([{ path: 'entity.severity', operator: 'eq' }]);
	});

	it('round-trips, rounding positions', () => {
		const { nodes, edges, meta } = graphToFlow(graph);
		const back = flowToGraph(nodes, edges, meta);
		expect(back.edges).toEqual(graph.edges);
		expect(back.nodes[1].position).toEqual({ x: 240, y: 11 });
		expect(back.nodes.map((n) => [n.id, n.type, n.label])).toEqual(
			graph.nodes.map((n) => [n.id, n.type, n.label])
		);
		expect(back.nodes[1].config).toEqual(graph.nodes[1].config);
	});

	it('does not share config objects with the input', () => {
		const { meta } = graphToFlow(graph);
		(meta.n2.config.rules as unknown[]).push({ path: 'x' });
		expect((graph.nodes[1].config.rules as unknown[]).length).toBe(1);
	});

	it('picks up meta edits and drops dangling edges', () => {
		const { nodes, edges, meta } = graphToFlow(graph);
		meta.n2.label = 'Renamed';
		meta.n2.config.logic = 'or';
		const back = flowToGraph(
			nodes.filter((n) => n.id !== 'n3'),
			edges,
			meta
		);
		expect(back.nodes.find((n) => n.id === 'n2')).toMatchObject({
			label: 'Renamed',
			config: { logic: 'or' }
		});
		expect(back.edges).toEqual([{ id: 'e1', source: 'n1', target: 'n2', source_port: 'out' }]);
	});

	it('defaults a missing handle to out', () => {
		const back = flowToGraph(
			[
				{ id: 'a', position: { x: 0, y: 0 }, data: { nodeType: 'trigger' } },
				{ id: 'b', position: { x: 0, y: 0 }, data: { nodeType: 'stop' } }
			],
			[{ id: 'e1', source: 'a', target: 'b' }],
			{}
		);
		expect(back.edges[0].source_port).toBe('out');
		expect(back.nodes[0]).toMatchObject({ label: '', config: {} });
	});

	it('handles an empty or missing graph', () => {
		expect(graphToFlow(null)).toEqual({ nodes: [], edges: [], meta: {} });
		expect(graphToFlow({ nodes: [], edges: [] }).nodes).toEqual([]);
	});
});

describe('catalogue helpers', () => {
	it('reads ports from the catalogue or the defaults', () => {
		expect(portsFor('ai_agent', catalogue)).toEqual(['out', 'error']);
		expect(portsFor('condition')).toEqual(['true', 'false']);
		expect(portsFor('http_request')).toEqual(['out', 'error', 'timeout']);
		expect(portsFor('stop')).toEqual([]);
		expect(portsFor('unknown')).toEqual(['out']);
	});

	it('labels and defaults', () => {
		expect(labelFor('ai_agent', catalogue)).toBe('AI agent');
		expect(labelFor('find_related')).toBe('Find related');
		const cfg = defaultConfigFor('ai_agent', catalogue);
		expect(cfg.max_turns).toBe(4);
		expect(cfg.max_tool_calls).toBe(10);
		expect(cfg.tools).toEqual(['get_alert']);
		// A clone: mutating it leaves the catalogue untouched.
		(cfg.tools as string[]).push('x');
		expect(catalogue[0].config_defaults.tools).toEqual(['get_alert']);
	});
});

describe('ids and creation', () => {
	it('allocates the next free ids', () => {
		expect(nextNodeId([{ id: 'n1' }, { id: 'n7' }, { id: 'custom' }])).toBe('n8');
		expect(nextNodeId([])).toBe('n1');
		expect(nextEdgeId([{ id: 'e2' }])).toBe('e3');
	});

	it('creates a node with defaults', () => {
		const { nodes } = graphToFlow(graph);
		const { node, meta } = createFlowNode('delay', { x: 10.2, y: 20.7 }, nodes);
		expect(node).toMatchObject({
			id: 'n4',
			type: FLOW_NODE_TYPE,
			position: { x: 10, y: 21 },
			data: { nodeType: 'delay' }
		});
		expect(meta).toEqual({ label: 'Delay', config: { minutes: 5 } });
	});

	it('starts a new workflow with a trigger', () => {
		const g = emptyGraph();
		expect(g.nodes).toHaveLength(1);
		expect(g.nodes[0].type).toBe('trigger');
	});
});

describe('connections', () => {
	const { nodes, edges } = graphToFlow(graph);

	it('refuses self loops and edges into the trigger', () => {
		expect(isConnectionAllowed({ source: 'n2', target: 'n2' }, nodes)).toBe(false);
		expect(isConnectionAllowed({ source: 'n2', target: 'n1' }, nodes)).toBe(false);
		expect(isConnectionAllowed({ source: 'n2', target: 'nx' }, nodes)).toBe(false);
		expect(isConnectionAllowed({ source: 'n3', target: 'n2' }, nodes)).toBe(true);
	});

	it('adds edges once per (source, port, target)', () => {
		const next = addConnection(edges, { source: 'n2', target: 'n3', sourceHandle: 'true' });
		expect(next).toHaveLength(3);
		expect(next[2]).toMatchObject({ id: 'e3', sourceHandle: 'true', label: 'true' });
		expect(addConnection(next, { source: 'n2', target: 'n3', sourceHandle: 'true' })).toBe(next);
		// Fan-out from the same port is fine.
		expect(addConnection(next, { source: 'n2', target: 'n1', sourceHandle: 'true' })).toHaveLength(
			4
		);
	});
});

describe('groupErrors', () => {
	it('groups by node', () => {
		const { byNode, global } = groupErrors([
			{ node_id: 'n2', field: 'rules', message: 'Required' },
			{ node_id: 'n2', field: null, message: 'Unreachable' },
			{ node_id: null, field: 'trigger_config.cron', message: 'Bad cron' },
			{ node_id: null, field: null, message: 'No trigger' }
		]);
		expect(byNode).toEqual({ n2: ['rules: Required', 'Unreachable'] });
		expect(global).toEqual(['trigger_config.cron: Bad cron', 'No trigger']);
	});
});
