export type FilterLogic = 'and' | 'or';

export type FilterOperation =
	| 'equals'
	| 'not'
	| 'starts_with'
	| 'not_starts_with'
	| 'contains'
	| 'not_contains'
	| 'ends_with'
	| 'not_ends_with'
	| 'empty'
	| 'not_empty';

export type FilterValueOption = {
	value: string;
	label: string;
};

export type FilterDef<T> = {
	id: string;
	label: string;
	get: (row: unknown) => T | string | number | boolean | null | undefined;
	/**
	 * Optional fixed set of values the user can pick from instead of
	 * typing free text. When provided, the filter builder swaps the
	 * value input for a select. Use this for low-cardinality fields
	 * (state, severity) and lookups whose options the caller can
	 * load once (owner, customer).
	 */
	valueOptions?: FilterValueOption[];
};

/**
 * Recursive filter tree the cases overview now uses. A `FilterGroup`
 * combines its `items` with `AND` or `OR`; each item is either a
 * single condition (the previous `FilterRow`) or a nested
 * `FilterGroup`. The wire format is the same so the API serialiser
 * just JSON-stringifies the root group.
 */
export type FilterGroup = {
	logic: FilterLogic;
	items: FilterTreeNode[];
};

export type FilterTreeNode = FilterRow | FilterGroup;

export const isGroup = (node: FilterTreeNode): node is FilterGroup =>
	(node as FilterGroup).items !== undefined;

/** True when a leaf will actually narrow the result set. */
const rowIsActive = (row: FilterRow): boolean => {
	const op = (row.operation ?? '').toLowerCase();
	if (op === 'empty' || op === 'not_empty') return true;
	return (row.value ?? '').trim() !== '';
};

/** Returns true when the tree carries at least one actionable condition. */
export const treeHasActiveCondition = (group: FilterGroup): boolean =>
	group.items.some((item) => (isGroup(item) ? treeHasActiveCondition(item) : rowIsActive(item)));

/**
 * How many actionable conditions the tree holds, counting nested groups.
 * Drives the badge on the overview's Filters button, so half-typed rows
 * don't inflate it.
 */
export const countActiveConditions = (group: FilterGroup): number =>
	group.items.reduce(
		(n, item) => n + (isGroup(item) ? countActiveConditions(item) : rowIsActive(item) ? 1 : 0),
		0
	);

/** Strip rows with empty values, prune empty sub-groups. */
export const pruneTree = (group: FilterGroup): FilterGroup => {
	const items: FilterTreeNode[] = [];
	for (const item of group.items) {
		if (isGroup(item)) {
			const sub = pruneTree(item);
			if (sub.items.length > 0) items.push(sub);
		} else {
			const op = (item.operation ?? '').toLowerCase();
			if (op === 'empty' || op === 'not_empty') {
				items.push({ ...item, value: '' });
			} else if ((item.value ?? '').trim() !== '') {
				items.push(item);
			}
		}
	}
	return { logic: group.logic, items };
};

export const emptyGroup = (logic: FilterLogic = 'and'): FilterGroup => ({ logic, items: [] });

export type FilterRow = {
	fieldId: string;
	operation: FilterOperation;
	value: string;
};

const norm = (v: string) => v.toLowerCase();

const isEmpty = (v: string) => v.trim() === '';

const matchOne = (cellRaw: string, op: FilterOperation, value: string): boolean => {
	const cell = norm(cellRaw);
	const val = norm(value);

	switch (op) {
		case 'equals':
			return cell === val;
		case 'not':
			return cell !== val;
		case 'starts_with':
			return cell.startsWith(val);
		case 'not_starts_with':
			return !cell.startsWith(val);
		case 'contains':
			return cell.includes(val);
		case 'not_contains':
			return !cell.includes(val);
		case 'ends_with':
			return cell.endsWith(val);
		case 'not_ends_with':
			return !cell.endsWith(val);
		case 'empty':
			return isEmpty(cellRaw);
		case 'not_empty':
			return !isEmpty(cellRaw);
	}
};

export const applyFilters = <T>(
	rows: T[],
	defs: FilterDef<T>[],
	filters: FilterRow[],
	logic: FilterLogic
): T[] => {
	const active = filters.filter((f) => {
		if (f.operation === 'empty' || f.operation === 'not_empty') return true;
		return f.value.trim() !== '';
	});

	if (active.length === 0) return rows;

	const byId = new Map(defs.map((d) => [d.id, d] as const));

	const rowMatches = (row: T): boolean => {
		const results = active.map((f) => {
			const def = byId.get(f.fieldId);
			if (!def) return true;

			const raw = def.get(row);
			const cell = raw === null || raw === undefined ? '' : String(raw);

			return matchOne(cell, f.operation, f.value);
		});

		return logic === 'and' ? results.every(Boolean) : results.some(Boolean);
	};

	return rows.filter(rowMatches);
};
