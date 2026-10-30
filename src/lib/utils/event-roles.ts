/**
 * Roles of the assets / IOCs linked to a timeline event (investigation
 * graph §3.4): `source` → `target`, the others are `involved`. The graph
 * derives directed relations from them.
 */
import type {
	CaseTimelineEvent,
	EventLinkRole,
	EventLinkRoles
} from '$lib/services/case-timeline.service';

export const EVENT_LINK_ROLES: { value: EventLinkRole; label: string; hint: string }[] = [
	{ value: 'source', label: 'Source', hint: 'Where the activity comes from' },
	{ value: 'target', label: 'Target', hint: 'What the activity is aimed at' },
	{ value: 'involved', label: 'Involved', hint: 'Takes part, without a direction' }
];

export const DEFAULT_EVENT_LINK_ROLE: EventLinkRole = 'involved';

const isRole = (v: unknown): v is EventLinkRole =>
	v === 'source' || v === 'target' || v === 'involved';

/** Role per linked id: the read `*_roles` object first, else the list `role` fields. */
export const eventLinkRoles = (
	event:
		| Pick<CaseTimelineEvent, 'event_assets_roles' | 'event_iocs_roles' | 'assets' | 'iocs'>
		| null
		| undefined,
	kind: 'asset' | 'ioc'
): Record<number, EventLinkRole> => {
	const out: Record<number, EventLinkRole> = {};
	if (!event) return out;
	const linked = kind === 'asset' ? event.assets : event.iocs;
	for (const l of linked ?? []) {
		if (l.id !== undefined && l.id !== null && isRole(l.role)) out[l.id] = l.role;
	}
	const stored = kind === 'asset' ? event.event_assets_roles : event.event_iocs_roles;
	for (const [id, role] of Object.entries(stored ?? {})) {
		const n = Number(id);
		if (Number.isInteger(n) && isRole(role)) out[n] = role;
	}
	return out;
};

/** Request object for the linked ids: every one listed (string keys), `involved` by default. */
export const eventLinkRolesPayload = (
	ids: readonly number[],
	roles: Record<number, EventLinkRole>
): EventLinkRoles => {
	const out: EventLinkRoles = {};
	for (const id of ids) out[`${id}`] = roles[id] ?? DEFAULT_EVENT_LINK_ROLE;
	return out;
};

/** True when at least one linked object has a direction. */
export const hasDirectedRoles = (roles: Record<number, EventLinkRole>, ids: readonly number[]) =>
	ids.some((id) => roles[id] === 'source' || roles[id] === 'target');

export interface EventFlow {
	sources: string[];
	targets: string[];
}

type LinkedLike = {
	name: string;
	role?: EventLinkRole;
	asset_name?: string;
	ioc_value?: string;
};

const labelOf = (l: LinkedLike) => l.asset_name || l.ioc_value || l.name;

/**
 * Display of the direction of an event (`WS01 → DC01`), from the linked
 * assets then IOCs; null when no object has a direction.
 */
export const eventFlow = (
	assets: readonly LinkedLike[] | undefined,
	iocs: readonly LinkedLike[] | undefined
): EventFlow | null => {
	const all = [...(assets ?? []), ...(iocs ?? [])];
	const sources = all.filter((l) => l.role === 'source').map(labelOf);
	const targets = all.filter((l) => l.role === 'target').map(labelOf);
	return sources.length || targets.length ? { sources, targets } : null;
};

/** `A, B → C` with at most `max` names per side; a missing side reads `…`. */
export const formatEventFlow = (flow: EventFlow, max = 2) => {
	const side = (names: string[]) =>
		names.length > max
			? `${names.slice(0, max).join(', ')} +${names.length - max}`
			: names.join(', ');
	return `${side(flow.sources) || '…'} → ${side(flow.targets) || '…'}`;
};
