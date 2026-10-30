import type { Core } from 'cytoscape';

/** PNG data URL of the whole graph (not just the viewport). */
export const exportPng = (
	cy: Core,
	{
		background,
		scale = 2,
		maxWidth = 6000
	}: { background?: string; scale?: number; maxWidth?: number } = {}
): string => cy.png({ full: true, scale, maxWidth, bg: background, output: 'base64uri' });

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colourOf = (v: unknown, fallback: string) =>
	typeof v === 'string' && v && v !== 'none' ? v : fallback;

/**
 * Lightweight SVG export: straight edges with arrows, nodes as shapes with
 * their border colour, labels. Images are left out (asset icons are remote
 * PNGs) — use the PNG export for a pixel-exact picture.
 */
export const exportSvg = (cy: Core, { background }: { background?: string } = {}): string => {
	const visibleNodes = cy.nodes(':visible');
	const bb = visibleNodes.union(cy.edges(':visible')).boundingBox({});
	const pad = 30;
	const w = Math.max(1, bb.w + pad * 2);
	const h = Math.max(1, bb.h + pad * 2);
	const ox = -bb.x1 + pad;
	const oy = -bb.y1 + pad;
	const parts: string[] = [];
	parts.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="sans-serif">`
	);
	parts.push(
		'<defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="context-stroke"/></marker></defs>'
	);
	if (background) parts.push(`<rect width="100%" height="100%" fill="${esc(background)}"/>`);

	cy.edges(':visible').forEach((e) => {
		const s = e.sourceEndpoint();
		const t = e.targetEndpoint();
		const color = colourOf(e.style('line-color'), '#94a3b8');
		const width = Number.parseFloat(String(e.style('width'))) || 1.5;
		const style = String(e.style('line-style'));
		const dash =
			style === 'dashed'
				? ' stroke-dasharray="6 4"'
				: style === 'dotted'
					? ' stroke-dasharray="2 3"'
					: '';
		const arrow = e.style('target-arrow-shape') !== 'none' ? ' marker-end="url(#arrow)"' : '';
		parts.push(
			`<line x1="${s.x + ox}" y1="${s.y + oy}" x2="${t.x + ox}" y2="${t.y + oy}" stroke="${esc(color)}" stroke-width="${width}"${dash}${arrow}/>`
		);
		const label = String(e.data('label') ?? '');
		if (label) {
			parts.push(
				`<text x="${(s.x + t.x) / 2 + ox}" y="${(s.y + t.y) / 2 + oy - 3}" font-size="9" text-anchor="middle" fill="${esc(colourOf(e.style('color'), '#334155'))}">${esc(label)}</text>`
			);
		}
	});

	visibleNodes.forEach((n) => {
		const p = n.position();
		const rw = n.width() / 2;
		const rh = n.height() / 2;
		const fill = colourOf(n.style('background-color'), '#ffffff');
		const stroke = colourOf(n.style('border-color'), '#94a3b8');
		const sw = Number.parseFloat(String(n.style('border-width'))) || 2;
		const shape = String(n.style('shape'));
		if (shape.includes('rectangle') || shape === 'tag') {
			parts.push(
				`<rect x="${p.x - rw + ox}" y="${p.y - rh + oy}" width="${rw * 2}" height="${rh * 2}" rx="6" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}"/>`
			);
		} else if (shape === 'diamond') {
			const cx = p.x + ox;
			const cy0 = p.y + oy;
			parts.push(
				`<polygon points="${cx},${cy0 - rh} ${cx + rw},${cy0} ${cx},${cy0 + rh} ${cx - rw},${cy0}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}"/>`
			);
		} else {
			parts.push(
				`<ellipse cx="${p.x + ox}" cy="${p.y + oy}" rx="${rw}" ry="${rh}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw}"/>`
			);
		}
		const label = String(n.data('label') ?? '');
		if (label) {
			label.split('\n').forEach((line, i) => {
				parts.push(
					`<text x="${p.x + ox}" y="${p.y + rh + 14 + i * 12 + oy}" font-size="11" text-anchor="middle" fill="${esc(colourOf(n.style('color'), '#0f172a'))}">${esc(line)}</text>`
				);
			});
		}
	});
	parts.push('</svg>');
	return parts.join('');
};

/** Trigger a browser download of a data URL or text payload. */
export const downloadFile = (filename: string, content: string, mime?: string) => {
	const href = content.startsWith('data:')
		? content
		: URL.createObjectURL(new Blob([content], { type: mime ?? 'application/octet-stream' }));
	const a = document.createElement('a');
	a.href = href;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	if (!content.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(href), 1000);
};
