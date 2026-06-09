import { CaseNotesService } from '$lib/services/case-notes.service';
import type {
	CaseNoteIdentifier,
	CreateCaseNoteBody,
	CreateNoteDirectoryBody,
	UpdateCaseNoteBody,
	UpdateNoteDirectoryBody,
	NoteDirectoryIdentifier
} from '$lib/services/case-notes.service';
import type { ApiOptions } from '$lib/services/api.service';
import type { Note, NoteFolder } from '$lib/types/resources/note';

export const CASE_NOTES_CTX = Symbol('case-notes');

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedNoteId?: number;
	selectedFolderId?: number;
	showAddNoteModal: boolean;
	showAddFolderModal: boolean;
};

type RawNoteFolder = NoteFolder & {
	parent_id?: number;
	subdirectories?: Array<NoteFolder | string>;
	notes?: Array<Note | string>;
};

type NormalizedNoteFolder = NoteFolder & {
	parent_id?: number;
	subdirectories: NormalizedNoteFolder[];
	notes: Note[];
};

type FolderNode = {
	id: number;
	name: string;
	parent_id?: number;
	subdirectoryIds: number[];
};

type FolderMap = Record<number, NormalizedNoteFolder>;

const getNoteId = (note: Note): number => note.note_id;

const getDirectoryId = (directory: NoteFolder): number => directory.id;

const parseDirectoryRefId = (value: unknown): number | null => {
	if (typeof value === 'object' && value !== null && 'id' in value) {
		const id = (value as { id?: unknown }).id;
		return typeof id === 'number' ? id : null;
	}

	if (typeof value !== 'string') return null;

	const match = value.match(/<NoteDirectory\s+(\d+)>/);
	return match ? Number(match[1]) : null;
};

const toFolderNode = (folder: RawNoteFolder): FolderNode => ({
	id: folder.id,
	name: folder.name,
	parent_id: folder.parent_id,
	subdirectoryIds: Array.isArray(folder.subdirectories)
		? folder.subdirectories
				.map(parseDirectoryRefId)
				.filter((id): id is number => typeof id === 'number')
		: []
});

const buildFoldersTree = (rawFolders: RawNoteFolder[], notes: Note[]): NormalizedNoteFolder[] => {
	const folderNodes = rawFolders.map(toFolderNode);
	const folderNodeById = new Map<number, FolderNode>(
		folderNodes.map((folder) => [folder.id, folder])
	);

	const notesByDirectory = new Map<number, Note[]>();

	for (const note of notes) {
		if (typeof note.directory_id !== 'number') continue;

		const current = notesByDirectory.get(note.directory_id);

		if (current) {
			current.push(note);
		} else {
			notesByDirectory.set(note.directory_id, [note]);
		}
	}

	const folderMap: FolderMap = {};

	for (const folder of folderNodes) {
		folderMap[folder.id] = {
			id: folder.id,
			name: folder.name,
			parent_id: folder.parent_id,
			subdirectories: [],
			notes: notesByDirectory.get(folder.id) ?? []
		};
	}

	const childIds = new Set<number>();

	for (const folder of folderNodes) {
		for (const childId of folder.subdirectoryIds) {
			const child = folderMap[childId];
			if (!child) continue;

			folderMap[folder.id].subdirectories.push(child);
			childIds.add(childId);

			if (!child.parent_id) {
				child.parent_id = folder.id;
			}
		}
	}

	const roots: NormalizedNoteFolder[] = [];

	for (const folder of folderNodes) {
		const current = folderMap[folder.id];
		if (!current) continue;

		const hasParentByField =
			typeof current.parent_id === 'number' && folderNodeById.has(current.parent_id);

		const hasParentByRelationship = childIds.has(current.id);

		if (!hasParentByField && !hasParentByRelationship) {
			roots.push(current);
		}
	}

	return roots;
};

const collectDirectories = (
	folders: NoteFolder[],
	byId: Record<number, NoteFolder>,
	orderedIds: number[]
) => {
	for (const folder of folders) {
		const id = getDirectoryId(folder);
		byId[id] = folder;

		if (!orderedIds.includes(id)) {
			orderedIds.push(id);
		}

		if (folder.subdirectories.length > 0) {
			collectDirectories(folder.subdirectories, byId, orderedIds);
		}
	}
};

const collectNotes = (folders: NoteFolder[], byId: Record<number, Note>, orderedIds: number[]) => {
	for (const folder of folders) {
		for (const note of folder.notes) {
			const id = getNoteId(note);
			byId[id] = note;

			if (!orderedIds.includes(id)) {
				orderedIds.push(id);
			}
		}

		if (folder.subdirectories.length > 0) {
			collectNotes(folder.subdirectories, byId, orderedIds);
		}
	}
};

