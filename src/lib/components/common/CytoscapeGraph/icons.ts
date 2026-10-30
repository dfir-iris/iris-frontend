/** SVG → `data:` URL usable as a canvas node image. */
export const svgToDataUrl = (svg: string) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Recolour a lucide-static SVG (which strokes with `currentColor`). */
export const withStroke = (svg: string, color: string) =>
	svg.replace(/stroke="currentColor"/g, `stroke="${color}"`).replace(/<svg /, '<svg fill="none" ');

/** Asset type icons are served with a `theme` query so the backend picks the right variant. */
export const applyAssetImageTheme = (image: string, isDark: boolean) => {
	const theme = isDark ? 'dark' : 'light';
	const separator = image.includes('?') ? '&' : '?';
	return `${image}${separator}theme=${theme}`;
};

/** Lucide icon (raw SVG) → coloured data URL. */
export const lucideIcon = (svg: string, color: string) => svgToDataUrl(withStroke(svg, color));
