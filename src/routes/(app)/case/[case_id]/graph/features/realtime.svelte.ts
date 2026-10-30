import { tick, untrack } from 'svelte';
import { browser } from '$app/environment';
import { notifications } from '$lib/stores/notifications.store';
import { UsersService } from '$lib/services/users.service';
import type { CaseGraphJoinAck } from '$lib/types/resources/case-graph';
import type { CaseGraphState } from '../lib/graph-state.svelte';
import {
	CASE_GRAPH_CHANGED,
	CASE_GRAPH_JOIN,
	CASE_GRAPH_LEAVE,
	CASE_GRAPH_PRESENCE,
	PRESENCE_HEARTBEAT_MS,
	REFETCH_DEBOUNCE_MS,
	UPDATED_BY_MS,
	addChange,
	batchTouchesGraph,
	batchTouchesViews,
	describeUpdate,
	parseGraphChange,
	parseGraphPresence,
	peerName,
	presenceApply,
	presenceByKey,
	presenceExpire,
	presenceKeyOf,
	presenceList,
	type ChangeBatch,
	type GraphPeers
} from '../lib/realtime';

interface LiveOptions {
	userId: () => number | null;
	/** Saved views changed elsewhere. */
	onViewsChanged: () => unknown;
}

/** Delay before a selection change is announced (box selections fire in bursts). */
const ANNOUNCE_DELAY_MS = 150;

/**
 * The live side of the graph page: follows the case graph room, refetches
 * (debounced, keeping the positions and the selection) when someone else
 * changes the graph, and shares which object each analyst looks at.
 */
export class GraphLiveControl {
	peers = $state<GraphPeers>({});
	readonly list = $derived(presenceList(this.peers));
	readonly byKey = $derived(presenceByKey(this.peers));
	/** Subtle "updated by X" indicator. */
	updated = $state<{ text: string; at: number } | null>(null);
	joined = $state(false);

	private readonly graph: CaseGraphState;
	private readonly opts: LiveOptions;
	private offs: (() => void)[] = [];
	private batch: ChangeBatch | null = null;
	private flushTimer: ReturnType<typeof setTimeout> | undefined;
	private updatedTimer: ReturnType<typeof setTimeout> | undefined;
	private announceTimer: ReturnType<typeof setTimeout> | undefined;
	private heartbeat: ReturnType<typeof setInterval> | undefined;
	private sentKey: string | null | undefined = undefined;
	private names = new Map<number, string>();
	private directory: Promise<void> | null = null;

	constructor(graph: CaseGraphState, opts: LiveOptions) {
		this.graph = graph;
		this.opts = opts;
	}

	private get caseId() {
		return this.graph.caseId;
	}

	/** Start following the room; returns the cleanup. */
	start() {
		if (!browser || this.offs.length) return () => {};
		const payload = { case_id: this.caseId };
		this.offs.push(
			notifications.onSocketEvent(CASE_GRAPH_CHANGED, (raw) => this.onChange(raw)),
			notifications.onSocketEvent(CASE_GRAPH_PRESENCE, (raw) => this.onPresence(raw)),
			notifications.watchRoom(CASE_GRAPH_JOIN, CASE_GRAPH_LEAVE, payload, (ack) => {
				this.joined = !!(ack as CaseGraphJoinAck | null)?.ok;
				// A (re)join: tell the room where we are.
				if (this.joined) this.announce(true);
			}),
			$effect.root(() => {
				$effect(() => {
					const key = this.currentKey();
					untrack(() => this.scheduleAnnounce(key));
				});
			})
		);
		this.heartbeat = setInterval(() => {
			this.announce(true);
			this.peers = presenceExpire(this.peers, Date.now());
		}, PRESENCE_HEARTBEAT_MS);
		const onVisible = () => {
			if (!document.hidden && this.batch) this.scheduleFlush(0);
		};
		document.addEventListener('visibilitychange', onVisible);
		this.offs.push(() => document.removeEventListener('visibilitychange', onVisible));
		return () => this.stop();
	}

	stop() {
		// No leave broadcast exists: clear our marker before leaving the room.
		if (this.joined && this.sentKey) {
			notifications.emit(CASE_GRAPH_PRESENCE, { case_id: this.caseId, selected_key: null });
		}
		// Unsubscribing emits the leave.
		for (const off of this.offs.splice(0)) off();
		clearTimeout(this.flushTimer);
		clearTimeout(this.updatedTimer);
		clearTimeout(this.announceTimer);
		clearInterval(this.heartbeat);
		this.batch = null;
		this.joined = false;
		this.sentKey = undefined;
		this.peers = {};
		this.updated = null;
	}

