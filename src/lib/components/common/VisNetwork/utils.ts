import iocSvg from 'lucide-static/icons/link.svg?raw';

export const svgToDataUrl = (svg: string) =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export const withStroke = (svg: string, color: string) =>
	svg.replace(/stroke="currentColor"/g, `stroke="${color}"`).replace(/<svg /, '<svg fill="none" ');

export const makeIocIcon = (strokeColor: string) => svgToDataUrl(withStroke(iocSvg, strokeColor));

export const applyAssetImageTheme = (image: string, isDark: boolean) => {
	const theme = isDark ? 'dark' : 'light';
	const separator = image.includes('?') ? '&' : '?';
	return `${image}${separator}theme=${theme}`;
};

// vis-network's `clickToUse` controller. Real at runtime, but missing from
// the shipped typings, so describe only the part we touch.
export type VisActivatable = { activator?: { active: boolean; deactivate: () => void } };

/**
 * Hand the mouse wheel back to the page when the pointer leaves a gated
 * graph.
 *
 * vis-network only deactivates a `clickToUse` network on a click outside the
 * canvas or on Escape. Neither fires while the user is simply scrolling, so
 * once the graph has been activated it keeps swallowing the wheel every time
 * the pointer crosses it — the page stops scrolling and the graph zooms.
 *
 * Calling `setOptions({ clickToUse: true })` looks like it would re-arm the
 * gate but does nothing: vis short-circuits that branch as soon as the
 * activator exists. Deactivating it directly is what actually re-shows the
 * blocking overlay.
 */
export const releaseWheelToPage = (
	network: VisActivatable | null,
	clickToUse: boolean | undefined
) => {
	if (!clickToUse) return;
	network?.activator?.deactivate();
};
