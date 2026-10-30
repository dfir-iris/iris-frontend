/**
 * Pure helpers of the live graph (§5 / §9.7): change batching, the "updated
 * by" summary and the presence of the other analysts.
 */
import type {
	CaseGraphChangedPayload,
	CaseGraphPresencePayload
} from '$lib/types/resources/case-graph';

export const CASE_GRAPH_JOIN = 'join-case-graph';
export const CASE_GRAPH_LEAVE = 'leave-case-graph';
export const CASE_GRAPH_CHANGED = 'case-graph-changed';
export const CASE_GRAPH_PRESENCE = 'case-graph-presence';

/** Changes arriving within this window give one refetch. */
export const REFETCH_DEBOUNCE_MS = 700;
/** Presence is re-announced at this period (the server has no leave broadcast)… */
export const PRESENCE_HEARTBEAT_MS = 20_000;
/** …and forgotten when not heard of for this long. */
export const PRESENCE_TTL_MS = 50_000;
/** How long the "updated by" indicator stays up. */
export const UPDATED_BY_MS = 8_000;
export const PRESENCE_KEY_MAX = 256;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** The change, when it is a well-formed one of this case. */
export const parseGraphChange = (raw: unknown, caseId: number): CaseGraphChangedPayload | null => {
	if (!isObject(raw) || raw.case_id !== caseId || typeof raw.entity !== 'string') return null;
	const by = raw.by_user_id;
	return {
		case_id: caseId,
		entity: raw.entity,
		action: typeof raw.action === 'string' ? raw.action : 'updated',
		key: typeof raw.key === 'string' ? raw.key : null,
		by_user_id: typeof by === 'number' && Number.isInteger(by) ? by : null
	};
};

/** The presence, when it is a well-formed one of this case from another user. */
export const parseGraphPresence = (
	raw: unknown,
	caseId: number,
	selfId: number | null
): CaseGraphPresencePayload | null => {
	if (!isObject(raw) || raw.case_id !== caseId || !isObject(raw.user)) return null;
	const { id, name, login } = raw.user;
	if (typeof id !== 'number' || !Number.isInteger(id) || id === selfId) return null;
	return {
		case_id: caseId,
		user: {
			id,
			name: typeof name === 'string' ? name : null,
			login: typeof login === 'string' ? login : null
		},
		selected_key: typeof raw.selected_key === 'string' ? raw.selected_key : null
	};
};

/** Changes accumulated during one debounce window. */
export interface ChangeBatch {
	count: number;
	/** Authors, in order of arrival, without duplicates; null = unknown. */
	users: (number | null)[];
	entities: string[];
}

export const addChange = (
	batch: ChangeBatch | null,
	change: CaseGraphChangedPayload
): ChangeBatch => {
	const b = batch ?? { count: 0, users: [], entities: [] };
	return {
		count: b.count + 1,
		users: b.users.includes(change.by_user_id) ? b.users : [...b.users, change.by_user_id],
		entities: b.entities.includes(change.entity) ? b.entities : [...b.entities, change.entity]
	};
};

/** Views do not change the graph data: only their list needs a reload. */
export const batchTouchesGraph = (b: ChangeBatch) => b.entities.some((e) => e !== 'view');
export const batchTouchesViews = (b: ChangeBatch) => b.entities.includes('view');

/**
 * "Updated by Alice", "… by Alice and Bob", "… by Alice and 2 others";
 * null when only this user made the changes (another tab, or this one).
 */
export const describeUpdate = (
	b: ChangeBatch,
	selfId: number | null,
	nameOf: (id: number) => string | null
): string | null => {
	const others = b.users.filter((u) => u === null || u !== selfId);
	if (!others.length) return null;
	const named = [
		...new Set(others.map((u) => (u === null ? null : nameOf(u))).filter((n): n is string => !!n))
	];
	const unknown = others.length - named.length;
	if (!named.length)
		return unknown > 1 ? 'Updated by other analysts' : 'Updated by another analyst';
	const rest = named.length - 1 + unknown;
	if (rest === 0) return `Updated by ${named[0]}`;
	if (rest === 1 && named.length === 2) return `Updated by ${named[0]} and ${named[1]}`;
	return `Updated by ${named[0]} and ${rest} other${rest > 1 ? 's' : ''}`;
};

// ---------------------------------------------------------------------------
// Presence
// ---------------------------------------------------------------------------

export interface GraphPeer {
	user: CaseGraphPresencePayload['user'];
	selectedKey: string | null;
	seenAt: number;
}

/** By user id (several tabs of a user count once: the latest wins). */
export type GraphPeers = Record<number, GraphPeer>;

export const presenceApply = (
	peers: GraphPeers,
	p: CaseGraphPresencePayload,
	now: number
): GraphPeers => ({
	...peers,
	[p.user.id]: { user: p.user, selectedKey: p.selected_key, seenAt: now }
});

/** The same object when nobody expired (no needless reactivity). */
export const presenceExpire = (peers: GraphPeers, now: number, ttl = PRESENCE_TTL_MS) => {
	const kept = Object.entries(peers).filter(([, p]) => now - p.seenAt <= ttl);
	return kept.length === Object.keys(peers).length ? peers : Object.fromEntries(kept);
};

export const peerName = (u: GraphPeer['user']) => u.name?.trim() || u.login || `User #${u.id}`;

export const presenceList = (peers: GraphPeers): GraphPeer[] =>
	Object.values(peers).sort(
		(a, b) => peerName(a.user).localeCompare(peerName(b.user)) || a.user.id - b.user.id
	);

/** Peers per selected key. */
export const presenceByKey = (peers: GraphPeers): Map<string, GraphPeer[]> => {
	const out = new Map<string, GraphPeer[]>();
	for (const p of presenceList(peers)) {
		if (!p.selectedKey) continue;
		const list = out.get(p.selectedKey);
		if (list) list.push(p);
		else out.set(p.selectedKey, [p]);
	}
	return out;
};

/** "Alice Martin" → "AM", "alice" → "AL", "jean-paul" → "JP". */
export const initials = (name: string) => {
	const words = name
		.trim()
		.split(/[\s._-]+/)
		.filter(Boolean);
	if (!words.length) return '?';
	if (words.length === 1) return [...words[0]].slice(0, 2).join('').toUpperCase();
	return `${[...words[0]][0]}${[...words[words.length - 1]][0]}`.toUpperCase();
};

/** Readable on both light and dark backgrounds, with white text. */
const PEER_COLORS = [
	'#2563eb',
	'#db2777',
	'#059669',
	'#d97706',
	'#7c3aed',
	'#0891b2',
	'#dc2626',
	'#4d7c0f'
];

export const peerColor = (userId: number) =>
	PEER_COLORS[((userId % PEER_COLORS.length) + PEER_COLORS.length) % PEER_COLORS.length];

/**
 * The key announced for a selection: the first selected graph object (node,
 * then relation), so the others see where this analyst is; null for none.
 */
export const presenceKeyOf = (
	selection: readonly string[],
	isNode: (id: string) => boolean,
	isEdge: (id: string) => boolean
): string | null => {
	const key = selection.find(isNode) ?? selection.find(isEdge) ?? null;
	return key && key.length <= PRESENCE_KEY_MAX ? key : null;
};
