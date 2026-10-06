export type ContextMenuSource = 'note' | 'folder';

export interface ContextMenu {
	open: boolean;
	x: number;
	y: number;
	name?: string;
	source?: ContextMenuSource;
	noteId?: number;
	folderId?: number;
	/** Target is a war-room mirror (or inside a locked mirror folder). */
	locked?: boolean;
}
