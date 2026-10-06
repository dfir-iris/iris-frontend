import { describe, expect, it } from 'vitest';
import { clipboardFiles, insertAtCaret, pastedFileName } from '../composer-attachments.svelte';

const fakeClipboard = (types: string[], files: File[]): DataTransfer =>
	({
		types,
		items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f }))
	}) as unknown as DataTransfer;

describe('clipboardFiles', () => {
	it('returns a pasted screenshot under a stamped name', () => {
		const shot = new File(['x'], 'image.png', { type: 'image/png' });
		const out = clipboardFiles(fakeClipboard(['Files'], [shot]));
		expect(out).toHaveLength(1);
		expect(out[0].name).toMatch(/^pasted-image-\d{8}-\d{6}\.png$/);
		expect(out[0].type).toBe('image/png');
	});

	it('keeps the name of a copied file', () => {
		const f = new File(['x'], 'evidence.jpg', { type: 'image/jpeg' });
		expect(clipboardFiles(fakeClipboard(['Files'], [f]))[0].name).toBe('evidence.jpg');
	});

	it('lets text win when the clipboard also carries plain text', () => {
		const shot = new File(['x'], 'image.png', { type: 'image/png' });
		expect(clipboardFiles(fakeClipboard(['text/plain', 'Files'], [shot]))).toEqual([]);
	});

	it('ignores clipboards without files', () => {
		expect(clipboardFiles(fakeClipboard(['text/html'], []))).toEqual([]);
		expect(clipboardFiles(null)).toEqual([]);
	});
});

describe('pastedFileName', () => {
	it('derives the extension from the mime type', () => {
		const f = new File(['x'], '', { type: 'image/jpeg' });
		expect(pastedFileName(f, new Date(2026, 9, 5, 8, 4, 2))).toBe(
			'pasted-image-20261005-080402.jpeg'
		);
	});
});

describe('insertAtCaret', () => {
	it('inserts at the caret', () => {
		expect(insertAtCaret('hello world', '👍', 5, 5)).toEqual({ next: 'hello👍 world', caret: 7 });
	});

	it('replaces the selection', () => {
		expect(insertAtCaret('hello world', '🔥', 6, 11)).toEqual({ next: 'hello 🔥', caret: 8 });
	});

	it('appends when there is no caret', () => {
		expect(insertAtCaret('hi', '!', null, null)).toEqual({ next: 'hi!', caret: 3 });
	});
});
