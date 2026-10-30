/**
 * Click-to-use wheel gating for graphs embedded in scrollable pages.
 *
 * Cytoscape only calls `preventDefault()` on a wheel event when user zooming
 * is enabled, so turning it off hands the wheel back to the page. The gate
 * keeps zooming off until the user clicks into (or focuses) the canvas, and
 * turns it off again as soon as the pointer leaves, on Escape, or on a
 * pointerdown anywhere else — scrolling the page across an activated graph
 * must never start zooming it.
 */
export interface ZoomGateTarget {
	userZoomingEnabled(enabled: boolean): unknown;
}

export interface ZoomGate {
	readonly active: boolean;
	activate(): void;
	release(): void;
}

export const createZoomGate = (
	target: ZoomGateTarget,
	onChange?: (active: boolean) => void
): ZoomGate => {
	let active = false;
	target.userZoomingEnabled(false);
	const set = (next: boolean) => {
		if (next === active) return;
		active = next;
		target.userZoomingEnabled(next);
		onChange?.(next);
	};
	return {
		get active() {
			return active;
		},
		activate: () => set(true),
		release: () => set(false)
	};
};

/** Wire a gate to its canvas element. Returns the unbind function. */
export const bindZoomGate = (el: HTMLElement, gate: ZoomGate): (() => void) => {
	const doc = el.ownerDocument;
	const activate = () => gate.activate();
	const release = () => gate.release();
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') gate.release();
	};
	const onOutside = (e: Event) => {
		if (!(e.target instanceof Node) || !el.contains(e.target)) gate.release();
	};
	el.addEventListener('pointerdown', activate);
	el.addEventListener('focusin', activate);
	el.addEventListener('mouseleave', release);
	el.addEventListener('keydown', onKey);
	doc.addEventListener('pointerdown', onOutside, true);
	return () => {
		el.removeEventListener('pointerdown', activate);
		el.removeEventListener('focusin', activate);
		el.removeEventListener('mouseleave', release);
		el.removeEventListener('keydown', onKey);
		doc.removeEventListener('pointerdown', onOutside, true);
	};
};
