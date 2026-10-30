import type { Position } from 'cytoscape';

export interface MinimapBox {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

/**
 * Fit the union of the graph bounding box and the current viewport into a
 * `width`×`height` minimap (aspect preserved, centred). Returns both
 * directions of the mapping.
 */
export const minimapTransform = (
	graph: MinimapBox | null,
	view: MinimapBox,
	width: number,
	height: number,
	padding = 4
) => {
	const box = graph
		? {
				x1: Math.min(graph.x1, view.x1),
				y1: Math.min(graph.y1, view.y1),
				x2: Math.max(graph.x2, view.x2),
				y2: Math.max(graph.y2, view.y2)
			}
		: view;
	const w = Math.max(1, box.x2 - box.x1);
	const h = Math.max(1, box.y2 - box.y1);
	const scale = Math.min((width - padding * 2) / w, (height - padding * 2) / h);
	const ox = (width - w * scale) / 2 - box.x1 * scale;
	const oy = (height - h * scale) / 2 - box.y1 * scale;
	return {
		scale,
		toMini: (p: Position): Position => ({ x: p.x * scale + ox, y: p.y * scale + oy }),
		toModel: (p: Position): Position => ({ x: (p.x - ox) / scale, y: (p.y - oy) / scale })
	};
};
