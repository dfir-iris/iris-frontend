/**
 * Helpers for user-reorderable tab bars (the war-room sections today).
 *
 * The saved order is a list of tab keys persisted in the user preferences.
 * The code owns the set of tabs, so a saved order is only a hint: keys that
 * no longer exist are dropped and tabs missing from it (added after the user
 * arranged the bar) keep their default relative position at the end.
 */

/** `tabs` arranged by `order`; unknown keys ignored, missing tabs appended. */
export const applyTabOrder = <T extends { key: string }>(
	tabs: readonly T[],
	order: readonly string[] | null | undefined
): T[] => {
	if (!order?.length) return [...tabs];
	const byKey = new Map(tabs.map((tab) => [tab.key, tab]));
	const ordered: T[] = [];
	for (const key of order) {
		const tab = byKey.get(key);
		if (!tab) continue;
		ordered.push(tab);
		byKey.delete(key);
	}
	return [...ordered, ...byKey.values()];
};

/** Keys of `tabs` with the tab at `from` moved to index `to`. */
export const moveTab = <T extends { key: string }>(
	tabs: readonly T[],
	from: number,
	to: number
): string[] => {
	const keys = tabs.map((tab) => tab.key);
	if (from === to || from < 0 || to < 0 || from >= keys.length || to >= keys.length) return keys;
	const [moved] = keys.splice(from, 1);
	keys.splice(to, 0, moved);
	return keys;
};

/** True when `order` puts the tabs in their default order. */
export const isDefaultTabOrder = <T extends { key: string }>(
	tabs: readonly T[],
	order: readonly string[] | null | undefined
): boolean => applyTabOrder(tabs, order).every((tab, index) => tab === tabs[index]);
