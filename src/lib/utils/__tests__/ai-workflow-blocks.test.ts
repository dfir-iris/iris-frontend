import { describe, it, expect } from 'vitest';
import type { AiBlockDefinition } from '$lib/services/ai-workflows.service';
import {
	graphToFlow,
	insertBlock,
	rewriteNodeReferences,
	selectionToBlock
} from '../ai-workflow-graph';

const block: AiBlockDefinition = {
	nodes: [
		{
			id: 'vt',
			type: 'http_request',
			label: 'Lookup',
			position: { x: 100, y: 50 },
			config: { url: 'https://x.example.org/{{ vars.hash }}' }
		},
		{
			id: 'verdict',
			type: 'python',
			label: 'Verdict',
			position: { x: 100, y: 200 },
			config: {
				code: "stats = nodes['vt']['output']",
				inputs: [
					{ name: 'response', value: { $path: 'nodes.vt.output' } },
					{ name: 'status', value: '{{ nodes.vt.output.status_code }}' }
				]
			}
		}
	],
	edges: [{ id: 'x1', source: 'vt', target: 'verdict', source_port: 'out' }]
};

describe('rewriteNodeReferences', () => {
	it('rewrites dotted, indexed and $path references', () => {
		const value = {
			a: '{{ nodes.vt.output }} and {{ nodes.vt_other.output }}',
			b: { $path: 'nodes.vt.output.body' },
			c: [`nodes["vt"]`, 'mynodes.vt', 'nodes.vt-x']
		};
		expect(rewriteNodeReferences(value, { vt: 'vt_2' })).toEqual({
			a: '{{ nodes.vt_2.output }} and {{ nodes.vt_other.output }}',
			b: { $path: 'nodes.vt_2.output.body' },
			c: [`nodes["vt_2"]`, 'mynodes.vt', 'nodes.vt-x']
		});
	});

	it('never chains renames', () => {
		expect(rewriteNodeReferences('nodes.a nodes.b', { a: 'b', b: 'c' })).toBe('nodes.b nodes.c');
	});

	it('returns the value untouched without renames', () => {
		const value = { a: 'nodes.vt' };
		expect(rewriteNodeReferences(value, { vt: 'vt' })).toBe(value);
	});
});

describe('insertBlock', () => {
	it('keeps free ids and places the block at the position', () => {
		const out = insertBlock(block, { x: 10, y: 20 }, [{ id: 'n1' }], [{ id: 'e1' }]);
		expect(out.nodes.map((n) => [n.id, n.position])).toEqual([
			['vt', { x: 10, y: 20 }],
			['verdict', { x: 10, y: 170 }]
		]);
		expect(out.edges).toMatchObject([{ id: 'e2', source: 'vt', target: 'verdict' }]);
		expect(out.meta.vt.label).toBe('Lookup');
	});

	it('renames colliding ids and their references', () => {
		const out = insertBlock(block, { x: 0, y: 0 }, [{ id: 'vt' }, { id: 'verdict' }], []);
		expect(out.renames).toEqual({ vt: 'vt_2', verdict: 'verdict_2' });
		expect(out.edges).toMatchObject([{ id: 'e1', source: 'vt_2', target: 'verdict_2' }]);
		const config = out.meta.verdict_2.config as {
			code: string;
			inputs: { value: unknown }[];
		};
		expect(config.code).toBe("stats = nodes['vt_2']['output']");
		expect(config.inputs[0].value).toEqual({ $path: 'nodes.vt_2.output' });
		expect(config.inputs[1].value).toBe('{{ nodes.vt_2.output.status_code }}');
		// The block itself is not modified
		expect(block.nodes[1].config.code).toBe("stats = nodes['vt']['output']");
	});

	it('drops trigger nodes and dangling edges', () => {
		const out = insertBlock(
			{
				nodes: [
					{ id: 't', type: 'trigger', label: '', position: { x: 0, y: 0 }, config: {} },
					...block.nodes
				],
				edges: [{ id: 'a', source: 't', target: 'vt', source_port: 'out' }, ...block.edges]
			},
			{ x: 0, y: 0 },
			[],
			[]
		);
		expect(out.nodes.map((n) => n.id)).toEqual(['vt', 'verdict']);
		expect(out.edges).toHaveLength(1);
	});
});

describe('insertBlock with sides and odd ids', () => {
	it('keeps the sides of the block links', () => {
		const out = insertBlock(
			{
				nodes: block.nodes,
				edges: [{ ...block.edges[0], source_side: 'bottom', target_side: 'top' }]
			},
			{ x: 0, y: 0 },
			[],
			[]
		);
		expect(out.edges).toMatchObject([{ sourceHandle: 'out@bottom', targetHandle: 'in@top' }]);
	});

	it('renames ids that reach the object prototype', () => {
		const out = insertBlock(
			{
				nodes: [{ ...block.nodes[0], id: '__proto__' }, block.nodes[1]],
				edges: [{ id: 'x1', source: '__proto__', target: 'verdict', source_port: 'out' }]
			},
			{ x: 0, y: 0 },
			[],
			[]
		);
		expect(out.nodes.map((n) => n.id)).toEqual(['__proto__node', 'verdict']);
		expect(out.edges).toMatchObject([{ source: '__proto__node', target: 'verdict' }]);
		expect(Object.hasOwn(out.meta, '__proto__node')).toBe(true);
	});
});

describe('selectionToBlock', () => {
	it('keeps the selected nodes and the edges between them, at the origin', () => {
		const flow = graphToFlow({
			nodes: [
				{ id: 'n1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: {} },
				...block.nodes
			],
			edges: [{ id: 'e0', source: 'n1', target: 'vt', source_port: 'out' }, ...block.edges]
		});
		const out = selectionToBlock(flow.nodes, flow.edges, flow.meta, ['n1', 'vt', 'verdict']);
		expect(out.nodes.map((n) => [n.id, n.position])).toEqual([
			['vt', { x: 0, y: 0 }],
			['verdict', { x: 0, y: 150 }]
		]);
		expect(out.edges.map((e) => e.id)).toEqual(['x1']);
	});
});
