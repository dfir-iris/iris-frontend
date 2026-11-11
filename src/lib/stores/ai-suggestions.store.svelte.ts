/**
 * Rune store for AI workflow suggestions.
 *
 * Panels (alert, cluster, case, war room) call `load(type, id)`; the
 * store keeps one list per entity and keeps it fresh from the
 * `ai_suggestion` event on the `/notifications` socket, which the
 * notifications store already holds open. A `created` event also pops
 * a toast linking to the entity (or to the suggestions inbox), whether
 * or not a panel is mounted — except for a question flagged `popup`,
 * which is queued instead for `AiQuestionPopup` to open in a dialog.
 * Questions put off with "Later" stay out of the queue for the tab's
 * session.
 *
 * The pure helpers (`aiSuggestionsReduce`, `aiSuggestionsToast`, …) are
 * exported for the unit tests.
 */
import {
	AiSuggestionsService,
	type AiSuggestion,
	type AiSuggestionEntityType,
	type AiSuggestionSocketEvent
} from '$lib/services/ai-suggestions.service';
import { notifications } from '$lib/stores/notifications.store';
import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
import { toast, type Toast } from '$lib/stores/toast.store';

export type AiSuggestionsByEntity = Record<string, AiSuggestion[]>;

export const AI_SUGGESTION_ENTITY_LABELS: Record<AiSuggestionEntityType, string> = {
	alert: 'Alert',
	alert_cluster: 'Alert cluster',
	case: 'Case',
	war_room: 'War room'
};

export function aiSuggestionsKey(entityType: string, entityId: number | string): string {
	return `${entityType}:${entityId}`;
}

/** True for an id safe to splice into a URL path: a positive safe integer. */
export function aiSuggestionsIsSafeId(id: unknown): id is number {
	return typeof id === 'number' && Number.isSafeInteger(id) && id > 0;
}

/**
 * In-app route of an entity a suggestion points at. Ids come from socket
 * events and LLM output, so anything but a positive safe integer yields
 * no link.
 */
export function aiSuggestionsEntityHref(
	entityType: string | null | undefined,
	entityId: unknown
): string | null {
	if (!aiSuggestionsIsSafeId(entityId)) return null;
	switch (entityType) {
		case 'alert':
			return `/alerts/${entityId}`;
		case 'alert_cluster':
			return `/alert-clusters/${entityId}`;
		case 'case':
			return `/case/${entityId}`;
		case 'war_room':
			return `/war-rooms/${entityId}`;
		default:
			return null;
	}
}

/** The suggestion in the suggestions inbox. */
export function aiSuggestionsInboxHref(id: unknown): string {
	return aiSuggestionsIsSafeId(id) ? `/suggestions?id=${id}` : '/suggestions';
}

const RUN_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Run inspector route, only for a well-formed run UUID. */
export function aiSuggestionsRunHref(runUuid: unknown): string | null {
	if (typeof runUuid !== 'string' || !RUN_UUID_RE.test(runUuid)) return null;
	return `/settings/ai-workflows/runs/${runUuid}`;
}

const createdAtMs = (s: AiSuggestion): number => {
	const t = s.created_at ? Date.parse(s.created_at) : NaN;
	return Number.isNaN(t) ? 0 : t;
};

/** Replace by id, or insert; newest first. */
export function aiSuggestionsUpsert(
	list: AiSuggestion[],
	suggestion: AiSuggestion
): AiSuggestion[] {
	const idx = list.findIndex((s) => s.id === suggestion.id);
	const next =
		idx === -1
			? [suggestion, ...list]
			: list.map((s, i) => (i === idx ? { ...s, ...suggestion } : s));
	return next.sort((a, b) => createdAtMs(b) - createdAtMs(a) || b.id - a.id);
}

/**
 * Applies a socket event. Only entities already loaded (a panel asked
 * for them) are touched; the others are fetched fresh on mount anyway.
 * Returns the same object when nothing changed.
 */
export function aiSuggestionsReduce(
	state: AiSuggestionsByEntity,
	event: AiSuggestionSocketEvent | null | undefined
): AiSuggestionsByEntity {
	if (!event) return state;
	const s = event.suggestion;
	if (!s || s.id == null || !s.entity_type || s.entity_id == null) return state;
	const key = aiSuggestionsKey(s.entity_type, s.entity_id);
	const current = state[key];
	if (!current) return state;
	if (event.action !== 'created' && event.action !== 'updated') return state;
	// Pushes never carry the answer / result (the whole audience gets them):
	// keep what the REST view gave this reader
	const { answer, result, ...rest } = s;
	const pushed: AiSuggestion = { ...rest } as AiSuggestion;
	if (answer != null) pushed.answer = answer;
	if (result != null) pushed.result = result;
	return { ...state, [key]: aiSuggestionsUpsert(current, pushed) };
}

