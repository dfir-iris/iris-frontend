import { mount, unmount } from 'svelte';
import type { SuggestionOptions } from '@tiptap/suggestion';
import MentionList, { type MentionItem } from './MentionList.svelte';

/**
 * Mount the Svelte MentionList as a floating popup positioned relative to
 * the current `@` trigger range. Returns an updatable, destroyable handle
 * matching the shape tiptap's Suggestion plugin expects from `render()`.
 */
const createPopup = (
	initialItems: MentionItem[],
	initialIndex: number,
	onSelect: (item: MentionItem) => void,
	getClientRect: () => DOMRect | null
) => {
	const el = document.createElement('div');
	el.style.position = 'absolute';
	el.style.zIndex = '50';
	document.body.appendChild(el);

	const props = $state({
		items: initialItems,
		selectedIndex: initialIndex,
		onSelect
	});

	const component = mount(MentionList, { target: el, props });

	const reposition = () => {
		const rect = getClientRect();
		if (!rect) return;
		el.style.top = `${rect.bottom + window.scrollY + 4}px`;
		el.style.left = `${rect.left + window.scrollX}px`;
	};

	reposition();

	return {
		update: (items: MentionItem[], selectedIndex: number) => {
			props.items = items;
			props.selectedIndex = selectedIndex;
			reposition();
		},
		destroy: () => {
			unmount(component);
			el.remove();
		}
	};
};

export type MentionSuggestionDeps = {
	nodeName: string;
	fetchItems: (query: string) => MentionItem[] | Promise<MentionItem[]>;
};

/**
 * Build the suggestion config for a given mention type (e.g. users `@`,
 * assets `#`). The fetchItems callback is invoked on every keystroke with
 * the current query (without the trigger char). `nodeName` tells the
 * `command` step which ProseMirror node type to insert — must match the
 * name passed to createMentionNode().
 */
export const buildSuggestion = (
	char: string,
	deps: MentionSuggestionDeps
): Omit<SuggestionOptions<MentionItem>, 'editor'> => {
	let popup: ReturnType<typeof createPopup> | null = null;
	let items: MentionItem[] = [];
	let selectedIndex = 0;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let commandRef: ((item: any) => void) | null = null;

	return {
		char,
		items: async ({ query }) => {
			items = await deps.fetchItems(query);
			selectedIndex = 0;
			return items;
		},
		command: ({ editor, range, props }) => {
			editor
				.chain()
				.focus()
				.insertContentAt(range, [
					{
						type: deps.nodeName,
						attrs: {
							id: String(props.id),
							label: props.label,
							kind: props.kind
						}
					},
					{ type: 'text', text: ' ' }
				])
				.run();
		},
		render: () => ({
			onStart: (props) => {
				items = props.items;
				selectedIndex = 0;
				commandRef = props.command;
				popup = createPopup(
					items,
					selectedIndex,
					(item) => commandRef?.(item),
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					() => (props.clientRect ? (props.clientRect() as DOMRect | null) : null)
				);
			},
			onUpdate: (props) => {
				items = props.items;
				commandRef = props.command;
				if (selectedIndex >= items.length) selectedIndex = 0;
				popup?.update(items, selectedIndex);
			},
			onKeyDown: (props) => {
				if (props.event.key === 'ArrowUp') {
					selectedIndex = (selectedIndex + items.length - 1) % Math.max(items.length, 1);
					popup?.update(items, selectedIndex);
					return true;
				}
				if (props.event.key === 'ArrowDown') {
					selectedIndex = (selectedIndex + 1) % Math.max(items.length, 1);
					popup?.update(items, selectedIndex);
					return true;
				}
				if (props.event.key === 'Enter' || props.event.key === 'Tab') {
					const item = items[selectedIndex];
					if (item && commandRef) commandRef(item);
					return true;
				}
				if (props.event.key === 'Escape') {
					popup?.destroy();
					popup = null;
					return true;
				}
				return false;
			},
			onExit: () => {
				popup?.destroy();
				popup = null;
				commandRef = null;
			}
		})
	};
};
