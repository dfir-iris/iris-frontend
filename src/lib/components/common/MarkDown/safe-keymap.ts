/**
 * Enter-key guard for the collaborative markdown editor.
 *
 * The bug (GlitchTip iris-saas-frontend#128): pressing Enter in a note threw
 * `TransformError: Inserted content deeper than insertion position` out of
 * ProseMirror's keydown dispatch. The chain is
 *
 *   keydown → baseKeymap Enter → splitBlock → Transform.split → Transform.step
 *
 * and `Transform.step` throws when the `ReplaceStep` it built cannot apply —
 * here, when `splitBlock` computed a split deeper than the resolved position
 * allows. That happens on a document whose structure doesn't match what the
 * schema would have produced, which in a Yjs-backed editor is reachable
 * without anyone writing invalid content: y-prosemirror merges concurrent
 * structural edits (one peer wraps a block while another types inside it) by
 * CRDT rules, not schema rules, and applies the result without revalidating.
 *
 * Two things follow, and they shape the fix:
 *
 *  1. **The document is not corrupted.** The throw happens while *building*
 *     the transaction, so nothing was ever dispatched. The observable damage
 *     is that Enter silently does nothing and an exception escapes into
 *     `window.onerror`.
 *  2. **The throw cannot be caught where it is raised.** ProseMirror collects
 *     `handleKeyDown` from the view props first and the plugin keymaps after,
 *     so an `editorProps.handleKeyDown` that returns `false` has already given
 *     up control by the time the keymap runs. To wrap the keymap in a
 *     `try`/`catch` we have to run it ourselves.
 *
 * So `runKeymapSafely` walks the plugin chain the way ProseMirror would, in
 * plugin order, and reports + swallows a throw instead of letting it escape.
 *
 * Note on double dispatch: when no plugin handles the key we return `false`
 * and ProseMirror walks the same chain again. That is safe — keymap handlers
 * are ProseMirror commands, which only dispatch a transaction on the path
 * where they return `true`, so a handler that returned `false` to us did
 * nothing and will do nothing again. Returning `true` instead would suppress
 * the native browser behaviour for keys no command claims, which is worse.
 */

import type { EditorView } from '@tiptap/pm/view';

/** Keys routed through the guard. Everything else takes ProseMirror's path. */
const GUARDED_KEYS = new Set(['Enter']);

export type KeymapFailure = {
	error: unknown;
	/** Resolved depth of the selection head when the transform failed. */
	depth: number;
	/** Node type names from the doc down to the selection head, outermost first. */
	path: string[];
};

export const isGuardedKey = (event: KeyboardEvent): boolean => GUARDED_KEYS.has(event.key);

/**
 * Describe where the caret sat when a transform failed. Minified stack frames
 * make issue #128 unattributable on their own; this is what turns the next
 * occurrence into something reproducible.
 */
const describeSelection = (view: EditorView): { depth: number; path: string[] } => {
	try {
		const $head = view.state.selection.$head;
		const path: string[] = [];
		for (let d = 0; d <= $head.depth; d += 1) path.push($head.node(d).type.name);
		return { depth: $head.depth, path };
	} catch {
		return { depth: -1, path: [] };
	}
};

/**
 * Run the plugin keymap chain for `event`, catching a throw from any handler.
 *
 * Returns `true` when a handler claimed the key (or when one threw and we
 * swallowed it), `false` when none did and ProseMirror should carry on.
 */
export const runKeymapSafely = (
	view: EditorView,
	event: KeyboardEvent,
	onFailure: (failure: KeymapFailure) => void
): boolean => {
	try {
		for (const plugin of view.state.plugins) {
			const handler = plugin.props?.handleKeyDown;
			if (handler?.call(plugin, view, event)) return true;
		}
		return false;
	} catch (error) {
		// Capture the selection *before* anything else touches the view — the
		// failed transaction never dispatched, so this still describes the
		// state the user was actually editing.
		const { depth, path } = describeSelection(view);
		onFailure({ error, depth, path });
		// Swallow the key. The split was never going to apply; letting the
		// browser insert a raw newline into the contenteditable behind
		// ProseMirror's back would desync the view from the document.
		event.preventDefault();
		return true;
	}
};
