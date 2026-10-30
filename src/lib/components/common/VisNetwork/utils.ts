import iocSvg from 'lucide-static/icons/link.svg?raw';
import {
	svgToDataUrl,
	withStroke,
	applyAssetImageTheme
} from '$lib/components/common/CytoscapeGraph/icons';

export { svgToDataUrl, withStroke, applyAssetImageTheme };

export const makeIocIcon = (strokeColor: string) => svgToDataUrl(withStroke(iocSvg, strokeColor));

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
