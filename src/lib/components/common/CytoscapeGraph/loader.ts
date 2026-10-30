import type cytoscapeType from 'cytoscape';

let loading: Promise<typeof cytoscapeType> | null = null;

/**
 * Load Cytoscape and register its extensions once, in the browser only —
 * Cytoscape touches `window` at import time, so the SSR bundle must never
 * import it statically.
 */
export const loadCytoscape = (): Promise<typeof cytoscapeType> => {
	if (!loading) {
		loading = (async () => {
			const [{ default: cytoscape }, { default: fcose }, { default: dagre }, { default: eh }] =
				await Promise.all([
					import('cytoscape'),
					import('cytoscape-fcose'),
					import('cytoscape-dagre'),
					import('cytoscape-edgehandles')
				]);
			cytoscape.use(fcose);
			cytoscape.use(dagre);
			cytoscape.use(eh);
			return cytoscape;
		})();
		loading.catch(() => (loading = null));
	}
	return loading;
};
