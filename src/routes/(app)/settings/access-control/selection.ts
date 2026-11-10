/** How many of `ids` are in `selected`: none, some or all. */
export type SelectionState = 'none' | 'some' | 'all';

export function selectionState(selected: Set<number>, ids: number[]): SelectionState {
	const count = ids.filter((id) => selected.has(id)).length;
	if (count === 0) return 'none';
	return count === ids.length ? 'all' : 'some';
}

/**
 * The "select all" checkbox: unticks `ids` when they are all ticked,
 * ticks them all otherwise. Ids outside `ids` (filtered out) are kept.
 */
export function selectionToggleAll(selected: Set<number>, ids: number[]): Set<number> {
	const next = new Set(selected);
	if (selectionState(selected, ids) === 'all') for (const id of ids) next.delete(id);
	else for (const id of ids) next.add(id);
	return next;
}
