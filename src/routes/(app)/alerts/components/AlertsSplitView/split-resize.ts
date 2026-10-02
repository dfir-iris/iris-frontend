/**
 * Width bounds for the split view's resizable queue pane.
 *
 * The queue's rows are laid out for the 420px track the narrow layout
 * already uses, so that is as small as a drag may take it; the detail
 * keeps enough room for its title row and chips. The same bounds are
 * applied in CSS (see `.iris-triage` in AlertsSplitView.svelte), so a
 * width saved on a wide screen still fits when the window is narrower.
 */
export const SPLIT_QUEUE_MIN_WIDTH = 420;
export const SPLIT_DETAIL_MIN_WIDTH = 480;

/** Keyboard step for the divider's arrow keys. */
export const SPLIT_QUEUE_KEY_STEP = 24;

/**
 * Clamp a dragged queue width to what the container can hold. A container
 * too narrow for both minimums keeps the queue at its own minimum — the
 * stacked layout takes over below that anyway.
 */
export const clampSplitQueueWidth = (width: number, containerWidth: number): number => {
	const max = Math.max(SPLIT_QUEUE_MIN_WIDTH, containerWidth - SPLIT_DETAIL_MIN_WIDTH);
	return Math.round(Math.min(Math.max(width, SPLIT_QUEUE_MIN_WIDTH), max));
};
