import { untrack } from 'svelte';
import { CaseGraphService } from '$lib/services/case-graph.service';
import { CaseNotesService } from '$lib/services/case-notes.service';
import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';
import { apiErrorMessage } from '$lib/utils/error-handler';
import type { RequestResponse } from '$lib/services/api.service';
import type { GraphGap, GraphSuggestion } from '$lib/types/resources/case-graph';
import type { Note } from '$lib/types/resources/note';
import { GraphApiError, type CaseGraphState } from '../lib/graph-state.svelte';
import {
	EXPLAIN_NOTES_DIRECTORY,
	acceptOutcome,
	aiOutcome,
	explainNoteContent,
	explainNoteTitle,
	explainRequest,
	findNotesDirectory,
	sortGaps,
	withoutSuggestions,
	type ExplainScope,
	type ListedNoteFolder
} from '../lib/insights';

const LLM_UNAVAILABLE =
	'The AI assistant is not available for this case (disabled, not configured, or restricted).';

/** The data of a response, or a GraphApiError with the API message. */
const dataOf = <T>(res: RequestResponse<T>, fallback: string): T => {
	if (!res.ok || res.data === null || typeof res.data !== 'object') {
		throw new GraphApiError(apiErrorMessage(res, fallback));
	}
	return res.data as T;
};

interface InsightsOptions {
	canEdit: () => boolean;
	viewName: () => string | null;
}

export interface Explanation {
	markdown: string;
	scope: ExplainScope;
	at: Date;
	/** Objects left out of the request (not in the default graph). */
	left: number;
	noteId: number | null;
}

/**
 * State of the intelligence panels, kept here so that switching rail tabs
 * does not lose a list or an explanation. Lists are marked stale when the
 * graph data changes and reloaded the next time their panel shows.
 */
export class GraphInsights {
	suggestions = $state.raw<GraphSuggestion[]>([]);
	suggestionsState = $state<'idle' | 'loading' | 'ready' | 'stale'>('idle');
	suggestionsError = $state<string | null>(null);
	/** Keys being accepted or dismissed. */
	busy = $state.raw<Set<string>>(new Set());

	gaps = $state.raw<GraphGap[]>([]);
	gapsState = $state<'idle' | 'loading' | 'ready' | 'stale'>('idle');
	gapsError = $state<string | null>(null);

	aiRunning = $state(false);
	aiOutcome = $state<string | null>(null);
	aiError = $state<string | null>(null);

	explainScope = $state<ExplainScope>('case');
	explaining = $state(false);
	explanation = $state.raw<Explanation | null>(null);
	explainError = $state<string | null>(null);
	savingNote = $state(false);

	/** Whether the chatbot LLM is usable (the AI and explain panels need it). */
	readonly llm = $derived(
		runtimeConfig.chatbot.enabled === true && runtimeConfig.chatbot.provider_available === true
	);

	private readonly graph: CaseGraphState;
	private readonly opts: InsightsOptions;

	constructor(graph: CaseGraphState, opts: InsightsOptions) {
		this.graph = graph;
		this.opts = opts;
	}

	private get caseId() {
		return this.graph.caseId;
	}

	/** Mark the lists stale when the graph is (re)loaded; returns the cleanup. */
	watch() {
		return $effect.root(() => {
			$effect(() => {
				void this.graph.graph;
				untrack(() => {
					if (this.suggestionsState === 'ready') this.suggestionsState = 'stale';
					if (this.gapsState === 'ready') this.gapsState = 'stale';
				});
			});
		});
	}

	// ---------------------------------------------------------------------
	// Suggestions
	// ---------------------------------------------------------------------

	async loadSuggestions() {
		this.suggestionsState = 'loading';
		try {
			const list = dataOf(
				await CaseGraphService.listSuggestions(this.caseId),
				'Could not load the suggestions.'
			);
			this.suggestions = Array.isArray(list) ? list : [];
			this.suggestionsError = null;
		} catch (e) {
			this.suggestionsError = e instanceof Error ? e.message : 'Could not load the suggestions.';
		} finally {
			this.suggestionsState = 'ready';
		}
	}

