import type { RequestResponse } from '$lib/services/api.service';
import type {
	ScopeAssetInput,
	ScopeCase,
	ScopeIoc,
	ScopeIocInput
} from '$lib/services/war-room-scope.service';

/** One normalised outcome row, whatever endpoint produced it. */
// The default checkbox border is faint on the dense scope tables; make
// the row-selection boxes stand out.
export const SELECT_CHECKBOX_CLASS =
	'size-[1.05rem] border-2 border-foreground/50 bg-background hover:border-primary data-[state=checked]:border-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground';

export interface ScopeOutcome {
	case_id: number;
	status: string;
	label?: string;
	message?: string;
}

export const OUTCOME_ORDER = [
	'created',
	'updated',
	'exists',
	'unchanged',
	'denied',
	'error'
] as const;

export const OUTCOME_LABEL: Record<string, string> = {
	created: 'created',
	updated: 'updated',
	exists: 'already there',
	unchanged: 'unchanged',
	denied: 'denied',
	error: 'failed'
};

export const OUTCOME_CLASS: Record<string, string> = {
	created: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
	updated: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
	exists: 'border-border bg-muted text-muted-foreground',
	unchanged: 'border-border bg-muted text-muted-foreground',
	denied: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
	error: 'border-destructive/30 bg-destructive/10 text-destructive'
};

export const countOutcomes = (rows: ScopeOutcome[]): Record<string, number> => {
	const out: Record<string, number> = {};
	for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
	return out;
};

/** "2 created · 1 already there · 1 denied" */
export const summariseOutcomes = (rows: ScopeOutcome[]): string => {
	const counts = countOutcomes(rows);
	const parts = OUTCOME_ORDER.filter((k) => counts[k]).map(
		(k) => `${counts[k]} ${OUTCOME_LABEL[k]}`
	);
	return parts.join(' · ') || 'Nothing to do';
};

export const outcomesFailed = (rows: ScopeOutcome[]): boolean =>
	rows.some((r) => r.status === 'denied' || r.status === 'error');

/** The server message of a failed call, or a generic fallback. */
export const errorMessage = (res: RequestResponse<unknown>, fallback: string): string => {
	const data = res.data as { message?: unknown } | string | null;
	if (data && typeof data === 'object' && typeof data.message === 'string' && data.message) {
		return data.message;
	}
	return res.error?.message || fallback;
};

export const caseLabel = (c: Pick<ScopeCase, 'case_id' | 'case_name'>): string =>
	`#${c.case_id} ${c.case_name}`;

/** Distinct customers (by id, falling back to name) of a set of cases. */
export const distinctCustomers = (
	rows: { customer_id: number | null; customer_name: string | null }[]
): string[] => {
	const seen = new Map<string, string>();
	for (const r of rows) {
		const key = r.customer_id != null ? `id:${r.customer_id}` : `name:${r.customer_name ?? ''}`;
		if (!seen.has(key)) seen.set(key, r.customer_name ?? 'Unknown customer');
	}
	return [...seen.values()];
};

/** Comma-separated tag string → trimmed, de-duplicated tag string. */
export const normaliseTags = (value: string): string =>
	[
		...new Set(
			value
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean)
		)
	].join(',');

// --- Object forms --------------------------------------------------------
// The dialogs edit plain strings; these helpers turn them into the strict
// payload the server validates (no empty strings, ints as numbers).

export interface AssetForm {
	asset_name: string;
	asset_type_id: string;
	asset_ip: string;
	asset_domain: string;
	asset_description: string;
	asset_tags: string;
	asset_compromise_status_id: string;
	analysis_status_id: string;
}

export interface IocForm {
	ioc_value: string;
	ioc_type_id: string;
	ioc_tlp_id: string;
	ioc_description: string;
	ioc_tags: string;
}

export const emptyAssetForm = (): AssetForm => ({
	asset_name: '',
	asset_type_id: '',
	asset_ip: '',
	asset_domain: '',
	asset_description: '',
	asset_tags: '',
	asset_compromise_status_id: '',
	analysis_status_id: ''
});

export const emptyIocForm = (): IocForm => ({
	ioc_value: '',
	ioc_type_id: '',
	ioc_tlp_id: '',
	ioc_description: '',
	ioc_tags: ''
});

const toInt = (value: string): number | undefined => {
	if (value.trim() === '') return undefined;
	const n = Number(value);
	return Number.isInteger(n) ? n : undefined;
};

const toText = (value: string): string | undefined => {
	const v = value.trim();
	return v ? v : undefined;
};

const str = (value: unknown): string =>
	value === null || value === undefined ? '' : String(value);

export const assetFormValid = (f: AssetForm): boolean =>
	f.asset_name.trim() !== '' && toInt(f.asset_type_id) !== undefined;

export const iocFormValid = (f: IocForm): boolean =>
	f.ioc_value.trim() !== '' && toInt(f.ioc_type_id) !== undefined;

