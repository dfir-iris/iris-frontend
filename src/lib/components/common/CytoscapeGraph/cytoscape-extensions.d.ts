// Type shims for the Cytoscape extensions that ship without typings.
// `cytoscape` and `cytoscape-dagre` carry their own declarations.

declare module 'cytoscape-fcose' {
	import type { Ext } from 'cytoscape';
	const fcose: Ext;
	export default fcose;
}

declare module 'cytoscape-edgehandles' {
	import type { Ext } from 'cytoscape';
	const edgehandles: Ext;
	export default edgehandles;
}
