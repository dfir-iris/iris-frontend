/**
 * Undo / redo stack over API operations. Each entry carries both directions
 * as async closures; ids that change when an object is recreated are kept
 * in closure-held refs by the caller.
 *
 * - `push` records an operation that has already been applied and clears
 *   the redo stack,
 * - `undo` / `redo` run one step; a failing step stays where it was so the
 *   user can retry, and the error is rethrown,
 * - only one step runs at a time (`busy`).
 */
export interface HistoryEntry {
	label: string;
	undo: () => Promise<void>;
	redo: () => Promise<void>;
}

export class OperationHistory {
	private past: HistoryEntry[] = [];
	private future: HistoryEntry[] = [];
	private running = false;

	constructor(
		private readonly limit = 100,
		private readonly onChange: () => void = () => {}
	) {}

	get canUndo() {
		return !this.running && this.past.length > 0;
	}

	get canRedo() {
		return !this.running && this.future.length > 0;
	}

	get busy() {
		return this.running;
	}

	get undoLabel(): string | null {
		return this.past.at(-1)?.label ?? null;
	}

	get redoLabel(): string | null {
		return this.future.at(-1)?.label ?? null;
	}

	push(entry: HistoryEntry) {
		this.past.push(entry);
		if (this.past.length > this.limit) this.past.splice(0, this.past.length - this.limit);
		this.future = [];
		this.onChange();
	}

	clear() {
		this.past = [];
		this.future = [];
		this.onChange();
	}

	async undo(): Promise<HistoryEntry | null> {
		return this.step(this.past, this.future, 'undo');
	}

	async redo(): Promise<HistoryEntry | null> {
		return this.step(this.future, this.past, 'redo');
	}

	private async step(
		from: HistoryEntry[],
		to: HistoryEntry[],
		direction: 'undo' | 'redo'
	): Promise<HistoryEntry | null> {
		if (this.running) return null;
		const entry = from.at(-1);
		if (!entry) return null;
		this.running = true;
		this.onChange();
		try {
			await entry[direction]();
			from.pop();
			to.push(entry);
			return entry;
		} finally {
			this.running = false;
			this.onChange();
		}
	}
}
