/**
 * Tab labels that give way one at a time.
 *
 * On a tab list too narrow for every label, the labels are hidden from
 * the last tab backwards, only as many as needed for the row to fit —
 * the tabs whose label went keep their icon and count (the trigger's
 * `title` / `aria-label` carry the name). Labels are the elements marked
 * `data-tab-label` inside the list's direct children.
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

export function collapseTabLabels(node: HTMLElement) {
	// Measured while shown: a hidden label has no width.
	const savingsOf = new WeakMap<HTMLElement, number>();

	const labels = () =>
		Array.from(node.querySelectorAll<HTMLElement>(':scope > * [data-tab-label]'));

	const update = () => {
		const all = labels();
		for (const label of all) {
			if (!label.hidden) {
				const gap = parseFloat(getComputedStyle(label.parentElement ?? label).columnGap) || 0;
				savingsOf.set(label, label.getBoundingClientRect().width + gap);
			}
		}
		const savings = all.map((label) => savingsOf.get(label) ?? 0);
		const shown = Array.from(node.children).reduce(
			(sum, child) => sum + child.getBoundingClientRect().width,
			0
		);
		const fullWidth = all.reduce((sum, label, i) => (label.hidden ? sum + savings[i] : sum), shown);
		// One pixel of slack: sub-pixel widths must not flip the last label.
		const hide = tabLabelsToHide(savings, fullWidth, node.clientWidth + 1);
		all.forEach((label, i) => {
			const shouldHide = i >= all.length - hide;
			if (label.hidden !== shouldHide) label.hidden = shouldHide;
		});
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
		for (const child of Array.from(node.children)) resizes.observe(child);
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
