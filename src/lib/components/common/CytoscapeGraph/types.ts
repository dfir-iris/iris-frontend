import type { Core, EdgeSingular, NodeSingular, Position, StylesheetJson } from 'cytoscape';

export type CyElementData = { id: string; [key: string]: unknown };

/** Declarative element handed to `<CytoscapeGraph elements>`. Diffed by `data.id`. */
export interface CyNodeDef {
	group: 'nodes';
	data: CyElementData;
	classes?: string[];
	/** Only used when the node is first added — existing positions are never overwritten. */
	position?: Position;
	selectable?: boolean;
	grabbable?: boolean;
}

export interface CyEdgeDef {
	group: 'edges';
	data: CyElementData & { source: string; target: string };
	classes?: string[];
	selectable?: boolean;
}

export type CyElementDef = CyNodeDef | CyEdgeDef;

export type CyStylesheet = StylesheetJson;

export interface CyPointerEvent<T> {
	target: T;
	/** Model position. */
	position: Position;
	/** Position relative to the canvas container. */
	renderedPosition: Position;
	/** Viewport (client) coordinates, for fixed-position menus. */
	clientPosition: Position;
	originalEvent: MouseEvent | TouchEvent | undefined;
}

export type CyNodeEvent = CyPointerEvent<NodeSingular>;
export type CyEdgeEvent = CyPointerEvent<EdgeSingular>;
export type CyCanvasEvent = CyPointerEvent<Core>;

export interface CyViewport {
	zoom: number;
	pan: Position;
}

export interface CytoscapeGraphHandlers {
	onTapNode?: (e: CyNodeEvent) => void;
	onTapEdge?: (e: CyEdgeEvent) => void;
	onTapCanvas?: (e: CyCanvasEvent) => void;
	onDblTapNode?: (e: CyNodeEvent) => void;
	onDblTapEdge?: (e: CyEdgeEvent) => void;
	onCxtTapNode?: (e: CyNodeEvent) => void;
	onCxtTapEdge?: (e: CyEdgeEvent) => void;
	onCxtTapCanvas?: (e: CyCanvasEvent) => void;
	onHoverNode?: (node: NodeSingular | null, e?: CyNodeEvent) => void;
	onHoverEdge?: (edge: EdgeSingular | null, e?: CyEdgeEvent) => void;
	/** Fired once after a box (or lasso-like shift-drag) selection settles. */
	onBoxSelect?: (ids: string[]) => void;
	/** Fired (batched) whenever the selected set changes. */
	onSelectionChange?: (ids: string[]) => void;
	/** User finished dragging nodes. */
	onDragFree?: (positions: Record<string, Position>) => void;
	/** Pan / zoom settled (debounced). */
	onViewportChange?: (viewport: CyViewport) => void;
}