	private async withBusy<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
		this.busy = new Set([...this.busy, ...keys]);
		try {
			return await fn();
		} finally {
			const next = new Set(this.busy);
			keys.forEach((k) => next.delete(k));
			this.busy = next;
		}
	}

	/** Store the suggestions as accepted relations; the outcome message. */
	acceptSuggestions(keys: string[]) {
		return this.withBusy(keys, async () => {
			const r = dataOf(
				await CaseGraphService.acceptSuggestions(this.caseId, keys),
				'Could not accept the suggestions.'
			);
			const created = r.edges?.length ?? 0;
			const unknown = r.unknown_keys?.length ?? 0;
			this.suggestions = withoutSuggestions(this.suggestions, keys);
			await this.graph.refresh();
			// Some were no longer current: show the list as the server sees it.
			if (unknown) await this.loadSuggestions();
			return acceptOutcome(keys.length, created, unknown);
		});
	}

	dismissSuggestions(keys: string[]) {
		return this.withBusy(keys, async () => {
			dataOf(
				await CaseGraphService.dismissSuggestions(this.caseId, keys),
				'Could not dismiss the suggestions.'
			);
			this.suggestions = withoutSuggestions(this.suggestions, keys);
			return keys.length === 1 ? 'Suggestion dismissed' : `${keys.length} suggestions dismissed`;
		});
	}

	// ---------------------------------------------------------------------
	// AI proposals
	// ---------------------------------------------------------------------

	async runAi() {
		if (this.aiRunning) return;
		this.aiRunning = true;
		this.aiError = null;
		try {
			const res = await CaseGraphService.aiSuggestions(this.caseId);
			if (res.status === 409) {
				this.aiError = LLM_UNAVAILABLE;
				return;
			}
			const r = dataOf(res, 'The AI could not propose relations.');
			this.aiOutcome = aiOutcome(r);
			// The proposals are stored as pending relations: make them visible.
			if (r.edges?.length && !this.graph.showPending) this.graph.showPending = true;
			await this.graph.refresh();
		} catch (e) {
			this.aiError = e instanceof Error ? e.message : 'The AI could not propose relations.';
		} finally {
			this.aiRunning = false;
		}
	}

	// ---------------------------------------------------------------------
	// Gaps
	// ---------------------------------------------------------------------

	async loadGaps() {
		this.gapsState = 'loading';
		try {
			const list = dataOf(await CaseGraphService.gaps(this.caseId), 'Could not compute the gaps.');
			this.gaps = sortGaps(Array.isArray(list) ? list : []);
			this.gapsError = null;
		} catch (e) {
			this.gapsError = e instanceof Error ? e.message : 'Could not compute the gaps.';
		} finally {
			this.gapsState = 'ready';
		}
	}

	// ---------------------------------------------------------------------
	// Explain
	// ---------------------------------------------------------------------

	async explain(viewId: number | null) {
		if (this.explaining) return;
		const scope = this.explainScope;
		const graph = this.graph;
		const req = explainRequest(scope, {
			selection: graph.selection.flatMap((id) => {
				const fan = graph.output.fanouts.get(id);
				return fan ? fan.iocs : [id];
			}),
			canvas: graph.visibility.nodes,
			viewId
		});
		if (req.error !== undefined) {
			this.explainError = req.error;
			return;
		}
		this.explaining = true;
		this.explainError = null;
		try {
			const res = await CaseGraphService.explain(this.caseId, req.body);
			if (res.status === 409) {
				this.explainError = LLM_UNAVAILABLE;
				return;
			}
			const r = dataOf(res, 'The AI could not explain the graph.');
			this.explanation = {
				markdown: r.markdown ?? '',
				scope,
				at: new Date(),
				left: req.left,
				noteId: null
			};
		} catch (e) {
			this.explainError = e instanceof Error ? e.message : 'The AI could not explain the graph.';
		} finally {
			this.explaining = false;
		}
	}

	/** Save the explanation as a case note (in "Investigation graph"); the note id. */
	async saveExplanation(): Promise<number> {
		const ex = this.explanation;
		if (!ex) throw new GraphApiError('Nothing to save.');
		if (ex.noteId !== null) return ex.noteId;
		this.savingNote = true;
		try {
			const folders = dataOf(
				await CaseNotesService.listDirectories(this.caseId),
				'Could not list the note directories.'
			);
			const list = (Array.isArray(folders.data) ? folders.data : []) as ListedNoteFolder[];
			let dir: ListedNoteFolder | null = findNotesDirectory(list);
			if (!dir) {
				dir = dataOf(
					await CaseNotesService.createDirectory(this.caseId, { name: EXPLAIN_NOTES_DIRECTORY }),
					'Could not create the notes directory.'
				);
			}
			const note = dataOf<Note>(
				await CaseNotesService.createNote(this.caseId, {
					directory_id: dir.id,
					note_title: explainNoteTitle(ex.scope, ex.at, this.opts.viewName()),
					note_content: explainNoteContent(ex.markdown, ex.at, `/case/${this.caseId}/graph`)
				}),
				'Could not create the note.'
			);
			const noteId = note.note_id;
			this.explanation = { ...ex, noteId };
			return noteId;
		} finally {
			this.savingNote = false;
		}
	}
}
