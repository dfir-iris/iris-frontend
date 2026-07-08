/**
 * War-room notes tree context.
 *
 * Mirror of `case-notes.context.svelte.ts` — the two systems have
 * intentionally divergent domain types (`WarRoomNote` vs `Note`,
 * `folder_id` vs `directory_id`, war-room ACL vs case ACL) so we
 * duplicate the context rather than share it. Same public API shape
 * so the tree UI components on both sides read identically once
 * their imports are pointed at the right context.
 */
import { WarRoomNotesService } from '$lib/services/war-room-notes.service';
import type {
	CreateWarRoomNoteBody,
	CreateWarRoomNoteFolderBody,
	UpdateWarRoomNoteBody,
	UpdateWarRoomNoteFolderBody,
	WarRoomNote,
	WarRoomNoteFolder
} from '$lib/services/war-room-notes.service';
import type { ApiOptions } from '$lib/services/api.service';

export const WAR_ROOM_NOTES_CTX = Symbol('war-room-notes');

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedNoteId?: number;
	selectedFolderId?: number;
	showAddNoteModal: boolean;
	showAddFolderModal: boolean;
};

/**
 * Hydrated folder — the flat REST payload is normalised into this
 * nested shape client-side by walking `parent_id` links. Matches the
 * case-notes `NoteFolder` shape so the tree components need no
 * per-system branching.
 */
export interface WarRoomNoteFolderTreeNode {
	id: number;
	name: string;
	war_room_id: number;
	parent_id: number | null;
	note_count?: number;
	subfolders: WarRoomNoteFolderTreeNode[];
	notes: WarRoomNote[];
}

const getNoteId = (note: WarRoomNote): number => note.note_id;
const getFolderId = (folder: WarRoomNoteFolder): number => folder.id;

/**
 * Build the folder tree from a flat REST payload. Notes are grouped
 * by `folder_id`; folders are linked into their parent's `subfolders`
 * list. Any folder whose parent is not present in the payload is
 * treated as a root (mirrors the case-notes normalizer).
 */
const buildFoldersTree = (
	rawFolders: WarRoomNoteFolder[],
	notes: WarRoomNote[]
): WarRoomNoteFolderTreeNode[] => {
	const nodeById = new Map<number, WarRoomNoteFolderTreeNode>();

	for (const folder of rawFolders) {
		nodeById.set(folder.id, {
			id: folder.id,
			name: folder.name,
			war_room_id: folder.war_room_id,
			parent_id: folder.parent_id,
			subfolders: [],
			notes: []
		});
	}

	const notesByFolder = new Map<number | null, WarRoomNote[]>();
	for (const note of notes) {
		const key = note.folder_id ?? null;
		const bucket = notesByFolder.get(key);
		if (bucket) bucket.push(note);
		else notesByFolder.set(key, [note]);
	}

	for (const [folderId, notesInFolder] of notesByFolder) {
		if (folderId === null) continue; // root notes handled separately
		const node = nodeById.get(folderId);
		if (node) node.notes = notesInFolder;
	}

	const roots: WarRoomNoteFolderTreeNode[] = [];

	for (const folder of rawFolders) {
		const node = nodeById.get(folder.id);
		if (!node) continue;

		if (folder.parent_id != null && nodeById.has(folder.parent_id)) {
			nodeById.get(folder.parent_id)!.subfolders.push(node);
		} else {
			roots.push(node);
		}
	}

	// Root-level notes get a synthetic pseudo-folder so the tree UI
	// can render them without special-casing. Case notes required
	// every note to belong to a directory, but war-room notes allow
	// root-level notes (`folder_id` nullable) — the pseudo-folder
	// preserves that affordance.
	const rootNotes = notesByFolder.get(null) ?? [];
	if (rootNotes.length > 0 || rawFolders.length === 0) {
		roots.unshift({
			id: 0,
			name: '',
			war_room_id: rawFolders[0]?.war_room_id ?? 0,
			parent_id: null,
			subfolders: [],
			notes: rootNotes
		});
	}

	return roots;
};

const collectFolders = (
	folders: WarRoomNoteFolderTreeNode[],
	byId: Record<number, WarRoomNoteFolderTreeNode>,
	orderedIds: number[]
) => {
	for (const folder of folders) {
		// Skip the synthetic root-notes pseudo-folder (id === 0)
		if (folder.id !== 0) {
			byId[folder.id] = folder;
			if (!orderedIds.includes(folder.id)) orderedIds.push(folder.id);
		}
		if (folder.subfolders.length > 0) {
			collectFolders(folder.subfolders, byId, orderedIds);
		}
	}
};

