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

const getNoteId = (note: Note): number => note.note_id;

const getDirectoryId = (directory: NoteFolder): number => directory.id;

const normalizeFolder = (folder: NoteFolder): NoteFolder => ({
	...folder,
	subdirectories: Array.isArray(folder.subdirectories)
		? folder.subdirectories.map(normalizeFolder)
		: [],
	notes: []
});

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

const attachNotesToFolders = (folders: NoteFolder[], notes: Note[]) => {
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

	const apply = (folder: NoteFolder): NoteFolder => ({
		...folder,
		notes: notesByDirectory.get(folder.id) ?? [],
		subdirectories: folder.subdirectories.map(apply)
	});

	return folders.map(apply);
};

export const createCaseNotesContext = (getCaseId: () => number | null) => {
	const byId = $state<Record<number, Note>>({});
	const directoriesById = $state<Record<number, NoteFolder>>({});

	const list = $state<{
		tree: NoteFolder[];
		noteIds: number[];
		directoryIds: number[];
		status: Status;
		error: string | null;
	}>({
		tree: [],
		noteIds: [],
		directoryIds: [],
		status: 'idle',
		error: null
	});

	const ui = $state({
		selectedNoteId: null as number | null,
		showAddNoteModal: false,
		showAddFolderModal: false
	});

	const currentCaseId = $derived(() => getCaseId());

	const currentNote = $derived(() => {
		const id = ui.selectedNoteId;
		return id === null ? null : (byId[id] ?? null);
	});

	const directories = $derived(() =>
		list.directoryIds
			.map((id) => directoriesById[id])
			.filter((folder): folder is NoteFolder => !!folder)
	);

	const notes = $derived(() =>
		list.noteIds.map((id) => byId[id]).filter((note): note is Note => !!note)
	);

	const replaceTreeState = (tree: NoteFolder[]) => {
		for (const k of Object.keys(directoriesById)) delete directoriesById[Number(k)];
		for (const k of Object.keys(byId)) delete byId[Number(k)];

		const directoryIds: number[] = [];
		const noteIds: number[] = [];

		collectDirectories(tree, directoriesById, directoryIds);
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

		if (!notesRes.ok || notesRes.error || notesRes.data === null || typeof notesRes.data === 'string') {
			list.status = 'error';
			list.error = notesRes.error?.message ?? 'Failed to load notes';
			return;
		}

		const folders = directoriesRes.data.data.map(normalizeFolder);
		const tree = attachNotesToFolders(folders, notesRes.data);

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
		if (id === null) return null;

		if (byId[id]?.note_content) return byId[id];

		return await getNote(id, options);
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

			await refresh(options);
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
		if (ui.selectedNoteId === id) ui.selectedNoteId = null;

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

	const createDirectory = async (
		body: CreateNoteDirectoryBody,
		options: ApiOptions = {}
	): Promise<NoteFolder | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const res = await CaseNotesService.createDirectory(caseId, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			await refresh(options);
			return res.data;
		}

		await refresh(options);
		return null;
	};

	const patchDirectory = async (
		id: NoteDirectoryIdentifier,
		body: UpdateNoteDirectoryBody,
		options: ApiOptions = {}
	): Promise<NoteFolder | null> => {
		const caseId = getCaseId();

		if (caseId === null) return null;

		const prev = directoriesById[id];
		if (prev) directoriesById[id] = { ...prev, ...(body as Partial<NoteFolder>) };

		const res = await CaseNotesService.updateDirectory(caseId, id, body, options);

		if (res.ok && !res.error && res.data !== null && typeof res.data !== 'string') {
			directoriesById[id] = res.data;

			await refresh(options);
			return directoriesById[id] ?? res.data;
		}

		await refresh(options);
		return directoriesById[id] ?? null;
	};

	const removeDirectory = async (
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

	const selectNote = (id: number | null) => {
		ui.selectedNoteId = id;
	};

	const reset = () => {
		for (const k of Object.keys(byId)) delete byId[Number(k)];
		for (const k of Object.keys(directoriesById)) delete directoriesById[Number(k)];

		list.tree = [];
		list.noteIds = [];
		list.directoryIds = [];
		list.status = 'idle';
		list.error = null;

		ui.selectedNoteId = null;
		ui.showAddNoteModal = false;
		ui.showAddFolderModal = false;
	};

	return {
		byId,
		directoriesById,
		list,
		ui,
		currentCaseId,
		currentNote,
		directories,
		notes,
		loadTree,
		refresh,
		getNote,
		ensureSelectedLoaded,
		createNote,
		patchNote,
		removeNote,
		createDirectory,
		patchDirectory,
		removeDirectory,
		selectNote,
		reset
	};
};

export type CaseNotesContext = ReturnType<typeof createCaseNotesContext>;
