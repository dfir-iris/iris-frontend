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

export type FilterDef<T> = {
	id: string;
	label: string;
	get: (row: unknown) => T | string | number | boolean | null | undefined;
};

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
