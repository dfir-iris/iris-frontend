import {
	GRAPH_INCLUDES,
	type GraphInclude,
	type GraphViewState
} from '$lib/types/resources/case-graph';

/**
 * View state (§4.6) helpers. The same shape is autosaved to localStorage per
 * case and is what saved views store server-side.
 */
export const emptyViewState = (): GraphViewState => ({
	layout: null,
	positions: {},
	pinned: [],
	hidden: [],
	collapsed: [],
	filters: {},
	viewport: null,
	time: null,
	include: [],
	extra_nodes: []
});

const isObj = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): string[] =>
	Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))] : [];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validate an untrusted state (localStorage, saved view, import): unknown
 * keys are kept (other features may own them), malformed known keys fall
 * back to their default.
 */
export const parseViewState = (raw: unknown): GraphViewState => {
	const base = emptyViewState();
	if (!isObj(raw)) return base;
	const positions: GraphViewState['positions'] = {};
	if (isObj(raw.positions)) {
		for (const [k, p] of Object.entries(raw.positions)) {
			if (isObj(p) && finite(p.x) && finite(p.y)) positions[k] = { x: p.x, y: p.y };
		}
	}
	let viewport: GraphViewState['viewport'] = null;
	if (isObj(raw.viewport) && finite(raw.viewport.zoom) && isObj(raw.viewport.pan)) {
		const pan = raw.viewport.pan;
		if (finite(pan.x) && finite(pan.y) && raw.viewport.zoom > 0) {
			viewport = { zoom: raw.viewport.zoom, pan: { x: pan.x, y: pan.y } };
		}
	}
	let time: GraphViewState['time'] = null;
	if (isObj(raw.time)) {
		const from = typeof raw.time.from === 'string' ? raw.time.from : null;
		const to = typeof raw.time.to === 'string' ? raw.time.to : null;
		time = from || to ? { from, to } : null;
	}
	return {
		...raw,
		layout: typeof raw.layout === 'string' ? raw.layout : null,
		positions,
		pinned: strings(raw.pinned),
		hidden: strings(raw.hidden),
		collapsed: strings(raw.collapsed),
		filters: isObj(raw.filters) ? raw.filters : {},
		viewport,
		time,
		include: strings(raw.include).filter((i): i is GraphInclude =>
			(GRAPH_INCLUDES as readonly string[]).includes(i)
		),
		extra_nodes: strings(raw.extra_nodes)
	};
};

/** Positions rounded to 0.1 px — keeps saved states small and stable. */
export const roundPositions = (positions: GraphViewState['positions']) => {
	const out: GraphViewState['positions'] = {};
	for (const [k, p] of Object.entries(positions)) {
		out[k] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
	}
	return out;
};

export const localStateKey = (caseId: number) => `iris:case-graph:${caseId}`;

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const defaultStorage = (): KV | null => {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
};

export const loadLocalViewState = (
	caseId: number,
	storage: KV | null = defaultStorage()
): GraphViewState | null => {
	const raw = storage?.getItem(localStateKey(caseId));
	if (!raw) return null;
	try {
		return parseViewState(JSON.parse(raw));
	} catch {
		return null;
	}
};

export const saveLocalViewState = (
	caseId: number,
	state: GraphViewState,
	storage: KV | null = defaultStorage()
): boolean => {
	if (!storage) return false;
	try {
		storage.setItem(
			localStateKey(caseId),
			JSON.stringify({ ...state, positions: roundPositions(state.positions) })
		);
		return true;
	} catch {
		// Quota exceeded or storage disabled — autosave is best effort.
		return false;
	}
};

export const clearLocalViewState = (caseId: number, storage: KV | null = defaultStorage()) => {
	storage?.removeItem(localStateKey(caseId));
};
