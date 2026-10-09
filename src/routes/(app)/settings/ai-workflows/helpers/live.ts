import type {
	AiRunDetail,
	AiRunLiveEvent,
	AiRunStatus,
	AiStepStatus
} from '$lib/services/ai-workflows.service';

/** What the canvas shows on a node while a run goes through it. */
export type AiLiveNodeState = 'running' | 'succeeded' | 'failed' | 'waiting';

/** The run the canvas follows, node by node. */
export interface AiLiveRun {
	runUuid: string;
	status: AiRunStatus;
	nodes: Record<string, AiLiveNodeState>;
	/** Last step seq applied per node: an older push never overrides a newer one. */
	seq: Record<string, number>;
}

export const aiLiveIsActive = (status: AiRunStatus | null | undefined): boolean =>
	status === 'running' || status === 'waiting';

const STEP_STATES: Partial<Record<AiStepStatus, AiLiveNodeState>> = {
	running: 'running',
	succeeded: 'succeeded',
	resumed: 'succeeded',
	failed: 'failed',
	waiting: 'waiting'
};

function emptyRun(runUuid: string, status: AiRunStatus): AiLiveRun {
	return { runUuid, status, nodes: {}, seq: {} };
}

function settle(run: AiLiveRun, status: AiRunStatus, waitingNodeId: string | null): AiLiveRun {
	// Once over, a run stays over (pushes may arrive out of order)
	const next = aiLiveIsActive(run.status) ? status : run.status;
	let nodes = run.nodes;
	if (next === 'waiting' && waitingNodeId && nodes[waitingNodeId] !== 'failed') {
		nodes = { ...nodes, [waitingNodeId]: 'waiting' };
	}
	if (!aiLiveIsActive(next)) {
		// A node cut short by a cancel / failure did not run to its end
		nodes = Object.fromEntries(Object.entries(nodes).filter(([, state]) => state !== 'running'));
	}
	return { ...run, status: next, nodes };
}

/**
 * Applies a push to the run the canvas follows. A push about another run
 * takes over unless the followed one is still going and the other one
 * is over. Returns the same object when nothing changed.
 */
export function aiLiveReduce(
	current: AiLiveRun | null,
	event: AiRunLiveEvent | null | undefined
): AiLiveRun | null {
	if (!event || typeof event.run_uuid !== 'string' || !event.run_uuid) return current;
	let run = current;
	if (!run || run.runUuid !== event.run_uuid) {
		if (run && aiLiveIsActive(run.status) && !aiLiveIsActive(event.status)) return current;
		run = emptyRun(event.run_uuid, event.status);
	}
	const step = event.step;
	if (step && typeof step.node_id === 'string' && typeof step.seq === 'number') {
		const state = STEP_STATES[step.status];
		if (state && step.seq >= (run.seq[step.node_id] ?? -1)) {
			run = {
				...run,
				nodes: { ...run.nodes, [step.node_id]: state },
				seq: { ...run.seq, [step.node_id]: step.seq }
			};
		}
	}
	return settle(run, event.status, event.waiting_node_id);
}

/** The followed run rebuilt from its REST view (the polling fallback). */
export function aiLiveFromRun(detail: AiRunDetail): AiLiveRun {
	let run = emptyRun(detail.uuid, 'running');
	for (const step of [...(detail.steps ?? [])].sort((a, b) => a.seq - b.seq)) {
		const state = STEP_STATES[step.status];
		if (!state) continue;
		run = {
			...run,
			nodes: { ...run.nodes, [step.node_id]: state },
			seq: { ...run.seq, [step.node_id]: step.seq }
		};
	}
	return settle(run, detail.status, detail.waiting_node_id);
}
