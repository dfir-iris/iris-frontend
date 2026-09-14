/**
 * Regression tests for the Enter-key guard.
 *
 * The bug (GlitchTip iris-saas-frontend#128): a ProseMirror keymap handler
 * threw `TransformError: Inserted content deeper than insertion position` out
 * of the keydown dispatch, so Enter both did nothing and raised an uncaught
 * exception. These cover the two properties that matter: a throw is contained
 * and reported with enough context to locate it, and the guard is otherwise
 * transparent to the normal keymap chain.
 */
import { describe, expect, it, vi } from 'vitest';
import { isGuardedKey, runKeymapSafely } from '../safe-keymap';

// Minimal stand-in for the bits of EditorView the guard touches.
const makeView = (handlers: Array<(() => boolean) | (() => never)>, selection?: unknown) =>
	({
		state: {
			plugins: handlers.map((fn) => ({ props: { handleKeyDown: fn } })),
			selection: selection ?? {
				$head: {
					depth: 2,
					node: (d: number) => ({ type: { name: ['doc', 'table', 'paragraph'][d] } })
				}
			}
		}
		// The guard only reads `state.plugins` and `state.selection`.
	}) as never;

const enter = () => ({ key: 'Enter', preventDefault: vi.fn() }) as unknown as KeyboardEvent;

describe('isGuardedKey', () => {
	it('guards Enter and nothing else', () => {
		expect(isGuardedKey({ key: 'Enter' } as KeyboardEvent)).toBe(true);
		expect(isGuardedKey({ key: 'a' } as KeyboardEvent)).toBe(false);
		expect(isGuardedKey({ key: 'Backspace' } as KeyboardEvent)).toBe(false);
	});
});

describe('runKeymapSafely', () => {
	it('stops at the first handler that claims the key', () => {
		const second = vi.fn(() => true);
		const third = vi.fn(() => true);
		const onFailure = vi.fn();

		const handled = runKeymapSafely(makeView([() => false, second, third]), enter(), onFailure);

		expect(handled).toBe(true);
		expect(second).toHaveBeenCalledOnce();
		// Short-circuit matters: running a later handler after one has already
		// dispatched would apply the key twice.
		expect(third).not.toHaveBeenCalled();
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('reports no handling when the whole chain declines', () => {
		// ProseMirror then falls through to its own pass and, failing that,
		// the browser's native behaviour — which is what we want for a key no
		// command claims.
		const onFailure = vi.fn();

		expect(runKeymapSafely(makeView([() => false, () => false]), enter(), onFailure)).toBe(false);
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('contains a throwing handler instead of letting it escape', () => {
		const onFailure = vi.fn();
		const boom = new Error('Inserted content deeper than insertion position');
		const event = enter();

		const handled = runKeymapSafely(
			makeView([
				() => false,
				() => {
					throw boom;
				}
			]),
			event,
			onFailure
		);

		// Swallowed, not rethrown: the transaction never dispatched, so the
		// document is intact and the only correct outcome is "the key did
		// nothing". Letting the browser insert a raw newline behind
		// ProseMirror's back would desync the view from the document.
		expect(handled).toBe(true);
		expect(event.preventDefault).toHaveBeenCalledOnce();
		expect(onFailure).toHaveBeenCalledOnce();
		expect(onFailure.mock.calls[0][0].error).toBe(boom);
	});

	it('describes the selection so a minified report is still locatable', () => {
		// Minified frames alone made #128 unattributable; the node path is the
		// part that makes the next occurrence reproducible.
		const onFailure = vi.fn();

		runKeymapSafely(
			makeView([
				() => {
					throw new Error('boom');
				}
			]),
			enter(),
			onFailure
		);

		expect(onFailure.mock.calls[0][0]).toMatchObject({
			depth: 2,
			path: ['doc', 'table', 'paragraph']
		});
	});

	it('still reports when the selection itself cannot be read', () => {
		// A transform failure can leave `$head` unresolvable. Losing the
		// context is acceptable; losing the report is not.
		const onFailure = vi.fn();
		const view = makeView(
			[
				() => {
					throw new Error('boom');
				}
			],
			{
				get $head(): never {
					throw new Error('unresolvable');
				}
			}
		);

		expect(runKeymapSafely(view, enter(), onFailure)).toBe(true);
		expect(onFailure.mock.calls[0][0]).toMatchObject({ depth: -1, path: [] });
	});
});
