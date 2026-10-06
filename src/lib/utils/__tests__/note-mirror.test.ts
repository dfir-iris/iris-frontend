import { describe, it, expect } from 'vitest';
import {
	collectLockedFolderIds,
	firstUnlockedFolder,
	isLockedNoteFolder,
	isMirroredNote,
	localCopyTitle,
	mirrorSourceUrl
} from '../note-mirror';
import type { NoteFolder } from '$lib/types/resources/note';

const folder = (id: number, overrides: Partial<NoteFolder> = {}): NoteFolder => ({
	id,
	name: `Folder ${id}`,
	subdirectories: [],
	notes: [],
	...overrides
});

describe('isMirroredNote()', () => {
	it('is false for null / plain notes', () => {
		expect(isMirroredNote(null)).toBe(false);
		expect(isMirroredNote(undefined)).toBe(false);
		expect(isMirroredNote({ note_id: 1, note_title: 'x' })).toBe(false);
		expect(isMirroredNote({ note_id: 1, mirror: null, mirror_source_note_id: null })).toBe(false);
	});

	it('is true when the computed mirror object is present', () => {
		expect(
			isMirroredNote({
				note_id: 1,
				mirror: { war_room_id: 2, war_room_name: 'WR', source_note_id: 3, read_only: true }
			})
		).toBe(true);
	});

	it('is true when only mirror_source_note_id is set', () => {
		expect(isMirroredNote({ note_id: 1, mirror_source_note_id: 3 })).toBe(true);
	});
});

describe('isLockedNoteFolder()', () => {
	it('detects mirror_war_room_id', () => {
		expect(isLockedNoteFolder(folder(1))).toBe(false);
		expect(isLockedNoteFolder(folder(1, { mirror_war_room_id: null }))).toBe(false);
		expect(isLockedNoteFolder(folder(1, { mirror_war_room_id: 7 }))).toBe(true);
		expect(isLockedNoteFolder(null)).toBe(false);
	});
});

describe('localCopyTitle()', () => {
	it('appends (copy)', () => {
		expect(localCopyTitle('IOC sweep')).toBe('IOC sweep (copy)');
	});

	it('trims and falls back for empty titles', () => {
		expect(localCopyTitle('  Plan  ')).toBe('Plan (copy)');
		expect(localCopyTitle('')).toBe('Untitled note (copy)');
		expect(localCopyTitle(null)).toBe('Untitled note (copy)');
	});
});

describe('firstUnlockedFolder()', () => {
	it('skips locked top-level folders', () => {
		const tree = [folder(1, { mirror_war_room_id: 9 }), folder(2), folder(3)];
		expect(firstUnlockedFolder(tree)?.id).toBe(2);
	});

	it('returns undefined when every folder is locked or none exist', () => {
		expect(firstUnlockedFolder([])).toBeUndefined();
		expect(firstUnlockedFolder([folder(1, { mirror_war_room_id: 9 })])).toBeUndefined();
	});
});

describe('collectLockedFolderIds()', () => {
	it('includes locked folders and everything nested under them', () => {
		const tree = [
			folder(1, {
				subdirectories: [folder(2, { mirror_war_room_id: 9, subdirectories: [folder(3)] })]
			}),
			folder(4, { mirror_war_room_id: 8, subdirectories: [folder(5)] }),
			folder(6)
		];
		expect([...collectLockedFolderIds(tree)].sort()).toEqual([2, 3, 4, 5]);
	});

	it('is empty for a tree without mirrors', () => {
		expect(collectLockedFolderIds([folder(1, { subdirectories: [folder(2)] })]).size).toBe(0);
	});
});

describe('mirrorSourceUrl()', () => {
	it('links to the war-room source note from the mirror object', () => {
		expect(
			mirrorSourceUrl({
				mirror: { war_room_id: 2, war_room_name: 'WR', source_note_id: 3, read_only: true }
			})
		).toBe('/war-rooms/2/notes/3');
	});

	it('falls back to the mirror_* columns', () => {
		expect(mirrorSourceUrl({ mirror_war_room_id: 2, mirror_source_note_id: 3 })).toBe(
			'/war-rooms/2/notes/3'
		);
	});

	it('links to the notes tab when the source note id is unknown', () => {
		expect(mirrorSourceUrl({ mirror_war_room_id: 2 })).toBe('/war-rooms/2/notes');
	});

	it('returns null without a war room', () => {
		expect(mirrorSourceUrl(null)).toBeNull();
		expect(mirrorSourceUrl({ mirror_source_note_id: 3 })).toBeNull();
	});
});