export const createCaseNotesContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, Note>>({});
	const foldersById = $state<Record<number, NoteFolder>>({});

	const list = $state<{
		tree: NoteFolder[];
		noteIds: number[];
		directoryIds: number[];
		searchResultIds: number[];
		searchTerm: string;
		searchStatus: Status;
		searchError: string | null;
		status: Status;
		error: string | null;
	}>({
		tree: [],
		noteIds: [],
		directoryIds: [],
		searchResultIds: [],
		searchTerm: '',
		searchStatus: 'idle',
		searchError: null,
		status: 'idle',
		error: null
	});

	const ui = $state<UIState>({
		selectedNoteId: undefined,
		selectedFolderId: undefined,
		showAddNoteModal: false,
		showAddFolderModal: false
	});

	const currentCaseId = $derived(() => getCaseId());

	const currentNote = $derived(() =>
		ui.selectedNoteId !== undefined ? byId[ui.selectedNoteId] : undefined
	);

	const folders = $derived(() =>
		list.directoryIds
			.map((id) => foldersById[id])
			.filter((folder): folder is NoteFolder => !!folder)
	);

	const notes = $derived(() =>
		list.noteIds.map((id) => byId[id]).filter((note): note is Note => !!note)
	);

	const updateNoteInTree = (note: Note) => {
		const id = getNoteId(note);

		const visit = (folders: NoteFolder[]): boolean => {
			for (const folder of folders) {
				for (let i = 0; i < folder.notes.length; i++) {
					if (getNoteId(folder.notes[i]) === id) {
						folder.notes[i] = note;
						return true;
					}
				}

				if (folder.subdirectories.length > 0 && visit(folder.subdirectories)) {
					return true;
				}
			}

			return false;
		};

		visit(list.tree);
	};

	const replaceTreeState = (tree: NoteFolder[]) => {
		for (const k of Object.keys(foldersById)) delete foldersById[Number(k)];
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		const directoryIds: number[] = [];
		const noteIds: number[] = [];

		collectDirectories(tree, foldersById, directoryIds);
		collectNotes(tree, byId, noteIds);

		list.tree = tree;
		list.directoryIds = directoryIds;
		list.noteIds = noteIds;
	};

	const loadTree = async (options: ApiOptions = {}) => {
		const caseId = getCaseId();

		if (caseId === null) {
			list.status = 'error';
			list.error = 'Missing case id';
			return;
		}

		list.status = 'loading';
		list.error = null;

		const [directoriesRes, notesRes] = await Promise.all([
			CaseNotesService.listDirectories(caseId, options),
			CaseNotesService.listNotes(caseId, {}, options)
		]);

		if (
			!directoriesRes.ok ||
			directoriesRes.error ||
			directoriesRes.data === null ||
			typeof directoriesRes.data === 'string'
		) {
			list.status = 'error';
			list.error = directoriesRes.error?.message ?? 'Failed to load note directories';
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

		const tree = buildFoldersTree(directoriesRes.data.data as RawNoteFolder[], notesRes.data);

		replaceTreeState(tree);
		list.status = 'idle';
	};

	const refresh = async (options: ApiOptions = {}) => {
		await loadTree(options);
	};

	const getNote = async (
		id: CaseNoteIdentifier,
		options: ApiOptions = {}
	): Promise<Note | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseNotesService.getNote(caseId, id, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const note = res.data;
			byId[getNoteId(note)] = note;

			if (!list.noteIds.includes(id)) {
				list.noteIds = [id, ...list.noteIds];
			}

			return note;
		}

		await refresh(options);
		return byId[id] ?? null;
	};

	const ensureSelectedLoaded = async (options: ApiOptions = {}): Promise<Note | null> => {
		const id = ui.selectedNoteId;

		if (id) {
			if (byId[id]?.note_content) return byId[id];

			return await getNote(id, options);
		}

		return null;
	};

	const searchNotes = async (term: string, options: ApiOptions = {}): Promise<Note[]> => {
		const caseId = getCaseId();
		const trimmed = term.trim();

		list.searchTerm = trimmed;

		if (caseId === null || trimmed.length === 0) {
			list.searchResultIds = [];
			list.searchStatus = 'idle';
			list.searchError = null;
			return [];
		}

		list.searchStatus = 'loading';
		list.searchError = null;

		const res = await CaseNotesService.searchNotes(caseId, trimmed, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			list.searchStatus = 'error';
			list.searchError = res.error?.message ?? 'Failed to search notes';
			list.searchResultIds = [];
			return [];
		}

		const items = res.data;
		const resultIds: number[] = [];

		for (const note of items) {
			const id = getNoteId(note);
			byId[id] = { ...(byId[id] ?? {}), ...note };
			resultIds.push(id);
		}

		list.searchResultIds = resultIds;
		list.searchStatus = 'idle';
		return items;
	};

	const createNote = async (
		body: CreateCaseNoteBody,
		options: ApiOptions = {}
	): Promise<Note | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseNotesService.createNote(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const note = res.data;
			byId[getNoteId(note)] = note;
			ui.selectedNoteId = getNoteId(note);
			ui.selectedFolderId = note.directory_id;

			await refresh(options);
			return byId[note.note_id] ?? note;
		}

		await refresh(options);
		return null;
	};

	const patchNote = async (
		id: CaseNoteIdentifier,
		body: UpdateCaseNoteBody,
		options: ApiOptions = {}
	): Promise<Note | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = byId[id];
		if (prev) byId[id] = { ...prev, ...(body as Partial<Note>) };

		const res = await CaseNotesService.updateNote(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			const note = res.data;
			byId[getNoteId(note)] = note;

			// Update the note reference inside the cached tree so the sidebar reflects
			// any title/directory changes without triggering a full tree reload.
			const didMove =
				prev !== undefined &&
				typeof prev.directory_id === 'number' &&
				typeof note.directory_id === 'number' &&
				prev.directory_id !== note.directory_id;

			if (didMove) {
				// Directory changed — the tree structure needs a refresh.
				await refresh(options);
			} else {
				updateNoteInTree(note);
			}

			return byId[id] ?? note;
		}

		await refresh(options);
		return await getNote(id, options);
	};

	const removeNote = async (id: CaseNoteIdentifier, options: ApiOptions = {}): Promise<boolean> => {
		const caseId = getCaseId();

		if (caseId === null) return false;

		const prev = byId[id];
		const prevSelected = ui.selectedNoteId;

		if (prev) delete byId[id];
		if (list.noteIds.includes(id)) list.noteIds = list.noteIds.filter((x) => x !== id);
		if (ui.selectedNoteId === id) ui.selectedNoteId = undefined;

		const res = await CaseNotesService.removeNote(caseId, id, options);

		if (res.ok && !res.error) {
			await refresh(options);
			return true;
		}

		if (prev) byId[id] = prev;
		if (!list.noteIds.includes(id)) list.noteIds = [id, ...list.noteIds];
		ui.selectedNoteId = prevSelected;

		await refresh(options);
		return false;
	};

	const createFolder = async (
		body: CreateNoteDirectoryBody,
		options: ApiOptions = {}
	): Promise<NoteFolder | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseNotesService.createDirectory(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			ui.selectedFolderId = res.data.id;
			await refresh(options);
			return res.data;
		}

		await refresh(options);
		return null;
	};

	const patchFolder = async (
		id: NoteDirectoryIdentifier,
		body: UpdateNoteDirectoryBody,
		options: ApiOptions = {}
	): Promise<NoteFolder | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = foldersById[id];
		if (prev) foldersById[id] = { ...prev, ...(body as Partial<NoteFolder>) };

		const res = await CaseNotesService.updateDirectory(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			foldersById[id] = res.data;

			await refresh(options);
			return foldersById[id] ?? res.data;
		}

		await refresh(options);
		return foldersById[id] ?? null;
	};

	const removeFolder = async (
		id: NoteDirectoryIdentifier,
		options: ApiOptions = {}
	): Promise<boolean> => {
		const caseId = getCaseId();

		if (caseId === null) return false;

		const res = await CaseNotesService.removeDirectory(caseId, id, options);

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

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];
		for (const k of Object.keys(foldersById)) delete foldersById[Number(k)];

		list.tree = [];
		list.noteIds = [];
		list.directoryIds = [];
		list.searchResultIds = [];
		list.searchTerm = '';
		list.searchStatus = 'idle';
		list.searchError = null;
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
		currentCaseId,
		currentNote,
		folders,
		notes,
		loadTree,
		refresh,
		getNote,
		ensureSelectedLoaded,
		searchNotes,
		createNote,
		patchNote,
		removeNote,
		createFolder,
		patchFolder,
		removeFolder,
		selectNote,
		selectFolder,
		reset
	};
};

export type CaseNotesContext = ReturnType<typeof createCaseNotesContext>;
