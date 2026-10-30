import type { Position } from 'cytoscape';

/** MIME type of palette items dragged onto the canvas. */
export const GRAPH_DRAG_MIME = 'application/x-iris-graph-nodes';

export const encodeDragKeys = (keys: string[]) => JSON.stringify(keys);

export const decodeDragKeys = (raw: string | null | undefined): string[] => {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : [];
	} catch {
		return [];
	}
};

/** Container-relative (rendered) position → model position. */
export const renderedToModel = (
	rendered: Position,
	viewport: { zoom: number; pan: Position }
): Position => ({
	x: (rendered.x - viewport.pan.x) / viewport.zoom,
	y: (rendered.y - viewport.pan.y) / viewport.zoom
});

/** Keep a fixed-position popup of size w×h inside the window. */
export const clampToViewport = (
	p: Position,
	w: number,
	h: number,
	win: { width: number; height: number },
	margin = 8
): Position => ({
	x: Math.max(margin, Math.min(p.x, win.width - w - margin)),
	y: Math.max(margin, Math.min(p.y, win.height - h - margin))
});

/**
 * Positions for nodes that appear on an already laid-out canvas: around the
 * centroid of their placed neighbours (or `fallback`), on a golden-angle
 * spiral so several newcomers do not stack. Nodes placed earlier in the same
 * call count as placed neighbours for the next ones.
 */
export const placeNear = (
	ids: string[],
	neighboursOf: (id: string) => Iterable<string>,
	positionOf: (id: string) => Position | null | undefined,
	fallback: Position,
	spread = 90
): Record<string, Position> => {
	const out: Record<string, Position> = {};
	const known = (id: string) => out[id] ?? positionOf(id) ?? null;
	const pending = new Set(ids);
	const used = new Map<string, number>();
	ids.forEach((id) => {
		const anchors = [...neighboursOf(id)]
			.filter((n) => n !== id && !(pending.has(n) && !out[n]))
			.map(known)
			.filter((p): p is Position => !!p);
		const centre = anchors.length
			? {
					x: anchors.reduce((s, p) => s + p.x, 0) / anchors.length,
					y: anchors.reduce((s, p) => s + p.y, 0) / anchors.length
				}
			: fallback;
		const slot = `${Math.round(centre.x)}:${Math.round(centre.y)}`;
		const k = used.get(slot) ?? 0;
		used.set(slot, k + 1);
		const angle = k * 2.39996;
		const radius = spread * (1 + 0.35 * Math.sqrt(k));
		out[id] = { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
	});
	return out;
};