const collectNotes = (
	folders: WarRoomNoteFolderTreeNode[],
	byId: Record<number, WarRoomNote>,
	orderedIds: number[]
) => {
	for (const folder of folders) {
		for (const note of folder.notes) {
			const id = getNoteId(note);
			byId[id] = note;
			if (!orderedIds.includes(id)) orderedIds.push(id);
		}
		if (folder.subfolders.length > 0) {
			collectNotes(folder.subfolders, byId, orderedIds);
		}
	}
};

export const createWarRoomNotesContext = (getWarRoomId: () => number | null) => {
	const byId = $state<Record<number, WarRoomNote>>({});
	const foldersById = $state<Record<number, WarRoomNoteFolderTreeNode>>({});

	const list = $state<{
		tree: WarRoomNoteFolderTreeNode[];
		noteIds: number[];
		folderIds: number[];
		searchTerm: string;
		status: Status;
		error: string | null;
	}>({
		tree: [],
		noteIds: [],
		folderIds: [],
		searchTerm: '',
		status: 'idle',
		error: null
	});

	const ui = $state<UIState>({
		selectedNoteId: undefined,
		selectedFolderId: undefined,
		showAddNoteModal: false,
		showAddFolderModal: false
	});

	const currentWarRoomId = $derived(() => getWarRoomId());

	const currentNote = $derived(() =>
		ui.selectedNoteId !== undefined ? byId[ui.selectedNoteId] : undefined
	);

	const folders = $derived(() =>
		list.folderIds
			.map((id) => foldersById[id])
			.filter((folder): folder is WarRoomNoteFolderTreeNode => !!folder)
	);

	const notes = $derived(() =>
		list.noteIds.map((id) => byId[id]).filter((note): note is WarRoomNote => !!note)
	);

	/** Replace the in-memory note reference inside the cached tree. */
	const updateNoteInTree = (note: WarRoomNote) => {
		const id = getNoteId(note);
		const visit = (folders: WarRoomNoteFolderTreeNode[]): boolean => {
			for (const folder of folders) {
				for (let i = 0; i < folder.notes.length; i++) {
					if (getNoteId(folder.notes[i]) === id) {
						folder.notes[i] = note;
						return true;
					}
				}
				if (folder.subfolders.length > 0 && visit(folder.subfolders)) return true;
			}
			return false;
		};
		visit(list.tree);
	};

	const replaceTreeState = (tree: WarRoomNoteFolderTreeNode[]) => {
		for (const k of Object.keys(foldersById)) delete foldersById[Number(k)];
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		const folderIds: number[] = [];
		const noteIds: number[] = [];

		collectFolders(tree, foldersById, folderIds);
		collectNotes(tree, byId, noteIds);

		list.tree = tree;
		list.folderIds = folderIds;
		list.noteIds = noteIds;
	};

	const loadTree = async (options: ApiOptions = {}) => {
		const warRoomId = getWarRoomId();

		if (warRoomId === null) {
			list.status = 'error';
			list.error = 'Missing war room id';
			return;
		}

		list.status = 'loading';
		list.error = null;

		const [foldersRes, notesRes] = await Promise.all([
			WarRoomNotesService.listFolders(warRoomId, options),
			WarRoomNotesService.list(warRoomId, options)
		]);

		if (
			!foldersRes.ok ||
			foldersRes.error ||
			foldersRes.data === null ||
			typeof foldersRes.data === 'string'
		) {
			list.status = 'error';
			list.error = foldersRes.error?.message ?? 'Failed to load note folders';
			return;
		}

		if (
			!notesRes.ok ||
			notesRes.error ||
			notesRes.data === null ||
			typeof notesRes.data === 'string'
		) {
			list.status = 'error';
			list.error = notesRes.error?.message ?? 'Failed to load notes';
			return;
		}

		const tree = buildFoldersTree(foldersRes.data, notesRes.data);
		replaceTreeState(tree);
		list.status = 'idle';
	};

	const refresh = async (options: ApiOptions = {}) => {
		await loadTree(options);
	};

	const getNote = async (
		id: number,
		options: ApiOptions = {}
	): Promise<WarRoomNote | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;

		const res = await WarRoomNotesService.get(warRoomId, id, options);
		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const note = res.data;
			byId[getNoteId(note)] = note;
			if (!list.noteIds.includes(id)) list.noteIds = [id, ...list.noteIds];
			return note;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const ensureSelectedLoaded = async (options: ApiOptions = {}): Promise<WarRoomNote | null> => {
		const id = ui.selectedNoteId;
		if (id) {
			if (byId[id]?.content != null) return byId[id];
			return await getNote(id, options);
		}
		return null;
	};

	const createNote = async (
		body: CreateWarRoomNoteBody,
		options: ApiOptions = {}
	): Promise<WarRoomNote | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;

		const res = await WarRoomNotesService.create(warRoomId, body, options);
		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const note = res.data;
			byId[getNoteId(note)] = note;
			ui.selectedNoteId = getNoteId(note);
			ui.selectedFolderId = note.folder_id ?? undefined;
			await refresh(options);
			return byId[note.note_id] ?? note;
		}

		await refresh(options);
		return null;
	};

	const patchNote = async (
		id: number,
		body: UpdateWarRoomNoteBody,
		options: ApiOptions = {}
	): Promise<WarRoomNote | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;

		const prev = byId[id];
		if (prev) byId[id] = { ...prev, ...(body as Partial<WarRoomNote>) };

		const res = await WarRoomNotesService.update(warRoomId, id, body, options);
		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const note = res.data;
			byId[getNoteId(note)] = note;

			// If the folder changed, the tree structure needs re-hydration.
			const didMove =
				prev !== undefined &&
				(prev.folder_id ?? null) !== (note.folder_id ?? null);

			if (didMove) {
				await refresh(options);
			} else {
				updateNoteInTree(note);
			}

			return byId[id] ?? note;
		}

		await refresh(options);
		return await getNote(id, options);
	};

	const removeNote = async (id: number, options: ApiOptions = {}): Promise<boolean> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;

		const prev = byId[id];
		const prevSelected = ui.selectedNoteId;

		if (prev) delete byId[id];
		if (list.noteIds.includes(id)) list.noteIds = list.noteIds.filter((x) => x !== id);
		if (ui.selectedNoteId === id) ui.selectedNoteId = undefined;

		const res = await WarRoomNotesService.remove(warRoomId, id, options);
		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		// Rollback optimistic state on failure.
		if (prev) byId[id] = prev;
		if (!list.noteIds.includes(id)) list.noteIds = [id, ...list.noteIds];
		ui.selectedNoteId = prevSelected;

		await refresh(options);
		return false;
	};

	const createFolder = async (
		body: CreateWarRoomNoteFolderBody,
		options: ApiOptions = {}
	): Promise<WarRoomNoteFolder | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;

		const res = await WarRoomNotesService.createFolder(warRoomId, body, options);
		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			ui.selectedFolderId = res.data.id;
			await refresh(options);
			return res.data;
		}

		await refresh(options);
		return null;
	};

	const patchFolder = async (
		id: number,
		body: UpdateWarRoomNoteFolderBody,
		options: ApiOptions = {}
	): Promise<WarRoomNoteFolder | null> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return null;

		const prev = foldersById[id];
		if (prev) {
			foldersById[id] = {
				...prev,
				...(body as Partial<WarRoomNoteFolderTreeNode>)
			};
		}

		const res = await WarRoomNotesService.updateFolder(warRoomId, id, body, options);
		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			await refresh(options);
			return res.data;
		}

		await refresh(options);
		return null;
	};

	const removeFolder = async (id: number, options: ApiOptions = {}): Promise<boolean> => {
		const warRoomId = getWarRoomId();
		if (warRoomId === null) return false;

		const res = await WarRoomNotesService.removeFolder(warRoomId, id, options);
		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		await refresh(options);
		return false;
	};

	const selectNote = (id?: number) => {
		ui.selectedNoteId = id;
	};

	const selectFolder = (id?: number) => {
		ui.selectedFolderId = id;
	};

	const setSearchTerm = (term: string) => {
		list.searchTerm = term;
	};

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];
		for (const k of Object.keys(foldersById)) delete foldersById[Number(k)];

		list.tree = [];
		list.noteIds = [];
		list.folderIds = [];
		list.searchTerm = '';
		list.status = 'idle';
		list.error = null;

		ui.selectedNoteId = undefined;
		ui.selectedFolderId = undefined;
		ui.showAddNoteModal = false;
		ui.showAddFolderModal = false;
	};

	return {
		byId,
		foldersById,
		list,
		ui,
		currentWarRoomId,
		currentNote,
		folders,
		notes,
		loadTree,
		refresh,
		getNote,
		ensureSelectedLoaded,
		createNote,
		patchNote,
		removeNote,
		createFolder,
		patchFolder,
		removeFolder,
		selectNote,
		selectFolder,
		setSearchTerm,
		reset
	};
};

export type WarRoomNotesContext = ReturnType<typeof createWarRoomNotesContext>;
