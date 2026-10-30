import { tick } from 'svelte';
import type { CaseGraphState } from '../lib/graph-state.svelte';

/**
 * Show objects / relations on the canvas: draw the nodes that are not (hidden
 * or off the canvas), switch back from the table, then select them and fit
 * the view. A single object also opens its details unless `details` is false.
 */
export const locateOnCanvas = async (
	graph: CaseGraphState,
	nodeKeys: readonly string[],
	edgeKeys: readonly string[] = [],
	{ details = true }: { details?: boolean } = {}
) => {
	const known = nodeKeys.filter((k) => !!graph.node(k));
	const missing = known.filter((k) => !graph.visibility.nodes.has(k));
	if (missing.length) graph.addToCanvas(missing);
	graph.viewMode = 'canvas';
	if (details) {
		if (known.length === 1 && !edgeKeys.length) graph.rail = { type: 'node', key: known[0] };
		else if (edgeKeys.length === 1 && !known.length)
			graph.rail = { type: 'edge', key: edgeKeys[0] };
	}
	await tick();
	// Leave the canvas time to draw the nodes just added.
	await new Promise((resolve) => setTimeout(resolve, missing.length ? 350 : 50));
	const cy = graph.cy;
	if (!cy) return;
	const canvasIds = (keys: readonly string[]) =>
		[...new Set(keys.map((k) => graph.canvasIdOf(k)))].filter((id): id is string => !!id);
	const nodeIds = canvasIds(known);
	// Bundled relations are not drawn one by one: fall back to their ends.
	const edgeIds = edgeKeys.filter((k) => cy.getElementById(k).nonempty());
	const ends = canvasIds(
		edgeKeys.flatMap((k) => {
			const e = graph.edge(k);
			return e ? [e.source, e.target] : [];
		})
	);
	const selected = edgeKeys.length && !known.length ? (edgeIds.length ? edgeIds : ends) : nodeIds;
	graph.select([...selected, ...(known.length ? edgeIds : [])]);
	graph.fit([...nodeIds, ...edgeIds, ...ends]);
};
