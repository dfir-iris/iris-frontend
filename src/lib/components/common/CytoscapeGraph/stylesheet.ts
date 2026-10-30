import type { EdgeSingular, NodeSingular, StylesheetJson } from 'cytoscape';

/**
 * Colours of the canvas chrome for one theme. Element colours (relation,
 * kind…) come from element data, see the data contract below.
 */
export interface CyTheme {
	isDark: boolean;
	nodeBg: string;
	nodeBorder: string;
	text: string;
	textOutline: string;
	edge: string;
	selection: string;
	hover: string;
	badgeBg: string;
	badgeText: string;
}

export const cyTheme = (isDark: boolean): CyTheme =>
	isDark
		? {
				isDark,
				nodeBg: '#0f172a',
				nodeBorder: '#64748b',
				text: '#e2e8f0',
				textOutline: '#020617',
				edge: '#64748b',
				selection: '#60a5fa',
				hover: '#93c5fd',
				badgeBg: '#1e293b',
				badgeText: '#e2e8f0'
			}
		: {
				isDark,
				nodeBg: '#ffffff',
				nodeBorder: '#94a3b8',
				text: '#0f172a',
				textOutline: '#ffffff',
				edge: '#94a3b8',
				selection: '#2563eb',
				hover: '#3b82f6',
				badgeBg: '#f1f5f9',
				badgeText: '#0f172a'
			};

const str = (v: unknown): string | undefined =>
	typeof v === 'string' && v.length > 0 ? v : undefined;
const num = (v: unknown): number | undefined =>
	typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const nodeImages = (n: NodeSingular): string[] => {
	const images = n.data('images');
	if (Array.isArray(images)) return images.filter((i): i is string => typeof i === 'string' && !!i);
	const image = str(n.data('image'));
	return image ? [image] : [];
};

/**
 * Default stylesheet. Data contract (all optional):
 *
 * nodes — `label`, `image` or `images[]` (first layer is the icon, drawn at
 * `iconScale` of the node, extra layers cover the whole node: overlays),
 * `iconScale` (0–1, default .6), `color` (border), `bg`, `shape`, `size`,
 * `borderWidth`, `borderStyle`, `outlineColor`, `outlineWidth`.
 *
 * edges — `label`, `color`, `width`, `lineStyle`, `arrow` (target arrow
 * shape, `none` for undirected), `labelAlways` (keep label at any zoom).
 *
 * Classes — `dimmed`, `highlighted`, `hover`, `show-label`, `hidden`,
 * `bundle` (multi-edge bundle with a count badge), `pinned`.
 *
 * Edge labels only render at zoom ≥ 1 (`min-zoomed-font-size`), on hover,
 * on selection, or with `show-label` / `labelAlways`.
 */
