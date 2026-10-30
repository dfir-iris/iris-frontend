import type { CaseGraphState } from '../lib/graph-state.svelte';
import {
	overlaps,
	parseRange,
	replayDelay,
	replayFrame,
	replayOrder,
	stepAt,
	timeBounds,
	toIso
} from '../lib/time';

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8] as const;

/**
 * Time slider of the graph: range brushing (persisted as `graph.time`) and
 * the replay, which reveals the dated edges in `first_seen` order. Both are
 * plugged into the graph through one `registerFilter`.
 */
export class GraphTimeControl {
	readonly graph: CaseGraphState;
	/** Time bar shown under the canvas. */
	open = $state(false);
	playing = $state(false);
	speed = $state<number>(1);
	/** Replay cursor (edges revealed); null when not replaying. */
	step = $state<number | null>(null);

	bounds = $derived.by(() => timeBounds(this.graph.nodes, this.graph.edges));
	order = $derived.by(() => replayOrder(this.graph.edges));
	frame = $derived.by(() => (this.step === null ? null : replayFrame(this.order, this.step)));
	range = $derived.by(() => parseRange(this.graph.time));
	active = $derived(this.step !== null || this.range !== null);

	private timer: ReturnType<typeof setTimeout> | undefined;

	constructor(graph: CaseGraphState) {
		this.graph = graph;
	}

	/** Plug the filter into the graph; returns the unregister function. */
	register() {
		return this.graph.registerFilter('time', {
			node: (n) => {
				const frame = this.frame;
				if (frame && !frame.nodes.has(n.key)) return false;
				const range = this.range;
				return !range || overlaps(n, range);
			},
			edge: (e) => {
				const frame = this.frame;
				if (frame && !frame.edges.has(e.key)) return false;
				const range = this.range;
				return !range || overlaps(e, range);
			}
		});
	}

	setRange(from: number | null, to: number | null) {
		const b = this.bounds;
		// A handle at the bound means "open-ended".
		const f = from !== null && b && from <= b.min ? null : from;
		const t = to !== null && b && to >= b.max ? null : to;
		this.graph.time = f === null && t === null ? null : { from: toIso(f), to: toIso(t) };
		this.graph.markDirty();
	}

	clearRange() {
		this.graph.time = null;
		this.graph.markDirty();
	}

	play() {
		if (!this.order.length) return;
		if (this.step === null || this.step >= this.order.length) this.step = 0;
		this.playing = true;
		this.schedule();
	}

	pause() {
		this.playing = false;
		clearTimeout(this.timer);
	}

	toggle() {
		if (this.playing) this.pause();
		else this.play();
	}

	/** Leave the replay: every edge is shown again. */
	stop() {
		this.pause();
		this.step = null;
	}

	stepBy(delta: number) {
		this.pause();
		const n = this.order.length;
		this.step = Math.max(0, Math.min(n, (this.step ?? 0) + delta));
	}

	seek(t: number) {
		this.pause();
		this.step = stepAt(this.order, t);
	}

	setSpeed(speed: number) {
		this.speed = speed;
		if (this.playing) this.schedule();
	}

	private schedule() {
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			if (!this.playing) return;
			const next = (this.step ?? 0) + 1;
			this.step = Math.min(next, this.order.length);
			if (next >= this.order.length) {
				this.playing = false;
				return;
			}
			this.schedule();
		}, replayDelay(this.speed));
	}

	dispose() {
		this.pause();
	}
}
