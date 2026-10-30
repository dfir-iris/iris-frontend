import { untrack } from 'svelte';
import { resolveGraphLink, type GraphLinkTarget } from '$lib/utils/graph-links';
import type { CaseGraphState } from '../lib/graph-state.svelte';

/**
 * Applies a `?focus=` / `?events=` link once the graph is on screen: the
 * pointed objects are brought on the canvas, selected, highlighted and
 * fitted. The highlight stays until cleared.
 */
export class GraphDeepLink {
	readonly graph: CaseGraphState;
	readonly target: GraphLinkTarget;
	applied = $state(false);
	resolved = $state.raw<{ nodes: Set<string>; edges: Set<string> } | null>(null);

	constructor(graph: CaseGraphState, target: GraphLinkTarget) {
		this.graph = graph;
		this.target = target;
	}

	get pending() {
		return !!(this.target.focus.length || this.target.events.length);
	}

	/** Call during component init: applies the link when the canvas is ready. */
	watch() {
		$effect(() => {
			if (this.applied || !this.pending || !this.graph.graph || !this.graph.cy) return;
			untrack(() => this.apply());
		});
	}

	apply() {
		const g = this.graph;
		this.applied = true;
		const resolved = resolveGraphLink(this.target, {
			nodeKeys: new Set(g.nodes.map((n) => n.key)),
			edges: g.edges,
			events: g.graph?.events ?? []
		});
		this.resolved = resolved;
		const keys = [...resolved.nodes];
		if (!keys.length) return;
		g.unhide(keys.filter((k) => g.hidden.has(k)));
		const off = keys.filter((k) => g.visibility.offCanvas.has(k));
		if (off.length) g.addToCanvas(off);
		g.preview = resolved;
		// Let the canvas apply the new elements before selecting / fitting.
		setTimeout(() => {
			const ids = keys.map((k) => g.canvasIdOf(k)).filter((id): id is string => !!id);
			g.select([...new Set(ids)]);
			g.fit([...new Set(ids)]);
		}, 350);
	}

	clear() {
		if (this.graph.preview === this.resolved) this.graph.preview = null;
		this.resolved = null;
	}
}
