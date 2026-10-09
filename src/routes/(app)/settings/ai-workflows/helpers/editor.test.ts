import { describe, expect, it } from 'vitest';
import type { AiWorkflowGraph } from '$lib/services/ai-workflows.service';
import { emptyWorkflowForm, workflowFromJson, workflowJson, type WorkflowForm } from './editor';

const graph: AiWorkflowGraph = {
	nodes: [
		{ id: 'trigger', type: 'trigger', label: 'Start', config: {}, position: { x: 0, y: 0 } },
		{ id: 'notify', type: 'notify', label: 'Tell', config: {}, position: { x: 0, y: 120 } }
	],
	edges: [{ id: 'e1', source: 'trigger', target: 'notify', source_port: 'out' }]
} as unknown as AiWorkflowGraph;

function base(): WorkflowForm {
	return { ...emptyWorkflowForm(), name: 'Triage', owner_id: 4, customer_scope: [2] };
}

function read(text: string) {
	const result = workflowFromJson(text, base());
	if ('error' in result) throw new Error(result.error);
	return result;
}

describe('workflowJson', () => {
	it('shows the workflow without its owner', () => {
		const doc = JSON.parse(workflowJson(base(), graph));
		expect(doc.name).toBe('Triage');
		expect(doc.graph).toEqual(graph);
		expect(doc.trigger_type).toBe('manual');
		expect('owner_id' in doc).toBe(false);
	});

	it('reads back what it shows', () => {
		const form = { ...base(), trigger_type: 'cron' as const, write_tool_allowlist: ['x'] };
		form.trigger_configs.cron = { cron: '*/5 * * * *', target: 'none', max_targets: 5 };
		const back = read(workflowJson(form, graph));
		expect(back.graph).toEqual(graph);
		expect(back.form.trigger_type).toBe('cron');
		expect(back.form.trigger_configs.cron).toEqual({
			cron: '*/5 * * * *',
			target: 'none',
			max_targets: 5
		});
		expect(back.form.write_tool_allowlist).toEqual(['x']);
		expect(back.form.owner_id).toBe(4);
	});
});

describe('workflowFromJson', () => {
	it('reads an exported document', () => {
		const doc = {
			format: 'iris-ai-workflow',
			format_version: 1,
			workflow: { name: 'Hunt', description: null, trigger_type: 'event', graph },
			requirements: { keystore: [], tools: [] }
		};
		const { form } = read(JSON.stringify(doc));
		expect(form.name).toBe('Hunt');
		expect(form.description).toBe('');
		expect(form.trigger_type).toBe('event');
	});

	it('keeps what the JSON leaves out', () => {
		const { form } = read(JSON.stringify({ graph }));
		expect(form.name).toBe('Triage');
		expect(form.customer_scope).toEqual([2]);
		expect(form.max_runs_per_hour).toBe(60);
	});

	it('fills a partial trigger config with the defaults', () => {
		const { form } = read(
			JSON.stringify({ trigger_type: 'event', trigger_config: { hooks: ['on_x'] }, graph })
		);
		expect(form.trigger_configs.event).toEqual({
			hooks: ['on_x'],
			condition: '',
			dedup_minutes: 10
		});
	});

	it('does not change the base form', () => {
		const start = base();
		workflowFromJson(JSON.stringify({ name: 'Other', customer_scope: [9], graph }), start);
		expect(start.name).toBe('Triage');
		expect(start.customer_scope).toEqual([2]);
	});

	it.each([
		['not json', 'Invalid JSON'],
		['[]', 'must be a JSON object'],
		[
			JSON.stringify({ format: 'iris-ai-workflow-block', block: {} }),
			'Expected a workflow document'
		],
		[JSON.stringify({ format: 'iris-ai-workflow' }), '"workflow" must be an object'],
		[JSON.stringify({ name: 3, graph }), '"name" must be a string'],
		[JSON.stringify({ trigger_type: 'daily', graph }), '"trigger_type" must be one of'],
		[JSON.stringify({ trigger_config: [], graph }), '"trigger_config" must be an object'],
		[JSON.stringify({ customer_scope: ['a'], graph }), '"customer_scope"'],
		[JSON.stringify({ write_tool_allowlist: [1], graph }), '"write_tool_allowlist"'],
		[JSON.stringify({ max_runs_per_hour: '5', graph }), '"max_runs_per_hour" must be a number'],
		[JSON.stringify({ suggestion_audience: 'all', graph }), '"suggestion_audience"'],
		[JSON.stringify({ is_active: 'yes', graph }), '"is_active"'],
		[JSON.stringify({ name: 'x' }), 'needs a "graph"'],
		[JSON.stringify({ graph: { nodes: [] } }), '"nodes" and "edges"'],
		[JSON.stringify({ graph: { nodes: [{ id: 1, type: 'x' }], edges: [] } }), 'string "id"'],
		[JSON.stringify({ graph: { nodes: [], edges: ['x'] } }), 'Every edge']
	])('rejects %s', (text, message) => {
		const result = workflowFromJson(text, base());
		expect('error' in result && result.error).toContain(message);
	});
});
