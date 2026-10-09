import { describe, expect, it } from 'vitest';
import type { AiRunDetail, AiRunLiveEvent } from '$lib/services/ai-workflows.service';
import { aiLiveFromRun, aiLiveIsActive, aiLiveReduce } from './live';

function push(over: Partial<AiRunLiveEvent> = {}): AiRunLiveEvent {
	return {
		run_uuid: 'r1',
		workflow_id: 1,
		status: 'running',
		waiting_node_id: null,
		step: null,
		...over
	};
}

const step = (node_id: string, seq: number, status: 'running' | 'succeeded' | 'failed') => ({
	id: seq,
	seq,
	node_id,
	status,
	port: null
});

describe('aiLiveReduce', () => {
	it('follows a node from running to done', () => {
		let run = aiLiveReduce(null, push({ step: step('agent', 1, 'running') }));
		expect(run?.nodes).toEqual({ agent: 'running' });
		run = aiLiveReduce(run, push({ step: step('agent', 1, 'succeeded') }));
		run = aiLiveReduce(run, push({ step: step('notify', 2, 'running') }));
		expect(run?.nodes).toEqual({ agent: 'succeeded', notify: 'running' });
	});

	it('marks the node a run waits on', () => {
		const run = aiLiveReduce(null, push({ status: 'waiting', waiting_node_id: 'ask' }));
		expect(run?.nodes).toEqual({ ask: 'waiting' });
	});

	it('ignores an older push about a node', () => {
		let run = aiLiveReduce(null, push({ step: step('loop', 5, 'succeeded') }));
		run = aiLiveReduce(run, push({ step: step('loop', 3, 'running') }));
		expect(run?.nodes.loop).toBe('succeeded');
	});

	it('drops nodes left running once the run is over, and stays over', () => {
		let run = aiLiveReduce(null, push({ step: step('agent', 1, 'running') }));
		run = aiLiveReduce(run, push({ status: 'cancelled' }));
		expect(run?.status).toBe('cancelled');
		expect(run?.nodes).toEqual({});
		run = aiLiveReduce(run, push({ status: 'running' }));
		expect(run?.status).toBe('cancelled');
	});

	it('switches to a new run, but not to a finished one while following an active one', () => {
		let run = aiLiveReduce(null, push({ step: step('agent', 1, 'running') }));
		const kept = aiLiveReduce(run, push({ run_uuid: 'old', status: 'succeeded' }));
		expect(kept).toBe(run);
		run = aiLiveReduce(run, push({ run_uuid: 'r2', step: step('notify', 1, 'running') }));
		expect(run?.runUuid).toBe('r2');
		expect(run?.nodes).toEqual({ notify: 'running' });
	});

	it('ignores malformed pushes', () => {
		const run = aiLiveReduce(null, push());
		expect(aiLiveReduce(run, null)).toBe(run);
		expect(aiLiveReduce(run, push({ run_uuid: null }))).toBe(run);
	});
});

describe('aiLiveFromRun', () => {
	it('rebuilds the node states from the steps', () => {
		const detail = {
			uuid: 'r1',
			status: 'waiting',
			waiting_node_id: 'ask',
			steps: [
				{ seq: 2, node_id: 'ask', status: 'waiting' },
				{ seq: 1, node_id: 'agent', status: 'succeeded' }
			]
		} as unknown as AiRunDetail;
		const run = aiLiveFromRun(detail);
		expect(run.status).toBe('waiting');
		expect(run.nodes).toEqual({ agent: 'succeeded', ask: 'waiting' });
	});
});

describe('aiLiveIsActive', () => {
	it('is true while running or waiting', () => {
		expect(aiLiveIsActive('running')).toBe(true);
		expect(aiLiveIsActive('waiting')).toBe(true);
		expect(aiLiveIsActive('failed')).toBe(false);
		expect(aiLiveIsActive(null)).toBe(false);
	});
});
