/**
 * File attachments queued on a chat composer (main stream + thread pane).
 *
 * Files dropped on — or pasted into — the composer are held client-side
 * as `PendingAttachment` entries and only uploaded to the war-room
 * datastore when the operator hits Send. This avoids orphan files if
 * they abandon the draft (per the "no orphans" UX decision).
 */

export type PendingAttachment = {
	id: string;
	file: File;
	/** Object URL for an inline thumbnail; set for `image/*` only. */
	previewUrl: string | null;
};

export const humanBytes = (n: number): string => {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

const pad = (n: number) => `${n}`.padStart(2, '0');

/**
 * Screenshots land on the clipboard as a nameless `image.png`; every
 * paste would then show up in the datastore under the same name. Stamp
 * them so the datastore listing stays readable.
 */
export const pastedFileName = (file: File, now: Date = new Date()): string => {
	const ext = (file.type.split('/')[1] ?? 'png').replace(/[^a-z0-9]/gi, '') || 'png';
	const stamp =
		`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
		`-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	return `pasted-image-${stamp}.${ext}`;
};

/**
 * Files carried by a paste event, or `[]` when the paste should be left
 * to the browser. When the clipboard also holds plain text (a spreadsheet
 * selection, a Word paragraph — both ship an image rendering alongside
 * the text) the text wins: the operator meant to paste words.
 */
export const clipboardFiles = (data: DataTransfer | null): File[] => {
	if (!data) return [];
	const types = Array.from(data.types ?? []);
	if (types.includes('text/plain')) return [];
	const files: File[] = [];
	for (const item of Array.from(data.items ?? [])) {
		if (item.kind !== 'file') continue;
		const f = item.getAsFile();
		if (!f) continue;
		// Clipboard images come in with a generic name (or none at all).
		const generic = !f.name || /^image\.\w+$/i.test(f.name);
		files.push(
			f.type.startsWith('image/') && generic
				? new File([f], pastedFileName(f), { type: f.type, lastModified: Date.now() })
				: f
		);
	}
	return files;
};

let _seq = 0;

export class ComposerAttachments {
	pending = $state<PendingAttachment[]>([]);
	isDropTarget = $state(false);

	queue = (files: FileList | File[] | null) => {
		if (!files) return;
		const additions: PendingAttachment[] = Array.from(files as ArrayLike<File>).map((f) => ({
			id: `${f.name}-${f.size}-${++_seq}`,
			file: f,
			previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : null
		}));
		if (additions.length) this.pending = [...this.pending, ...additions];
	};

	remove = (id: string) => {
		const gone = this.pending.find((p) => p.id === id);
		if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
		this.pending = this.pending.filter((p) => p.id !== id);
	};

	clear = () => {
		for (const p of this.pending) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
		this.pending = [];
	};

	onDragOver = (e: DragEvent) => {
		if (!e.dataTransfer) return;
		const types = e.dataTransfer.types;
		if (!types || !Array.from(types).includes('Files')) return;
		e.preventDefault();
		this.isDropTarget = true;
		e.dataTransfer.dropEffect = 'copy';
	};

	onDragLeave = (e: DragEvent) => {
		// A `dragleave` fires when the pointer crosses a child boundary;
		// guard by checking the related target is outside the form.
		if (!e.currentTarget || !(e.currentTarget instanceof HTMLElement)) return;
		if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
		this.isDropTarget = false;
	};

	onDrop = (e: DragEvent) => {
		if (!e.dataTransfer) return;
		e.preventDefault();
		this.isDropTarget = false;
		if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
			this.queue(e.dataTransfer.files);
		}
	};

	onPaste = (e: ClipboardEvent) => {
		const files = clipboardFiles(e.clipboardData);
		if (files.length === 0) return;
		e.preventDefault();
		this.queue(files);
	};

	/**
	 * Upload every queued file in sequence — sequential rather than
	 * parallel so a per-file failure clearly identifies the culprit and
	 * we can abort without leaving half the batch half-uploaded.
	 *
	 * Returns the datastore `file_id`s, or `{ failed }` naming the first
	 * file that didn't make it.
	 */
	upload = async (warRoomId: number): Promise<{ ids: number[] } | { failed: File }> => {
		const ids: number[] = [];
		if (this.pending.length === 0) return { ids };
		const { WarRoomDatastoreService } = await import('$lib/services/war-room-datastore.service');
		for (const item of this.pending) {
			const up = await WarRoomDatastoreService.upload(warRoomId, item.file);
			const fileId =
				up.ok && up.data && typeof up.data !== 'string'
					? (up.data as { file_id?: number }).file_id
					: undefined;
			if (typeof fileId !== 'number') return { failed: item.file };
			ids.push(fileId);
		}
		return { ids };
	};
}

/**
 * Splice `text` into a textarea's value at the caret (replacing any
 * selection). Returns the new value and where the caret should land.
 */
export const insertAtCaret = (
	value: string,
	text: string,
	selectionStart: number | null | undefined,
	selectionEnd: number | null | undefined
): { next: string; caret: number } => {
	const start = selectionStart ?? value.length;
	const end = selectionEnd ?? start;
	return { next: `${value.slice(0, start)}${text}${value.slice(end)}`, caret: start + text.length };
};