export const defaultStylesheet = (t: CyTheme): StylesheetJson => [
	{
		selector: 'core',
		style: {
			'selection-box-color': t.selection,
			'selection-box-border-color': t.selection,
			'selection-box-opacity': 0.12,
			'active-bg-color': t.selection,
			'active-bg-opacity': 0.12,
			'active-bg-size': 24,
			'selection-box-border-width': 1,
			'outside-texture-bg-color': t.nodeBg,
			'outside-texture-bg-opacity': 0.125
		}
	},
	{
		selector: 'node',
		style: {
			label: (n: NodeSingular) => str(n.data('label')) ?? '',
			shape: ((n: NodeSingular) => str(n.data('shape')) ?? 'ellipse') as unknown as 'ellipse',
			width: (n: NodeSingular) => num(n.data('size')) ?? 40,
			height: (n: NodeSingular) => num(n.data('size')) ?? 40,
			'background-color': (n: NodeSingular) => str(n.data('bg')) ?? t.nodeBg,
			'border-color': (n: NodeSingular) => str(n.data('color')) ?? t.nodeBorder,
			'border-width': (n: NodeSingular) => num(n.data('borderWidth')) ?? 2,
			'border-style': ((n: NodeSingular) =>
				str(n.data('borderStyle')) ?? 'solid') as unknown as 'solid',
			'outline-color': (n: NodeSingular) => str(n.data('outlineColor')) ?? t.nodeBorder,
			'outline-width': (n: NodeSingular) => num(n.data('outlineWidth')) ?? 0,
			'outline-offset': 2,
			'background-image': ((n: NodeSingular) => {
				const images = nodeImages(n);
				return images.length ? images : 'none';
			}) as unknown as string,
			'background-width': ((n: NodeSingular) => {
				const scale = `${Math.round((num(n.data('iconScale')) ?? 0.6) * 100)}%`;
				const images = nodeImages(n);
				return images.length ? images.map((_, i) => (i === 0 ? scale : '100%')) : 'auto';
			}) as unknown as string,
			'background-height': ((n: NodeSingular) => {
				const scale = `${Math.round((num(n.data('iconScale')) ?? 0.6) * 100)}%`;
				const images = nodeImages(n);
				return images.length ? images.map((_, i) => (i === 0 ? scale : '100%')) : 'auto';
			}) as unknown as string,
			'background-fit': 'none',
			'background-clip': 'none',
			'bounds-expansion': 6,
			'background-image-crossorigin': 'anonymous',
			color: t.text,
			'font-size': 11,
			'font-family':
				'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			'text-valign': 'bottom',
			'text-halign': 'center',
			'text-margin-y': 4,
			'text-wrap': 'wrap',
			'text-max-width': '140px',
			'text-outline-color': t.textOutline,
			'text-outline-width': 2,
			'min-zoomed-font-size': 6,
			'overlay-padding': 4,
			'transition-property': 'opacity, border-color',
			'transition-duration': 120
		}
	},
	{
		selector: 'edge',
		style: {
			label: (e: EdgeSingular) => str(e.data('label')) ?? '',
			'curve-style': 'bezier',
			'control-point-step-size': 28,
			width: (e: EdgeSingular) => num(e.data('width')) ?? 1.5,
			'line-color': (e: EdgeSingular) => str(e.data('color')) ?? t.edge,
			'line-style': ((e: EdgeSingular) =>
				str(e.data('lineStyle')) ?? 'solid') as unknown as 'solid',
			'line-dash-pattern': [6, 4],
			'target-arrow-shape': ((e: EdgeSingular) =>
				str(e.data('arrow')) ?? 'none') as unknown as 'triangle',
			'target-arrow-color': (e: EdgeSingular) => str(e.data('color')) ?? t.edge,
			'arrow-scale': 1.1,
			color: t.text,
			'font-size': 10,
			'text-rotation': 'autorotate',
			'text-outline-color': t.textOutline,
			'text-outline-width': 2,
			'min-zoomed-font-size': (e: EdgeSingular) => (e.data('labelAlways') ? 0 : 10),
			'overlay-padding': 3,
			'transition-property': 'opacity, line-color',
			'transition-duration': 120
		}
	},
	{
		selector: 'edge.bundle',
		style: {
			'text-background-color': t.badgeBg,
			'text-background-opacity': 1,
			'text-background-shape': 'roundrectangle',
			'text-background-padding': '2px',
			'text-border-color': t.nodeBorder,
			'text-border-width': 1,
			'text-border-opacity': 1,
			'text-rotation': 'none',
			color: t.badgeText,
			'min-zoomed-font-size': 0
		}
	},
	{
		selector: 'edge.show-label, edge.hover, edge:selected',
		style: { 'min-zoomed-font-size': 0 }
	},
	{
		selector: 'node.hover',
		style: { 'border-color': t.hover, 'border-width': 3 }
	},
	{
		selector: 'edge.hover',
		style: { width: (e: EdgeSingular) => (num(e.data('width')) ?? 1.5) + 1.5 }
	},
	{
		selector: 'node:selected',
		style: {
			'border-color': t.selection,
			'border-width': 4,
			'overlay-color': t.selection,
			'overlay-opacity': 0.08
		}
	},
	{
		selector: 'edge:selected',
		style: {
			'line-color': t.selection,
			'target-arrow-color': t.selection,
			width: (e: EdgeSingular) => (num(e.data('width')) ?? 1.5) + 1.5
		}
	},
	{
		selector: '.highlighted',
		style: { 'z-index': 20 }
	},
	{
		selector: 'node.highlighted',
		style: { 'border-color': t.selection, 'border-width': 4 }
	},
	{
		selector: 'edge.highlighted',
		style: {
			'line-color': t.selection,
			'target-arrow-color': t.selection,
			width: (e: EdgeSingular) => (num(e.data('width')) ?? 1.5) + 2,
			'min-zoomed-font-size': 0
		}
	},
	{
		selector: '.dimmed',
		style: { opacity: 0.18, 'z-index': 0 }
	},
	{
		selector: '.hidden',
		style: { display: 'none' }
	},
	{
		selector: 'node.pinned',
		style: { 'border-style': 'double', 'border-width': 5 }
	},
	// cytoscape-edgehandles
	{
		selector: '.eh-handle',
		style: { 'background-color': t.selection, width: 10, height: 10, shape: 'ellipse' }
	},
	{
		selector: '.eh-hover, .eh-source, .eh-target',
		style: { 'border-color': t.selection, 'border-width': 3 }
	},
	{
		selector: '.eh-preview, .eh-ghost-edge',
		style: {
			'line-color': t.selection,
			'target-arrow-color': t.selection,
			'target-arrow-shape': 'triangle',
			'line-style': 'dashed',
			width: 2
		}
	},
	{
		selector: '.eh-ghost-edge.eh-preview-active',
		style: { opacity: 0 }
	}
];
