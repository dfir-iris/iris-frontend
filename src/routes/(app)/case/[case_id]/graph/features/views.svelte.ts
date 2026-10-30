import { exportPng } from '$lib/components/common/CytoscapeGraph';
import { CaseGraphService } from '$lib/services/case-graph.service';
import type {
	CreateGraphViewBody,
	GraphView,
	GraphViewState,
	GraphViewSummary,
	UpdateGraphViewBody
} from '$lib/types/resources/case-graph';
import { unwrap, type CaseGraphState } from '../lib/graph-state.svelte';
import {
	compactState,
	fitSnapshot,
	groupViews,
	stateFingerprint,
	stateSize,
	VIEW_STATE_MAX,
	viewPermissions
} from '../lib/saved-views';

const CURRENT_KEY = (caseId: number) => `iris:case-graph:${caseId}:view`;
/** Time for the canvas to apply a state (elements, positions) before reading it back. */
const SETTLE_MS = 600;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Saved views of the case graph: list (own + shared), load, save / save as,
 * rename, share, delete, report default (with a PNG snapshot), and the
 * "modified since loaded" indicator.
 */
export class GraphViewsControl {
	readonly graph: CaseGraphState;
	private readonly userId: () => number | null;
	private readonly canEdit: () => boolean;

	views = $state.raw<GraphViewSummary[]>([]);
	loading = $state(false);
	busy = $state(false);
	error = $state<string | null>(null);
	/** View the canvas was loaded from (or last saved to). */
	current = $state.raw<GraphViewSummary | null>(null);
	private baseline = $state<string | null>(null);

	grouped = $derived.by(() => groupViews(this.views, this.userId()));
	reportDefault = $derived(this.views.find((v) => v.is_report_default) ?? null);

	dirty = $derived.by(() => {
		void this.graph.stateVersion;
		if (!this.current || this.baseline === null) return false;
		return this.fingerprint(this.graph.toViewState()) !== this.baseline;
	});

	constructor(
		graph: CaseGraphState,
		opts: { userId: () => number | null; canEdit: () => boolean }
	) {
		this.graph = graph;
		this.userId = opts.userId;
		this.canEdit = opts.canEdit;
	}

	permissions(view: Pick<GraphViewSummary, 'owner_id' | 'is_shared'>) {
		return viewPermissions(view, this.userId(), this.canEdit());
	}

	/** Fetch the list and restore the "current view" remembered for the case. */
	async init() {
		await this.refreshList();
		const id = Number(readStorage(CURRENT_KEY(this.graph.caseId)));
		const view = this.views.find((v) => v.view_id === id);
		if (view) {
			this.current = view;
			// The autosaved canvas may differ from the view: compare once drawn.
			await wait(SETTLE_MS);
			this.baseline = this.fingerprint(view.state);
		}
	}

	async refreshList() {
		this.loading = true;
		try {
			const views = unwrap(
				await CaseGraphService.listViews(this.graph.caseId),
				'Could not list the saved views.'
			);
			this.views = Array.isArray(views) ? views : [];
			this.error = null;
			if (this.current) {
				const fresh = this.views.find((v) => v.view_id === this.current?.view_id) ?? null;
				this.setCurrent(fresh, false);
			}
		} catch (e) {
			this.error = e instanceof Error ? e.message : 'Could not list the saved views.';
		} finally {
			this.loading = false;
		}
	}

	private drawn(): Set<string> | undefined {
		const drawn = new Set<string>();
		this.graph.cy?.nodes().forEach((n) => {
			drawn.add(n.id());
		});
		return drawn.size ? drawn : undefined;
	}

	/** Comparable form of a state, positions limited to what is drawn. */
	private fingerprint(state: GraphViewState) {
		return stateFingerprint(compactState(state, this.drawn()));
	}

	/** Current canvas as a view state, positions limited to the drawn nodes. */
	captureState(): GraphViewState {
		const compact = compactState(this.graph.toViewState(), this.drawn());
		if (stateSize(compact) > VIEW_STATE_MAX) {
			throw new Error('This view is too large to be saved (over 1 MB).');
		}
		return compact;
	}

	/** PNG of the whole graph under the 4 MB limit; throws when it cannot fit. */
	snapshot(): string {
		const cy = this.graph.cy;
		if (!cy) throw new Error('The canvas is not ready.');
		const background = this.graph.isDark ? '#0a0a0a' : '#ffffff';
		const png = fitSnapshot(({ scale, maxWidth }) =>
			exportPng(cy, { background, scale, maxWidth })
		);
		if (!png) throw new Error('The graph picture is larger than 4 MB, even scaled down.');
		return png;
	}

