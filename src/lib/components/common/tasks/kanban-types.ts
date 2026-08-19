/**
 * Shared shapes for <TaskKanbanBoard>.
 *
 * Kept in a plain module rather than exported from the component: the
 * board is declared with `generics="T"`, and svelte2tsx wraps such a
 * component in a generic function, so types declared in its instance
 * script are not visible to importers.
 */

/** One board column. */
export interface KanbanColumn {
	/**
	 * `null` is the "no status" column. War-room tasks may legitimately
	 * have no status; case tasks always have one, so those boards never
	 * pass a null column.
	 */
	id: number | null;
	title: string;
	/** `TaskStatus.status_bscolor` — drives the header dot only. */
	bscolor?: string | null;
}