/** Toast for a socket event, or null when none should show. */
export function aiSuggestionsToast(
	event: AiSuggestionSocketEvent | null | undefined
): Omit<Toast, 'id'> | null {
	if (!event) return null;
	const s = event.suggestion;
	if (!s || event.action !== 'created') return null;
	if (s.status !== 'open' && s.status !== 'dry_run') return null;
	const dryRun = s.status === 'dry_run';
	// A dry run is only for the inbox: nothing on the entity to act on
	const href = dryRun ? null : aiSuggestionsEntityHref(s.entity_type, s.entity_id);
	const entityLabel = s.entity_type
		? (AI_SUGGESTION_ENTITY_LABELS[s.entity_type as AiSuggestionEntityType] ?? s.entity_type)
		: null;
	const target = entityLabel
		? `${entityLabel}${s.entity_id != null ? ` #${s.entity_id}` : ''}${s.entity_title ? ` — ${s.entity_title}` : ''}`
		: null;
	const inbox = aiSuggestionsIsSafeId(s.id) ? aiSuggestionsInboxHref(s.id) : null;
	let link: Toast['link'];
	if (href) link = { href, label: `Open ${entityLabel?.toLowerCase() ?? 'entity'}` };
	else if (inbox) link = { href: inbox, label: 'Open in the inbox' };
	return {
		title: `${dryRun ? 'Suggestion (dry run)' : 'Suggestion'}: ${s.title}`,
		description: target ?? s.workflow_name ?? undefined,
		variant: 'default',
		duration: 8000,
		link
	};
}

/** An open question its audience answers in a dialog. */
export function aiSuggestionsIsPopup(s: AiSuggestion | null | undefined): boolean {
	return (
		!!s &&
		aiSuggestionsIsSafeId(s.id) &&
		s.kind === 'info_request' &&
		s.status === 'open' &&
		s.form_schema?.popup === true
	);
}

/**
 * The popup queue after `s` changed: queued (oldest first) when it is
 * an open popup question not put off, dropped once answered, dismissed
 * or expired. Returns the same array when nothing changed.
 */
export function aiSuggestionsPopupQueue(
	queue: AiSuggestion[],
	s: AiSuggestion,
	deferred: ReadonlySet<number> = new Set()
): AiSuggestion[] {
	const idx = queue.findIndex((q) => q.id === s.id);
	if (!aiSuggestionsIsPopup(s) || deferred.has(s.id)) {
		return idx === -1 ? queue : queue.filter((q) => q.id !== s.id);
	}
	if (idx !== -1) return queue.map((q, i) => (i === idx ? { ...q, ...s } : q));
	return [...queue, s].sort((a, b) => createdAtMs(a) - createdAtMs(b) || a.id - b.id);
}

const DEFERRED_KEY = 'iris.ai-questions.later';

function readDeferred(): Set<number> {
	try {
		const raw = globalThis.sessionStorage?.getItem(DEFERRED_KEY);
		const ids = raw ? JSON.parse(raw) : [];
		return new Set(Array.isArray(ids) ? ids.filter(aiSuggestionsIsSafeId) : []);
	} catch {
		return new Set();
	}
}

function writeDeferred(ids: Set<number>): void {
	try {
		globalThis.sessionStorage?.setItem(DEFERRED_KEY, JSON.stringify([...ids]));
	} catch {
		// Storage unavailable: "Later" only lasts until the next reload
	}
}

export function aiSuggestionsOpenCount(list: AiSuggestion[] | undefined): number {
	return (list ?? []).filter((s) => s.status === 'open').length;
}

/** Reads `ai_workflows.enabled` without depending on the config type having it yet. */
export function aiSuggestionsEnabled(): boolean {
	const cfg = runtimeConfig.state as unknown as { ai_workflows?: { enabled?: unknown } } | null;
	return cfg?.ai_workflows?.enabled === true;
}

const state = $state<{
	byEntity: AiSuggestionsByEntity;
	loading: Record<string, boolean>;
	errors: Record<string, string | null>;
	popups: AiSuggestion[];
}>({ byEntity: {}, loading: {}, errors: {}, popups: [] });

let unsubscribe: (() => void) | null = null;
// One fetch per entity at a time: a panel and a header chip of the same
// entity both ask for it on mount.
const inflight = new Map<string, Promise<void>>();
let deferred: Set<number> | null = null;