export const assetFormToInput = (f: AssetForm): ScopeAssetInput => {
	const out: ScopeAssetInput = {
		asset_name: f.asset_name.trim(),
		asset_type_id: toInt(f.asset_type_id) ?? 0
	};
	const tags = normaliseTags(f.asset_tags);
	if (toText(f.asset_ip)) out.asset_ip = toText(f.asset_ip);
	if (toText(f.asset_domain)) out.asset_domain = toText(f.asset_domain);
	if (toText(f.asset_description)) out.asset_description = toText(f.asset_description);
	if (tags) out.asset_tags = tags;
	const compromise = toInt(f.asset_compromise_status_id);
	if (compromise !== undefined) out.asset_compromise_status_id = compromise;
	const analysis = toInt(f.analysis_status_id);
	if (analysis !== undefined) out.analysis_status_id = analysis;
	return out;
};

export const iocFormToInput = (f: IocForm): ScopeIocInput => {
	const out: ScopeIocInput = {
		ioc_value: f.ioc_value.trim(),
		ioc_type_id: toInt(f.ioc_type_id) ?? 0
	};
	const tags = normaliseTags(f.ioc_tags);
	const tlp = toInt(f.ioc_tlp_id);
	if (tlp !== undefined) out.ioc_tlp_id = tlp;
	if (toText(f.ioc_description)) out.ioc_description = toText(f.ioc_description);
	if (tags) out.ioc_tags = tags;
	return out;
};

export const assetFormFromPayload = (p: Record<string, unknown>): AssetForm => ({
	asset_name: str(p.asset_name),
	asset_type_id: str(p.asset_type_id),
	asset_ip: str(p.asset_ip),
	asset_domain: str(p.asset_domain),
	asset_description: str(p.asset_description),
	asset_tags: str(p.asset_tags),
	asset_compromise_status_id: str(p.asset_compromise_status_id),
	analysis_status_id: str(p.analysis_status_id)
});

export const iocFormFromPayload = (p: Record<string, unknown>): IocForm => ({
	ioc_value: str(p.ioc_value),
	ioc_type_id: str(p.ioc_type_id),
	ioc_tlp_id: str(p.ioc_tlp_id),
	ioc_description: str(p.ioc_description),
	ioc_tags: str(p.ioc_tags)
});

/** Display label of a staged object (asset name or IOC value). */
export const stagedLabel = (s: { object_type: string; payload: Record<string, unknown> }): string =>
	str(s.object_type === 'ioc' ? s.payload.ioc_value : s.payload.asset_name) || '(unnamed)';

/** Assets sharing a group_key, i.e. the same asset seen in several cases. */
export const groupSightings = <T extends { group_key: string }>(rows: T[]): Map<string, T[]> => {
	const out = new Map<string, T[]>();
	for (const r of rows) {
		const list = out.get(r.group_key);
		if (list) list.push(r);
		else out.set(r.group_key, [r]);
	}
	return out;
};

/** One distinct IOC (type + value) and the readable cases holding it. */
export interface IocRow {
	key: string;
	first: ScopeIoc;
	items: ScopeIoc[];
	caseIds: Set<number>;
}

/** Distinct type names of a row's sightings (cases may file the same value differently). */
export const iocTypeNames = (items: ScopeIoc[]): string =>
	[...new Set(items.map((i) => i.ioc_type_name).filter((n): n is string => !!n))].join(' / ');

export const buildIocRows = (iocs: ScopeIoc[]): IocRow[] =>
	[...groupSightings(iocs).entries()].map(([key, items]) => ({
		key,
		first: items[0],
		items,
		caseIds: new Set(items.map((i) => i.case_id))
	}));

// --- Scaling to many cases -----------------------------------------------

/**
 * Up to this many cases, the matrices show one column per case; above it
 * they collapse the cases into one totals column with a per-row breakdown
 * popover, so the DOM does not grow as cases x rows.
 */
export const CASE_COLUMNS_MAX = 12;

export const showCaseColumns = (caseCount: number): boolean => caseCount <= CASE_COLUMNS_MAX;

/** Number of pages for `total` items (at least 1). */
export const pageCount = (total: number, perPage: number): number =>
	Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, perPage)));

/** `items` of the 1-based `page`, `page` being clamped into range. */
export const pageSlice = <T>(items: T[], page: number, perPage: number): T[] => {
	const last = pageCount(items.length, perPage);
	const p = Math.min(Math.max(1, page), last);
	return items.slice((p - 1) * perPage, p * perPage);
};

/** "a, b, c and 4 more" — bounded label for long lists (titles, warnings). */
export const limitedList = (labels: string[], max = 5): string => {
	if (labels.length <= max) return labels.join(', ');
	return `${labels.slice(0, max).join(', ')} and ${labels.length - max} more`;
};

/** Ids of `cases` not in `present`, in the order of `cases`. */
export const missingCaseIds = (
	present: Set<number>,
	cases: Pick<ScopeCase, 'case_id'>[]
): number[] => cases.filter((c) => !present.has(c.case_id)).map((c) => c.case_id);

/** Cases of `cases` matching a "#12" / name / customer search. */
export const filterCases = <C extends Pick<ScopeCase, 'case_id' | 'case_name' | 'customer_name'>>(
	cases: C[],
	search: string
): C[] => {
	const q = search.trim().toLowerCase();
	if (!q) return cases;
	return cases.filter(
		(c) =>
			`#${c.case_id} ${c.case_name}`.toLowerCase().includes(q) ||
			(c.customer_name ?? '').toLowerCase().includes(q)
	);
};
