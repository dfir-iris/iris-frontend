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

import { describe, expect, it } from 'vitest';
import {
	MENTION_CHIP_BASE_CLASSES,
	MENTION_KIND_STYLE,
	MENTION_KINDS,
	isMentionKind,
	mentionKindStyle,
	mentionTriggerChar,
	type MentionKind
} from '../mention-kinds';
import { mentionKindIcon } from '../mention-icons';

describe('mention kind table', () => {
	it('covers every kind the backend and editor can emit', () => {
		// Hard-coded rather than derived from the table so that adding a
		// kind is a deliberate edit here too — this list is the contract
		// `iris_engine/collab/mentions.py::MENTION_KINDS` mirrors.
		expect([...MENTION_KINDS].sort()).toEqual([
			'alert',
			'asset',
			'datastore',
			'ioc',
			'note',
			'task',
			'team',
			'user'
		]);
	});

	it('gives every kind a distinct colour and a non-empty icon path', () => {
		const chipClasses = new Set<string>();
		for (const kind of MENTION_KINDS) {
			const style = MENTION_KIND_STYLE[kind];
			expect(style.chipClass, kind).toBeTruthy();
			expect(style.popoverBgClass, kind).toBeTruthy();
			expect(style.popoverFgClass, kind).toBeTruthy();
			// Path data has to start with a moveto or the browser drops the
			// whole `d` silently and the chip renders glyph-less.
			expect(style.iconPath, kind).toMatch(/^M/);
			chipClasses.add(style.chipClass);
		}
		expect(chipClasses.size).toBe(MENTION_KINDS.length);
	});

	it('styles the alert kind orange, matching the escalate/merge chip', () => {
		expect(MENTION_KIND_STYLE.alert.chipClass).toBe(
			'bg-orange-500/15 text-orange-700 dark:text-orange-300'
		);
	});

	it('resolves a known kind and falls back to user for anything else', () => {
		expect(mentionKindStyle('alert')).toBe(MENTION_KIND_STYLE.alert);
		// `data-kind` is untrusted input: it survives a markdown round-trip
		// and may come from a newer backend or a hand-edited document.
		expect(mentionKindStyle('sighting')).toBe(MENTION_KIND_STYLE.user);
		expect(mentionKindStyle(null)).toBe(MENTION_KIND_STYLE.user);
		expect(mentionKindStyle(undefined)).toBe(MENTION_KIND_STYLE.user);
	});

	it('does not treat inherited Object properties as kinds', () => {
		expect(isMentionKind('toString')).toBe(false);
		expect(isMentionKind('constructor')).toBe(false);
		expect(mentionKindStyle('__proto__')).toBe(MENTION_KIND_STYLE.user);
	});

	it('maps people to @ and case objects to #', () => {
		expect(mentionTriggerChar('user')).toBe('@');
		expect(mentionTriggerChar('team')).toBe('@');
		for (const kind of MENTION_KINDS.filter((k) => k !== 'user' && k !== 'team')) {
			expect(mentionTriggerChar(kind), kind).toBe('#');
		}
	});

	it('carries the marker classes every chip consumer keys off', () => {
		// ChipHoverHost and the editor both find chips via `.mention-chip`;
		// losing it from the base list would silently kill every popover.
		expect(MENTION_CHIP_BASE_CLASSES).toContain('mention-chip');
		expect(MENTION_CHIP_BASE_CLASSES).toContain('mention-chip-clickable');
	});
});

describe('mention kind icons', () => {
	it('stays key-for-key aligned with the colour table', () => {
		const icons = new Set(MENTION_KINDS.map((kind) => mentionKindIcon(kind)));
		// Eight kinds, eight distinct glyphs — a missing entry would fall
		// back to the user icon and collapse the set.
		expect(icons.size).toBe(MENTION_KINDS.length);
	});

	it('falls back to the user glyph for an unknown kind', () => {
		expect(mentionKindIcon('sighting')).toBe(mentionKindIcon('user'));
	});

	it('resolves a component for a kind read off an attribute', () => {
		const fromAttribute: string = 'alert';
		expect(mentionKindIcon(fromAttribute)).toBe(mentionKindIcon('alert' as MentionKind));
	});
});
