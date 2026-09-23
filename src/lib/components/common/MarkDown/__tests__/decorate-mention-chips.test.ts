import { beforeEach, describe, expect, it } from 'vitest';
import { decorateMentionChips } from '../decorate-mention-chips';
import { MENTION_KIND_STYLE } from '../mention-kinds';

const render = (html: string): HTMLElement => {
	const container = document.createElement('div');
	container.innerHTML = html;
	return container;
};

describe('decorateMentionChips', () => {
	beforeEach(() => {
		document.body.replaceChildren();
	});

	it('styles a bare backend-written alert chip', () => {
		// Exactly what `build_mention_span` appends to a case description on
		// escalate / merge: data attributes, no classes.
		const container = render(
			'<p>Escalated from <span data-mention data-kind="alert" data-id="106" ' +
				'data-label="Alert #106">#Alert #106</span>.</p>'
		);

		decorateMentionChips(container);

		const chip = container.querySelector('span[data-mention]') as HTMLElement;
		expect(chip.classList.contains('mention-chip')).toBe(true);
		expect(chip.classList.contains('mention-chip-clickable')).toBe(true);
		expect(chip.classList.contains('bg-orange-500/15')).toBe(true);
		expect(chip.getAttribute('role')).toBe('button');
		expect(chip.getAttribute('tabindex')).toBe('0');
		expect(chip.getAttribute('title')).toBe('Alert #106');
	});

	it('replaces the text body with an icon and a label span', () => {
		const container = render(
			'<span data-mention data-kind="alert" data-id="106" data-label="Alert #106">#Alert #106</span>'
		);

		decorateMentionChips(container);

		const chip = container.querySelector('span[data-mention]') as HTMLElement;
		const svg = chip.querySelector('svg');
		expect(svg?.getAttribute('class')).toBe('mention-chip-icon');
		expect(svg?.querySelector('path')?.getAttribute('d')).toBe(MENTION_KIND_STYLE.alert.iconPath);

		const label = chip.querySelector('.mention-chip-label');
		expect(label?.textContent).toBe('Alert #106');
		// The trigger char lives in the raw text body only; once there's a
		// glyph in front of the label it would read as "#Alert #106".
		expect(chip.textContent).toBe('Alert #106');
	});

	it('leaves an editor-authored chip untouched', () => {
		// tiptap bakes the classes in, so the sweep must not re-enter and
		// blow away the nodes ProseMirror is tracking.
		const container = render(
			'<span data-mention data-kind="note" data-id="7" data-label="Runbook" ' +
				'class="mention-chip mention-chip-clickable bg-emerald-500/15">' +
				'<svg class="mention-chip-icon"></svg><span class="mention-chip-label">Runbook</span></span>'
		);
		const before = container.innerHTML;

		decorateMentionChips(container);

		expect(container.innerHTML).toBe(before);
	});

	it('is idempotent across re-renders', () => {
		const container = render(
			'<span data-mention data-kind="task" data-id="3" data-label="Triage">#Triage</span>'
		);

		decorateMentionChips(container);
		const afterFirst = container.innerHTML;
		decorateMentionChips(container);

		expect(container.innerHTML).toBe(afterFirst);
	});

	it('decorates every kind in one pass', () => {
		const container = render(
			'<span data-mention data-kind="asset" data-id="1" data-label="DC01">#DC01</span>' +
				'<span data-mention data-kind="user" data-id="2" data-label="Jane">@Jane</span>' +
				'<span data-mention data-kind="alert" data-id="3" data-label="Alert #3">#Alert #3</span>'
		);

		decorateMentionChips(container);

		const chips = [...container.querySelectorAll<HTMLElement>('span[data-mention]')];
		expect(chips).toHaveLength(3);
		expect(chips.map((c) => c.classList.contains('mention-chip'))).toEqual([true, true, true]);
		expect(chips[0].classList.contains('bg-amber-500/15')).toBe(true);
		expect(chips[1].classList.contains('bg-blue-500/15')).toBe(true);
		expect(chips[2].classList.contains('bg-orange-500/15')).toBe(true);
	});

	it('falls back to the user style for an unknown kind', () => {
		const container = render(
			'<span data-mention data-kind="sighting" data-id="9" data-label="Odd">#Odd</span>'
		);

		decorateMentionChips(container);

		const chip = container.querySelector('span[data-mention]') as HTMLElement;
		expect(chip.classList.contains('bg-blue-500/15')).toBe(true);
		expect(chip.querySelector('.mention-chip-label')?.textContent).toBe('Odd');
	});

	it('falls back to the text body when data-label is missing', () => {
		// Chips written before `data-label` existed, and the shape
		// `mention-node.ts`'s parseHTML already compensates for.
		const container = render('<span data-mention data-kind="ioc" data-id="4">#evil.com</span>');

		decorateMentionChips(container);

		const chip = container.querySelector('span[data-mention]') as HTMLElement;
		expect(chip.querySelector('.mention-chip-label')?.textContent).toBe('evil.com');
	});

	it('renders a label containing markup as text, never as nodes', () => {
		const container = render(
			'<span data-mention data-kind="alert" data-id="5" ' +
				'data-label="&lt;img src=x onerror=alert(1)&gt;">#x</span>'
		);

		decorateMentionChips(container);

		const chip = container.querySelector('span[data-mention]') as HTMLElement;
		expect(chip.querySelector('img')).toBeNull();
		expect(chip.querySelector('.mention-chip-label')?.textContent).toBe(
			'<img src=x onerror=alert(1)>'
		);
	});

	it('keeps an existing title rather than overwriting it', () => {
		const container = render(
			'<span data-mention data-kind="alert" data-id="6" data-label="Alert #6" ' +
				'title="Suspicious PowerShell">#Alert #6</span>'
		);

		decorateMentionChips(container);

		const chip = container.querySelector('span[data-mention]') as HTMLElement;
		expect(chip.getAttribute('title')).toBe('Suspicious PowerShell');
	});

	it('tolerates a null container', () => {
		expect(() => decorateMentionChips(null)).not.toThrow();
		expect(() => decorateMentionChips(undefined)).not.toThrow();
	});
});