function deferredIds(): Set<number> {
	deferred ??= readDeferred();
	return deferred;
}

function syncPopup(s: AiSuggestion | null | undefined): void {
	if (!s || s.id == null) return;
	state.popups = aiSuggestionsPopupQueue(state.popups, s, deferredIds());
}

function handleEvent(payload: unknown): void {
	const event = payload as AiSuggestionSocketEvent;
	state.byEntity = aiSuggestionsReduce(state.byEntity, event);
	syncPopup(event?.suggestion);
	// A popup question opens its own dialog: no toast on top
	if (event?.action === 'created' && aiSuggestionsIsPopup(event.suggestion)) return;
	const t = aiSuggestionsToast(event);
	if (t) toast(t);
}

async function fetchEntity(
	key: string,
	entityType: AiSuggestionEntityType,
	entityId: number
): Promise<void> {
	state.loading[key] = true;
	try {
		const res = await AiSuggestionsService.list({
			entity_type: entityType,
			entity_id: entityId,
			status: 'all'
		});
		if (res.ok && Array.isArray(res.data)) {
			state.byEntity = {
				...state.byEntity,
				[key]: res.data.reduce<AiSuggestion[]>((acc, s) => aiSuggestionsUpsert(acc, s), [])
			};
			state.errors[key] = null;
		} else {
			state.errors[key] = res.error?.message ?? 'Could not load suggestions';
		}
	} finally {
		state.loading[key] = false;
	}
}

export const aiSuggestions = {
	get byEntity(): AiSuggestionsByEntity {
		return state.byEntity;
	},

	list(entityType: AiSuggestionEntityType, entityId: number): AiSuggestion[] {
		return state.byEntity[aiSuggestionsKey(entityType, entityId)] ?? [];
	},

	isLoading(entityType: AiSuggestionEntityType, entityId: number): boolean {
		return state.loading[aiSuggestionsKey(entityType, entityId)] === true;
	},

	error(entityType: AiSuggestionEntityType, entityId: number): string | null {
		return state.errors[aiSuggestionsKey(entityType, entityId)] ?? null;
	},

	/** Fetches every suggestion (all statuses) of one entity. */
	load(entityType: AiSuggestionEntityType, entityId: number): Promise<void> {
		const key = aiSuggestionsKey(entityType, entityId);
		const pending = inflight.get(key);
		if (pending) return pending;
		const promise = fetchEntity(key, entityType, entityId).finally(() => inflight.delete(key));
		inflight.set(key, promise);
		return promise;
	},

	/** Merges a suggestion returned by accept / dismiss / answer. */
	apply(suggestion: AiSuggestion): void {
		state.byEntity = aiSuggestionsReduce(state.byEntity, { action: 'updated', suggestion });
		syncPopup(suggestion);
	},

	/** Open questions waiting for the current user in a dialog, oldest first. */
	get popups(): AiSuggestion[] {
		return state.popups;
	},

	/** Queues the open popup questions addressed to the current user (asked while away). */
	async loadPopups(): Promise<void> {
		const res = await AiSuggestionsService.list({ status: 'open', mine: true });
		if (!res.ok || !Array.isArray(res.data)) return;
		for (const s of res.data) syncPopup(s);
	},

	/** "Later": out of the queue for this tab's session; still on the entity and in the inbox. */
	deferPopup(id: number): void {
		deferredIds().add(id);
		writeDeferred(deferredIds());
		state.popups = state.popups.filter((s) => s.id !== id);
	},

	/** Subscribes to the socket event. Idempotent. */
	start(): void {
		if (unsubscribe) return;
		const offEvent = notifications.onSocketEvent('ai_suggestion', handleEvent);
		// A question pushed while the socket was down is lost: look again
		// once it is back, and whenever a notification comes in (pushed or
		// caught by the bell's poll), since a question comes with one.
		const offConnect = notifications.onSocketEvent(
			'connect',
			() => void aiSuggestions.loadPopups()
		);
		let unread: number | null = null;
		const offUnread = notifications.subscribe((s) => {
			if (unread !== null && s.unreadCount > unread) void aiSuggestions.loadPopups();
			unread = s.unreadCount;
		});
		unsubscribe = () => {
			offEvent();
			offConnect();
			offUnread();
		};
	},

	stop(): void {
		unsubscribe?.();
		unsubscribe = null;
	},

	/** Test hook: feed a socket payload. */
	_handle: handleEvent,

	reset(): void {
		state.byEntity = {};
		state.loading = {};
		state.errors = {};
		state.popups = [];
		deferred = null;
	}
};
