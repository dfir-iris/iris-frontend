import type { GraphViewState, GraphViewSummary } from '$lib/types/resources/case-graph';
import { parseViewState } from './view-state';

/** Backend limits (case_graph.py). */
export const VIEW_NAME_MAX = 255;
export const VIEW_SNAPSHOT_MAX = 4 * 1024 * 1024;
export const VIEW_STATE_MAX = 1024 * 1024;

/** JSON with sorted object keys, so equal states give equal strings. */
export const stableStringify = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, v]) => v !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
	}
	return JSON.stringify(value ?? null);
};

/**
 * Comparable form of a view state for the "modified" indicator: positions
 * rounded to whole pixels, list order ignored, viewport left out (panning
 * or zooming does not make a view dirty, saving still stores it).
 */
export const stateFingerprint = (raw: unknown): string => {
	const s = parseViewState(raw);
	const positions: Record<string, [number, number]> = {};
	for (const [k, p] of Object.entries(s.positions))
		positions[k] = [Math.round(p.x), Math.round(p.y)];
	const sorted = (l: string[] | undefined) => [...(l ?? [])].sort();
	return stableStringify({
		...s,
		viewport: null,
		positions,
		pinned: sorted(s.pinned),
		hidden: sorted(s.hidden),
		collapsed: sorted(s.collapsed),
		include: sorted(s.include),
		extra_nodes: sorted(s.extra_nodes)
	});
};

/** Positions limited to the given keys (saved states only keep what is drawn). */
export const compactState = (state: GraphViewState, keep?: Set<string>): GraphViewState => {
	if (!keep) return state;
	const positions: GraphViewState['positions'] = {};
	for (const [k, p] of Object.entries(state.positions)) if (keep.has(k)) positions[k] = p;
	return { ...state, positions };
};

export const stateSize = (state: GraphViewState) => JSON.stringify(state).length;

export const validateViewName = (name: string): string | null => {
	const n = name.trim();
	if (!n) return 'A name is required.';
	if (n.length > VIEW_NAME_MAX) return `At most ${VIEW_NAME_MAX} characters.`;
	return null;
};

export const snapshotFits = (dataUrl: string | null | undefined) =>
	!!dataUrl && dataUrl.startsWith('data:image/png;base64,') && dataUrl.length <= VIEW_SNAPSHOT_MAX;

/**
 * Render a PNG small enough for the backend: retries with a smaller scale /
 * width until it fits, null when even the smallest is too big.
 */
export const fitSnapshot = (
	render: (opts: { scale: number; maxWidth: number }) => string,
	attempts: { scale: number; maxWidth: number }[] = [
		{ scale: 2, maxWidth: 4000 },
		{ scale: 1, maxWidth: 3000 },
		{ scale: 1, maxWidth: 2000 },
		{ scale: 0.5, maxWidth: 1400 }
	]
): string | null => {
	for (const a of attempts) {
		const png = render(a);
		if (snapshotFits(png)) return png;
	}
	return null;
};

export interface ViewPermissions {
	/** Overwrite the state, rename, delete, report default. */
	modify: boolean;
	/** Toggle `is_shared` (owner only). */
	share: boolean;
	own: boolean;
}

export const viewPermissions = (
	view: Pick<GraphViewSummary, 'owner_id' | 'is_shared'>,
	userId: number | null | undefined,
	canEdit: boolean
): ViewPermissions => {
	const own = userId !== null && userId !== undefined && view.owner_id === userId;
	return { own, modify: canEdit && (own || view.is_shared), share: canEdit && own };
};

/** Own views first, then the ones shared by others; by name within a group. */
export const groupViews = <T extends Pick<GraphViewSummary, 'owner_id' | 'name' | 'view_id'>>(
	views: T[],
	userId: number | null | undefined
): { own: T[]; shared: T[] } => {
	const byName = (a: T, b: T) =>
		a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.view_id - b.view_id;
	return {
		own: views.filter((v) => v.owner_id === userId).sort(byName),
		shared: views.filter((v) => v.owner_id !== userId).sort(byName)
	};
};

/** "Copy of X", "Copy of X (2)"… not clashing with the existing names. */
export const copyName = (name: string, existing: string[]) => {
	const taken = new Set(existing.map((n) => n.toLowerCase()));
	const base = `Copy of ${name}`.slice(0, VIEW_NAME_MAX);
	if (!taken.has(base.toLowerCase())) return base;
	for (let i = 2; ; i++) {
		const candidate = `${base.slice(0, VIEW_NAME_MAX - 6)} (${i})`;
		if (!taken.has(candidate.toLowerCase())) return candidate;
	}
};
