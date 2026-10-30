import { toast } from '$lib/components/ui/toast';
import type { CaseGraphState } from '../../lib/graph-state.svelte';

/** Run an action that resolves to a success message; toast the outcome. */
export const notify = async (fn: () => Promise<string | null | undefined>) => {
	try {
		const message = await fn();
		if (message) toast({ title: message, variant: 'success' });
	} catch (e) {
		toast({
			title: 'Graph',
			description: e instanceof Error ? e.message : 'The operation failed.',
			variant: 'destructive'
		});
	}
};

/**
 * Highlight nodes / relations on the canvas while hovering an item; the
 * returned function clears it unless another feature replaced it since.
 */
export const showPreview = (
	graph: CaseGraphState,
	nodes: readonly string[],
	edges: readonly string[] = []
) => {
	const preview = { nodes: new Set(nodes), edges: new Set(edges) };
	graph.preview = preview;
	return () => {
		if (graph.preview === preview) graph.preview = null;
	};
};
