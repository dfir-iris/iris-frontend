import { describe, it, expect } from 'vitest';
import type { AiNodeTypeInfo, AiWorkflowGraph } from '$lib/services/ai-workflows.service';
import {
	FLOW_NODE_TYPE,
	addConnection,
	applyDirection,
	createFlowNode,
	defaultConfigFor,
	emptyGraph,
	facingSide,
	flowDirection,
	flowToGraph,
	graphToFlow,
	groupErrors,
	isConnectionAllowed,
	labelFor,
	nextEdgeId,
	nextNodeId,
	parseHandle,
	portsFor,
	reattachEdges,
	readHandles
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

describe('node handles', () => {
	it('should drop default or invalid sides', () => {
		expect(readHandles(undefined)).toBeUndefined();
		expect(readHandles({ input: 'left', output: 'right' })).toBeUndefined();
		expect(readHandles({ input: 'nowhere', output: 42 })).toBeUndefined();
		expect(readHandles({ output: 'bottom' })).toEqual({ input: 'left', output: 'bottom' });
	});

	it('should keep non-default sides through a round trip', () => {
		const withHandles: AiWorkflowGraph = {
			...graph,
			nodes: graph.nodes.map((n) =>
				n.id === 'n2' ? { ...n, handles: { input: 'top', output: 'bottom' } } : n
			)
		};
		const { nodes, edges, meta } = graphToFlow(withHandles);
		expect(meta.n2.handles).toEqual({ input: 'top', output: 'bottom' });
		const back = flowToGraph(nodes, edges, meta);
		expect(back.nodes.find((n) => n.id === 'n2')?.handles).toEqual({
			input: 'top',
			output: 'bottom'
		});
		expect(back.nodes.find((n) => n.id === 'n1')).not.toHaveProperty('handles');
	});

	it('should switch every node, or only the given ones, to a direction', () => {
		const { meta } = graphToFlow(graph);
		expect(flowDirection(meta)).toBe('horizontal');
		applyDirection(meta, 'vertical', ['n2']);
		expect(meta.n2.handles).toEqual({ input: 'top', output: 'bottom' });
		expect(meta.n1.handles).toBeUndefined();
		applyDirection(meta, 'vertical');
		expect(flowDirection(meta)).toBe('vertical');
		applyDirection(meta, 'horizontal');
		expect(Object.values(meta).some((m) => 'handles' in m)).toBe(false);
	});
});

describe('links on any side', () => {
	it('should name handles by side, bare on the default one', () => {
		expect(parseHandle('true', 'out')).toEqual({ name: 'true' });
		expect(parseHandle('true@bottom', 'out')).toEqual({ name: 'true', side: 'bottom' });
		expect(parseHandle('in@top', 'in')).toEqual({ name: 'in', side: 'top' });
		expect(parseHandle(null, 'out')).toEqual({ name: 'out' });
		expect(parseHandle('weird@middle', 'out')).toEqual({ name: 'weird@middle' });
	});

	it('should keep the sides a link was drawn on, and only those', () => {
		const { nodes, meta } = graphToFlow(graph);
		meta.n3.handles = { input: 'top', output: 'bottom' };
		let edges = addConnection([], {
			source: 'n2',
			target: 'n3',
			sourceHandle: 'true@bottom',
			targetHandle: 'in'
		});
		edges = addConnection(edges, {
			source: 'n2',
			target: 'n3',
			sourceHandle: 'false',
			targetHandle: 'in@left'
		});
		// Same port to the same node from another side: no second link
		expect(
			addConnection(edges, { source: 'n2', target: 'n3', sourceHandle: 'true', targetHandle: 'in' })
		).toBe(edges);
		const back = flowToGraph(nodes, edges, meta);
		expect(back.edges).toEqual([
			{ id: 'e1', source: 'n2', target: 'n3', source_port: 'true', source_side: 'bottom' },
			{ id: 'e2', source: 'n2', target: 'n3', source_port: 'false', target_side: 'left' }
		]);
		const again = graphToFlow({ ...back, nodes: back.nodes });
		expect(again.edges.map((e) => [e.sourceHandle, e.targetHandle])).toEqual([
			['true@bottom', 'in'],
			['false', 'in@left']
		]);
	});

	it('should drop a side equal to the default and resolve against the node defaults', () => {
		const { edges } = graphToFlow({
			nodes: [graph.nodes[0], { ...graph.nodes[2], handles: { input: 'top', output: 'bottom' } }],
			edges: [{ id: 'e1', source: 'n1', target: 'n3', source_port: 'out', target_side: 'top' }]
		});
		expect(edges[0]).toMatchObject({ sourceHandle: 'out', targetHandle: 'in' });
	});

	it('should move the links of re-oriented nodes to their new sides', () => {
		const { nodes, meta } = graphToFlow(graph);
		const edges = addConnection([], {
			source: 'n2',
			target: 'n3',
			sourceHandle: 'true@bottom',
			targetHandle: 'in@top'
		});
		const before = flowToGraph(nodes, edges, meta);
		applyDirection(meta, 'vertical', ['n2']);
		const moved = reattachEdges(before, meta, ['n2']);
		// n2 now outputs at the bottom by default; n3 keeps its pinned top input
		expect(moved[0]).toMatchObject({ sourceHandle: 'true', targetHandle: 'in@top' });
	});

	it('should enter a node on the side facing the link', () => {
		const box = { x: 0, y: 0, width: 224, height: 56 };
		expect(facingSide(box, { x: -50, y: 28 })).toBe('left');
		expect(facingSide(box, { x: 400, y: 0 })).toBe('right');
		expect(facingSide(box, { x: 112, y: -200 })).toBe('top');
		expect(facingSide(box, { x: 150, y: 300 })).toBe('bottom');
	});

	it('should ignore node ids that reach the object prototype', () => {
		const { nodes, meta } = graphToFlow({
			nodes: [
				...graph.nodes,
				{ id: '__proto__', type: 'stop', label: 'x', position: { x: 0, y: 0 }, config: {} }
			],
			edges: []
		});
		expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
		expect(Object.hasOwn(meta, '__proto__')).toBe(false);
	});
});