	dismissUpdated() {
		clearTimeout(this.updatedTimer);
		this.updated = null;
	}

	// ---------------------------------------------------------------------
	// Changes
	// ---------------------------------------------------------------------

	private onChange(raw: unknown) {
		const change = parseGraphChange(raw, this.caseId);
		if (!change) return;
		this.batch = addChange(this.batch, change);
		this.scheduleFlush(REFETCH_DEBOUNCE_MS);
	}

	private scheduleFlush(delay: number) {
		clearTimeout(this.flushTimer);
		this.flushTimer = setTimeout(() => void this.flush(), delay);
	}

	private async flush() {
		const batch = this.batch;
		// A background tab catches up when it is shown again.
		if (!batch || document.hidden) return;
		this.batch = null;
		if (batchTouchesGraph(batch) && this.graph.graph) await this.refetch();
		if (batchTouchesViews(batch)) {
			try {
				await this.opts.onViewsChanged();
			} catch {
				// The views menu shows its own error.
			}
		}
		const selfId = this.opts.userId();
		const authors = batch.users.filter((u): u is number => u !== null && u !== selfId);
		await this.resolveNames(authors);
		const text = describeUpdate(batch, selfId, (id) => this.names.get(id) ?? null);
		if (!text) return;
		this.updated = { text, at: Date.now() };
		clearTimeout(this.updatedTimer);
		this.updatedTimer = setTimeout(() => (this.updated = null), UPDATED_BY_MS);
	}

	/** Re-read the graph; the canvas diff keeps the positions, we keep the selection. */
	private async refetch() {
		const graph = this.graph;
		const before = untrack(() => graph.selection);
		await graph.refresh();
		await tick();
		const cy = graph.cy;
		if (cy) {
			const still = before.filter((id) => cy.getElementById(id).nonempty());
			const selected = new Set(cy.$(':selected').map((e) => e.id()));
			if (still.length !== selected.size || still.some((id) => !selected.has(id))) {
				graph.select(still);
			}
			if (still.length !== before.length) graph.selection = still;
		}
		// Close the details of an object someone else deleted.
		const rail = graph.rail;
		if (rail?.type === 'node' && !graph.node(rail.key)) graph.rail = null;
		else if (rail?.type === 'edge' && !graph.edge(rail.key)) graph.rail = null;
	}

	/** Names of the authors: from the presence first, else the user directory (once). */
	private async resolveNames(ids: number[]) {
		for (const p of Object.values(this.peers)) this.names.set(p.user.id, peerName(p.user));
		if (!ids.some((id) => !this.names.has(id))) return;
		this.directory ??= (async () => {
			try {
				const res = await UsersService.listMentionable('');
				const rows = res.ok && res.data && typeof res.data === 'object' ? res.data.data : [];
				for (const u of rows ?? []) {
					if (!this.names.has(u.user_id)) this.names.set(u.user_id, u.user_name || u.user_login);
				}
			} catch {
				// "Updated by another analyst" then.
			}
		})();
		await this.directory;
	}

	// ---------------------------------------------------------------------
	// Presence
	// ---------------------------------------------------------------------

	private currentKey() {
		const graph = this.graph;
		return presenceKeyOf(
			graph.selection,
			(id) => !!graph.node(id),
			(id) => !!graph.edge(id)
		);
	}

	private scheduleAnnounce(key: string | null) {
		if (key === this.sentKey) return;
		clearTimeout(this.announceTimer);
		this.announceTimer = setTimeout(() => this.announce(false), ANNOUNCE_DELAY_MS);
	}

	private announce(force: boolean) {
		if (!this.joined) return;
		const key = untrack(() => this.currentKey());
		if (!force && key === this.sentKey) return;
		const sent = notifications.emit(CASE_GRAPH_PRESENCE, {
			case_id: this.caseId,
			selected_key: key
		});
		if (sent) this.sentKey = key;
	}

	private onPresence(raw: unknown) {
		const p = parseGraphPresence(raw, this.caseId, this.opts.userId());
		if (!p) return;
		const isNew = !this.peers[p.user.id];
		this.peers = presenceApply(this.peers, p, Date.now());
		this.names.set(p.user.id, peerName(p.user));
		// No "hello" exists: answer a newcomer so it sees us without waiting.
		if (isNew) this.announce(true);
	}
}
