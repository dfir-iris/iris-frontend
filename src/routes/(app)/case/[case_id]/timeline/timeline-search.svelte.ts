/**
 * State of the timeline search view.
 *
 * One search is three requests run side by side over the same scope —
 * the first page of events, the histogram and the field summaries — and
 * every later page is a keyset continuation of the first. A search that
 * is overtaken by a newer one (the analyst kept typing, dragged another
 * window on the histogram) is dropped on arrival rather than painted
 * over the newer results: each run takes a generation number and only
 * the latest one may write.
 *
 * Results are held in `$state.raw` and replaced, never mutated in place:
 * a scroll-loaded search can reach thousands of rows, and deep proxies
 * over every one of them would cost more than the rows themselves.
 */
import {
	CaseTimelineService,
	type CaseTimelineFieldSummary,
	type CaseTimelineHistogram,
	type CaseTimelineSearchEvent,
	type CaseTimelineSearchScope,
	type CaseTimelineSummaryField
} from '$lib/services/case-timeline.service';
import { alertSearchQueryError, type AlertSearchQueryError } from '$lib/services/alerts.service';
import { ALL_TIME, resolveTimeRange, type TimeRange } from './search-helpers';

const PAGE_SIZE = 200;
// The largest page the backend serves; exports read as few as they can.
const EXPORT_PAGE_SIZE = 1000;

type Status = 'idle' | 'loading' | 'loading_more' | 'error';

export class TimelineSearch {
	query = $state('');
	range = $state<TimeRange>(ALL_TIME);
	order = $state<'asc' | 'desc'>('asc');
	/** Timelines picked in the sidebar; empty means every event of the case. */
	timelineIds = $state<number[]>([]);

	events = $state.raw<CaseTimelineSearchEvent[]>([]);
	/** Matching events in scope, known once the first page is in. */
	total = $state<number | null>(null);
	nextCursor = $state<string | null>(null);
	status = $state<Status>('idle');
	error = $state<string | null>(null);
	/** A refused expression, with the offset the bar underlines. */
	searchError = $state<AlertSearchQueryError | null>(null);

	histogram = $state.raw<CaseTimelineHistogram | null>(null);
	fields = $state.raw<Partial<Record<CaseTimelineSummaryField, CaseTimelineFieldSummary>>>({});

	selected = $state.raw<Set<number>>(new Set());

	#generation = 0;
	// The scope the loaded pages belong to, so "load more" continues the
	// same search even when a preset's clock has moved on since.
	#scope: CaseTimelineSearchScope = {};

	readonly #getCaseId: () => number | null;

	constructor(getCaseId: () => number | null) {
		this.#getCaseId = getCaseId;
	}

	get hasMore(): boolean {
		return this.nextCursor !== null;
	}

	scope(): CaseTimelineSearchScope {
		return {
			query: this.query,
			...resolveTimeRange(this.range),
			timeline_ids: this.timelineIds
		};
	}

	/** Run the search from the first page, with the histogram and field summaries. */
	async run(): Promise<void> {
		const caseId = this.#getCaseId();
		if (caseId === null) return;

		const generation = ++this.#generation;
		const scope = this.scope();
		this.#scope = scope;
		this.status = 'loading';
		this.error = null;

		const [page, histogram, fields] = await Promise.all([
			CaseTimelineService.searchEvents(caseId, scope, { order: this.order, limit: PAGE_SIZE }),
			CaseTimelineService.eventsHistogram(caseId, scope),
			CaseTimelineService.eventsFields(caseId, scope)
		]);

		if (generation !== this.#generation) return;

		if (!page.ok || !page.data || typeof page.data === 'string') {
			this.searchError = alertSearchQueryError(page);
			this.error = this.searchError?.message ?? page.error?.message ?? 'Search failed';
			this.status = 'error';
			this.events = [];
			this.total = null;
			this.nextCursor = null;
			this.histogram = null;
			this.fields = {};
			return;
		}

		this.searchError = null;
		this.events = page.data.events;
		this.total = page.data.total;
		this.nextCursor = page.data.next_cursor;
		this.histogram =
			histogram.ok && histogram.data && typeof histogram.data !== 'string' ? histogram.data : null;
		this.fields =
			fields.ok && fields.data && typeof fields.data !== 'string' ? fields.data.fields : {};
		this.status = 'idle';

		// Rows that left the results leave the selection too; acting on
		// events the analyst can no longer see would be a surprise.
		if (this.selected.size) {
			const visible = new Set(this.events.map((e) => e.event_id));
			this.selected = new Set([...this.selected].filter((id) => visible.has(id)));
		}
	}

	/** Append the next keyset page. */
	async loadMore(): Promise<void> {
		const caseId = this.#getCaseId();
		if (caseId === null || this.nextCursor === null) return;
		if (this.status !== 'idle') return;

		const generation = this.#generation;
		this.status = 'loading_more';

		const page = await CaseTimelineService.searchEvents(caseId, this.#scope, {
			order: this.order,
			cursor: this.nextCursor,
			limit: PAGE_SIZE
		});

		if (generation !== this.#generation) return;

		if (!page.ok || !page.data || typeof page.data === 'string') {
			this.error = page.error?.message ?? 'Could not load more events';
			this.status = 'idle';
			this.nextCursor = null;
			return;
		}

		this.events = [...this.events, ...page.data.events];
		this.nextCursor = page.data.next_cursor;
		this.status = 'idle';
	}

	/**
	 * The events of the loaded search with their whole text, in the order
	 * shown: the first `count` of them, or every match when `count` is
	 * null. Null when a page could not be read.
	 */
	async exportEvents(count: number | null = null): Promise<CaseTimelineSearchEvent[] | null> {
		const caseId = this.#getCaseId();
		if (caseId === null) return null;

		const events: CaseTimelineSearchEvent[] = [];
		let cursor: string | null = null;
		do {
			const remaining = count === null ? EXPORT_PAGE_SIZE : count - events.length;
			const page = await CaseTimelineService.searchEvents(caseId, this.#scope, {
				order: this.order,
				cursor,
				limit: Math.min(EXPORT_PAGE_SIZE, Math.max(1, remaining)),
				full: true
			});
			if (!page.ok || !page.data || typeof page.data === 'string') return null;
			events.push(...page.data.events);
			cursor = page.data.next_cursor;
		} while (cursor !== null && (count === null || events.length < count));

		return count === null ? events : events.slice(0, count);
	}

	/** Rewrite rows in place after a change that cannot move them in or out of the results. */
	patchEvents(ids: Iterable<number>, patch: Partial<CaseTimelineSearchEvent>): void {
		const targets = new Set(ids);
		this.events = this.events.map((event) =>
			targets.has(event.event_id) ? { ...event, ...patch } : event
		);
	}

	toggleSelected(eventId: number): void {
		const next = new Set(this.selected);
		if (next.has(eventId)) next.delete(eventId);
		else next.add(eventId);
		this.selected = next;
	}

	/** Select every loaded row, or clear the selection when they all are. */
	toggleSelectAll(): void {
		const all = this.events.length > 0 && this.events.every((e) => this.selected.has(e.event_id));
		this.selected = all ? new Set() : new Set(this.events.map((e) => e.event_id));
	}

	clearSelection(): void {
		this.selected = new Set();
	}
}
