export type ContextMenuSource = 'note' | 'folder';

export interface ContextMenu {
	open: boolean;
	x: number;
	y: number;
	source?: ContextMenuSource;
	noteId?: number;
	folderId?: number;
}
