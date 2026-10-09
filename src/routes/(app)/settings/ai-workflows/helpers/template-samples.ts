import {
	AiWorkflowsService,
	aiListData,
	type AiRunDetail,
	type AiRunSummary
} from '$lib/services/ai-workflows.service';
import { contextPaths } from './template-complete';

const RUNS = 3;
const TTL_MS = 60_000;

const cache = new Map<number, { at: number; paths: Promise<string[]> }>();

async function load(workflowId: number): Promise<string[]> {
	const list = await AiWorkflowsService.runs({ workflow_id: workflowId, per_page: RUNS });
	if (!list.ok) return [];
	const runs = aiListData<AiRunSummary>(list.data).slice(0, RUNS);
	const details = await Promise.all(runs.map((r) => AiWorkflowsService.getRun(r.uuid)));
	const paths = new Set<string>();
	for (const res of details) {
		if (res.ok) contextPaths((res.data as AiRunDetail).context, paths);
	}
	return [...paths].sort();
}

/**
 * The context paths seen in the latest runs of `workflowId` (what the
 * entity, the trigger payload and each node's output really hold), for
 * the template completion. Cached a minute per workflow.
 */
export function templateSamples(workflowId: number | null | undefined): Promise<string[]> {
	if (!workflowId) return Promise.resolve([]);
	const hit = cache.get(workflowId);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.paths;
	const paths = load(workflowId).catch(() => []);
	cache.set(workflowId, { at: Date.now(), paths });
	return paths;
}