	async load(view: GraphViewSummary) {
		this.busy = true;
		try {
			await this.graph.applyViewState(view.state, { reload: true });
			this.setCurrent(view);
			await wait(SETTLE_MS);
			this.markClean();
		} finally {
			this.busy = false;
		}
	}

	/** Overwrite the current view with the canvas (snapshot refreshed if report default). */
	async save() {
		const view = this.current;
		if (!view) throw new Error('No view loaded.');
		const body: UpdateGraphViewBody = { state: this.captureState() };
		if (view.is_report_default) body.snapshot = this.snapshot();
		await this.update(view, body);
		this.markClean();
	}

	async saveAs(input: { name: string; description?: string | null; is_shared?: boolean }) {
		const body: CreateGraphViewBody = {
			name: input.name.trim(),
			description: input.description?.trim() || null,
			is_shared: !!input.is_shared,
			state: this.captureState()
		};
		const created = await this.run(async () =>
			unwrap(await CaseGraphService.createView(this.graph.caseId, body), 'Could not save the view.')
		);
		this.upsert(created);
		this.setCurrent(created);
		this.markClean();
		return created;
	}

	rename(view: GraphViewSummary, name: string, description: string | null) {
		return this.update(view, { name: name.trim(), description: description?.trim() || null });
	}

	toggleShare(view: GraphViewSummary) {
		return this.update(view, { is_shared: !view.is_shared });
	}

	/**
	 * Make a view the picture of the case report. The view is loaded first so
	 * the snapshot shows it; a private view of the caller gets shared.
	 */
	async setReportDefault(view: GraphViewSummary, on: boolean) {
		if (!on) return this.update(view, { is_report_default: false });
		if (this.current?.view_id !== view.view_id || this.dirty) await this.load(view);
		const body: UpdateGraphViewBody = { is_report_default: true, snapshot: this.snapshot() };
		if (!view.is_shared) body.is_shared = true;
		const updated = await this.update(view, body);
		// Only one report default per case: the backend cleared the others.
		this.views = this.views.map((v) =>
			v.view_id === updated.view_id ? v : { ...v, is_report_default: false }
		);
		return updated;
	}

	async remove(view: GraphViewSummary) {
		await this.run(async () =>
			unwrap(
				await CaseGraphService.deleteView(this.graph.caseId, view.view_id),
				'Could not delete the view.'
			)
		);
		this.views = this.views.filter((v) => v.view_id !== view.view_id);
		if (this.current?.view_id === view.view_id) this.setCurrent(null);
	}

	/** Forget the loaded view (the canvas stays as is). */
	detach() {
		this.setCurrent(null);
	}

	private async update(view: GraphViewSummary, body: UpdateGraphViewBody): Promise<GraphView> {
		const updated = await this.run(async () =>
			unwrap(
				await CaseGraphService.updateView(this.graph.caseId, view.view_id, body),
				'Could not update the view.'
			)
		);
		this.upsert(updated);
		if (this.current?.view_id === updated.view_id) this.setCurrent(updated, false);
		return updated;
	}

	private async run<T>(fn: () => Promise<T>): Promise<T> {
		this.busy = true;
		try {
			return await fn();
		} finally {
			this.busy = false;
		}
	}

	private upsert(view: GraphView) {
		const { snapshot: _snapshot, ...summary } = view;
		const i = this.views.findIndex((v) => v.view_id === view.view_id);
		this.views =
			i === -1
				? [...this.views, summary]
				: this.views.map((v) => (v.view_id === view.view_id ? summary : v));
	}

	private markClean() {
		this.baseline = this.fingerprint(this.graph.toViewState());
	}

	private setCurrent(view: GraphViewSummary | null, resetBaseline = true) {
		this.current = view;
		if (resetBaseline && !view) this.baseline = null;
		writeStorage(CURRENT_KEY(this.graph.caseId), view ? String(view.view_id) : null);
	}
}

const readStorage = (key: string) => {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
	} catch {
		return null;
	}
};

const writeStorage = (key: string, value: string | null) => {
	try {
		if (typeof localStorage === 'undefined') return;
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
	} catch {
		// Best effort.
	}
};
