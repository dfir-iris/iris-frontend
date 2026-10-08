/**
 * Tab rows that never clip.
 *
 * On a tab list too narrow for every label, the labels are hidden from
 * the last tab backwards, only as many as needed for the row to fit —
 * the tabs whose label went keep their icon and count (the trigger's
 * `title` / `aria-label` carry the name). When even the icon-only row is
 * too wide, the trailing tabs leave the row and `onOverflow` reports how
 * many, so the host can list them in a "More" menu. Labels are the
 * elements marked `data-tab-label` inside the list's direct children.
 */

/**
 * How many labels to hide, counted from the end, for a row that is
 * `fullWidth` wide with every label shown to fit in `available`.
 * `savings[i]` is what hiding label `i` gives back.
 */
export function tabLabelsToHide(savings: number[], fullWidth: number, available: number): number {
	let width = fullWidth;
	let hidden = 0;
	for (let i = savings.length - 1; i >= 0 && width > available; i--) {
		width -= savings[i];
		hidden += 1;
	}
	return hidden;
}

export type TabRowLayout = {
	/** Labels hidden, counted from the end. */
	labels: number;
	/** Trailing tabs moved out of the row (into the "More" menu). */
	overflow: number;
};

/**
 * Layout of a row of tabs `widths[i]` wide with their label shown
 * (`savings[i]` given back without it) in `available` pixels. Labels go
 * first; past that, trailing tabs go into a menu whose trigger takes
 * `moreWidth`. The first tab always stays in the row.
 */
export function tabRowLayout(
	widths: number[],
	savings: number[],
	available: number,
	moreWidth: number
): TabRowLayout {
	const full = widths.reduce((sum, w) => sum + w, 0);
	const labels = tabLabelsToHide(savings, full, available);
	const hiddenSavings = savings.slice(savings.length - labels).reduce((sum, s) => sum + s, 0);
	let width = full - hiddenSavings;
	if (width <= available) return { labels, overflow: 0 };

	const room = available - moreWidth;
	let overflow = 0;
	for (let i = widths.length - 1; i > 0 && width > room; i--) {
		width -= widths[i] - savings[i];
		overflow += 1;
	}
	return { labels: widths.length, overflow };
}

export type CollapseTabLabelsOptions = {
	/** Called with the number of trailing tabs moved out of the row. */
	onOverflow?: (count: number) => void;
	/** Room kept for the "More" trigger once tabs overflow. */
	moreWidth?: number;
};

export function collapseTabLabels(node: HTMLElement, options: CollapseTabLabelsOptions = {}) {
	const moreWidth = options.moreWidth ?? 48;
	let reported = -1;

	const tabs = () => Array.from(node.children) as HTMLElement[];
	const labelOf = (tab: HTMLElement) => tab.querySelector<HTMLElement>('[data-tab-label]');

	const update = () => {
		const all = tabs();
		// Measure everything shown, then apply: both happen before the next
		// paint, so the intermediate state never shows. Trigger visibility
		// goes through inline style — a `hidden` attribute loses to the
		// trigger's own `display` utility class.
		for (const tab of all) {
			tab.style.display = '';
			const label = labelOf(tab);
			if (label) label.hidden = false;
		}
		const widths = all.map((tab) => tab.getBoundingClientRect().width);
		const savings = all.map((tab) => {
			const label = labelOf(tab);
			if (!label) return 0;
			const gap = parseFloat(getComputedStyle(tab).columnGap) || 0;
			return label.getBoundingClientRect().width + gap;
		});
		// One pixel of slack: sub-pixel widths must not flip the last label.
		const layout = tabRowLayout(widths, savings, node.clientWidth + 1, moreWidth);

		all.forEach((tab, i) => {
			const label = labelOf(tab);
			if (label) label.hidden = i >= all.length - layout.labels;
			if (i >= all.length - layout.overflow) tab.style.display = 'none';
		});
		if (layout.overflow !== reported) {
			reported = layout.overflow;
			options.onOverflow?.(layout.overflow);
		}
	};

	let frame = 0;
	const schedule = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(update);
	};

	// The list itself (pane resize, a badge appearing beside it) and each
	// tab (a count loading). Re-running is idempotent, so the resizes the
	// update causes settle after one pass.
	const resizes = new ResizeObserver(schedule);
	const observeTabs = () => {
		resizes.disconnect();
		resizes.observe(node);
		for (const child of tabs()) resizes.observe(child);
	};
	// Tabs added or removed (permission-gated, custom attributes).
	const mutations = new MutationObserver(() => {
		observeTabs();
		schedule();
	});
	mutations.observe(node, { childList: true });
	observeTabs();
	update();

	return {
		destroy() {
			cancelAnimationFrame(frame);
			resizes.disconnect();
			mutations.disconnect();
		}
	};
}
