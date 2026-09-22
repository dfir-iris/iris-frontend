/*
 *  IRIS Source Code
 *  Copyright (C) 2026 - DFIR-IRIS
 *  contact@dfir-iris.org
 *
 *  This program is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Lesser General Public
 *  License as published by the Free Software Foundation; either
 *  version 3 of the License, or (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program; if not, write to the Free Software Foundation,
 *  Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

/**
 * Cross-repo contract test.
 *
 * `build_mention_span` in iris-backend
 * (`source/app/iris_engine/collab/mentions.py`) writes a class-less chip
 * span into `cases.description` on escalate/merge. Getting that to render
 * takes three independent pieces agreeing: showdown must pass the raw span
 * through, DOMPurify must keep `data-*` on it, and `decorateMentionChips`
 * must recognise and style it.
 *
 * Each piece is exercised elsewhere, but nothing covered them *together*,
 * which is exactly where a regression would hide — a stricter DOMPurify
 * config or a showdown option flip would silently put raw markup back in
 * front of the analyst, which is the bug this whole feature exists to fix.
 *
 * The `CHIP` constants below are byte-for-byte what the backend emits. If
 * `build_mention_span` changes shape, this test must change with it.
 */

import { describe, expect, it } from 'vitest';
import DOMPurify from 'dompurify';
import { converter } from '../converter';
import { decorateMentionChips } from '../decorate-mention-chips';
import { normalizeLegacyContent } from '../legacy-content';

/** `build_mention_span('alert', <id>, 'Alert #<id>')`. */
const chipFor = (id: number) =>
	`<span data-mention data-kind="alert" data-id="${id}" data-label="Alert #${id}">#Alert #${id}</span>`;

/** The full preview pipeline `MarkDownPreview.svelte` runs. */
const render = (md: string): HTMLElement => {
	const html = DOMPurify.sanitize(converter.makeHtml(normalizeLegacyContent(md)));
	const el = document.createElement('div');
	el.innerHTML = html;
	decorateMentionChips(el);
	return el;
};

describe('backend-written chips survive the preview pipeline', () => {
	it('renders the escalate-to-new-case block as a styled alert chip', () => {
		const chip = render(`### IRIS alert link\n\n${chipFor(106)}\n`).querySelector(
			'span[data-mention]'
		);

		expect(chip).not.toBeNull();
		expect(chip?.classList.contains('mention-chip')).toBe(true);
		// The orange of MENTION_KIND_STYLE.alert, i.e. the sweep resolved the
		// kind rather than falling back to `user` blue.
		expect(chip?.className).toContain('bg-orange-500/15');
		expect(chip?.querySelector('svg')).not.toBeNull();
		// The `#` trigger char is dropped — the glyph replaces it.
		expect(chip?.textContent).toBe('Alert #106');
	});

	it('renders the merge block as a chip beside the escalating user', () => {
		const el = render(`\n\n${chipFor(106)} *escalated by Bob*\n\n`);

		expect(el.querySelector('span[data-mention]')?.classList.contains('mention-chip')).toBe(true);
		// The chip sits outside the italics on purpose (a mention is an atomic
		// node); assert the emphasis still closes around the text alone.
		expect(el.querySelector('em')?.textContent).toBe('escalated by Bob');
	});

	it('renders one chip per alert for a batch escalation', () => {
		const chips = [106, 107, 108].map(chipFor).join(' ');
		const el = render(`### IRIS alert links\n\n${chips}\n`);

		expect(el.querySelectorAll('span[data-mention].mention-chip')).toHaveLength(3);
		expect([...el.querySelectorAll('.mention-chip-label')].map((n) => n.textContent)).toEqual([
			'Alert #106',
			'Alert #107',
			'Alert #108'
		]);
	});

	it('keeps the data attributes ChipHoverHost dispatches on', () => {
		const chip = render(chipFor(106)).querySelector<HTMLElement>('span[data-mention]');

		expect(chip?.getAttribute('data-kind')).toBe('alert');
		expect(chip?.getAttribute('data-id')).toBe('106');
		expect(chip?.getAttribute('role')).toBe('button');
	});
});
