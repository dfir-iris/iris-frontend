export type GraphShortcutAction =
	| 'fit'
	| 'search'
	| 'delete'
	| 'clear'
	| 'hide'
	| 'pin'
	| 'expand'
	| 'undo'
	| 'redo'
	| 'select-all'
	| 'help';

export interface GraphShortcut {
	action: GraphShortcutAction;
	keys: string[];
	description: string;
}

/** Shown in the help popover, in this order. */
export const GRAPH_SHORTCUTS: GraphShortcut[] = [
	{ action: 'fit', keys: ['F'], description: 'Fit the graph to the screen' },
	{ action: 'search', keys: ['/'], description: 'Search (Enter / Shift+Enter cycle the hits)' },
	{ action: 'delete', keys: ['Del'], description: 'Delete the selected relations / free nodes' },
	{ action: 'clear', keys: ['Esc'], description: 'Clear selection, focus, path and menus' },
	{ action: 'hide', keys: ['H'], description: 'Hide the selection' },
	{ action: 'pin', keys: ['P'], description: 'Pin / unpin the selection' },
	{ action: 'expand', keys: ['E'], description: 'Expand the neighbours of the selection' },
	{ action: 'undo', keys: ['Ctrl', 'Z'], description: 'Undo' },
	{ action: 'redo', keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo (also Ctrl+Y)' },
	{ action: 'select-all', keys: ['Ctrl', 'A'], description: 'Select every node' },
	{ action: 'help', keys: ['?'], description: 'Show this help' }
];

export interface ShortcutEventLike {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
	target?: EventTarget | null;
}

/** True when the keystroke belongs to a text field and must not drive the graph. */
export const isTypingTarget = (target: EventTarget | null | undefined): boolean => {
	if (!target || typeof (target as HTMLElement).tagName !== 'string') return false;
	const el = target as HTMLElement;
	const tag = el.tagName.toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
	return el.isContentEditable === true || el.getAttribute?.('contenteditable') === 'true';
};

/** Keyboard event → graph action, or null when the key is not a shortcut. */
export const shortcutAction = (e: ShortcutEventLike): GraphShortcutAction | null => {
	const mod = !!(e.ctrlKey || e.metaKey);
	const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
	if (mod) {
		// Text fields keep their native undo / select-all.
		if (e.altKey || isTypingTarget(e.target)) return null;
		if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
		if (key === 'y') return 'redo';
		if (key === 'a') return 'select-all';
		return null;
	}
	if (e.altKey) return null;
	if (key === 'Escape') return 'clear';
	if (isTypingTarget(e.target)) return null;
	switch (key) {
		case 'f':
			return 'fit';
		case '/':
			return 'search';
		case 'Delete':
		case 'Backspace':
			return 'delete';
		case 'h':
			return 'hide';
		case 'p':
			return 'pin';
		case 'e':
			return 'expand';
		case '?':
			return 'help';
		default:
			return null;
	}
};
