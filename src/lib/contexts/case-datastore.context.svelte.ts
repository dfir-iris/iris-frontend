import type { ApiOptions } from '$lib/services/api.service';
import { CaseDatastoreService } from '$lib/services/case-datastore.service';
import type {
	CreateFolderBody,
	RenameFolderBody,
	UpdateFileMetadataFields,
	UploadFileFields
} from '$lib/services/case-datastore.service';
import type {
	DataStoreFile,
	DataStoreFolder,
	DataStoreTree,
	DataStoreTreeNode
} from '$lib/types/resources/datastore';

export const CASE_DATASTORE_CTX = Symbol('case-datastore');

type Status = 'idle' | 'loading' | 'error';

type UIState = {
	selectedFolderId?: number;
	selectedFileId?: number;
	showAddFileModal: boolean;
	showAddFolderModal: boolean;
};

// Walk the tree dict returned by the backend and return the matching folder
// node, or null. Files use `f-<id>` keys, folders use `d-<id>`.
const findFolderNode = (tree: DataStoreTree, folderId: number): DataStoreTreeNode | null => {
	for (const [key, node] of Object.entries(tree)) {
		if (node.type !== 'directory') continue;
		if (key === `d-${folderId}`) return node;
		const found = findFolderNode(node.children, folderId);
		if (found) return found;
	}
	return null;
};

// Flatten all files in the tree into a list, useful for the data-table view
// and counting totals without a separate request.
const collectFiles = (tree: DataStoreTree): DataStoreFile[] => {
	const out: DataStoreFile[] = [];
	const walk = (subtree: DataStoreTree) => {
		for (const node of Object.values(subtree)) {
			if (node.type === 'file') {
				out.push(node as DataStoreFile);
			} else {
				walk(node.children);
			}
		}
	};
	walk(tree);
	return out;
};

export const createCaseDatastoreContext = (getCaseId: () => number | null) => {
	const tree = $state<{
		data: DataStoreTree;
		rootId: number | null;
		status: Status;
		error: string | null;
	}>({
		data: {},
		rootId: null,
		status: 'idle',
		error: null
	});

	const fileById = $state<Record<number, DataStoreFile>>({});

	const ui = $state<UIState>({
		selectedFolderId: undefined,
		selectedFileId: undefined,
		showAddFileModal: false,
		showAddFolderModal: false
	});

	const currentCaseId = $derived(() => getCaseId());

	const files = $derived(() => collectFiles(tree.data));

	const total = $derived(() => files().length);

	const currentFolder = $derived(() =>
		ui.selectedFolderId !== undefined && tree.rootId !== null
			? findFolderNode(tree.data, ui.selectedFolderId)
			: null
	);

	const currentFile = $derived(() =>
		ui.selectedFileId !== undefined ? fileById[ui.selectedFileId] : undefined
	);

	const loadTree = async (options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) {
			tree.status = 'error';
			tree.error = 'Missing case id';
			return;
		}

		tree.status = 'loading';
		tree.error = null;

		const res = await CaseDatastoreService.getTree(caseId, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			tree.status = 'error';
			tree.error = res.error?.message ?? 'Failed to load datastore tree';
			return;
		}

		// Backend wraps responses in { message, data }
		const payload = res.data as unknown as { data: DataStoreTree } | DataStoreTree;
		const treeData =
			'data' in (payload as { data?: unknown }) && (payload as { data?: unknown }).data
				? (payload as { data: DataStoreTree }).data
				: (payload as DataStoreTree);

		tree.data = treeData;
		tree.status = 'idle';

		const rootKey = Object.keys(treeData)[0];
		tree.rootId = rootKey ? Number(rootKey.replace('d-', '')) : null;

		// Cache files by id for quick lookup.
		for (const id of Object.keys(fileById)) delete fileById[Number(id)];
		for (const f of collectFiles(treeData)) fileById[f.file_id] = f;
	};

	const createFolder = async (
		body: CreateFolderBody,
		options: ApiOptions = {}
	): Promise<DataStoreFolder | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const res = await CaseDatastoreService.createFolder(caseId, body, options);
		await loadTree(options);

		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as unknown as { data: DataStoreFolder } | DataStoreFolder;
			return 'data' in (payload as { data?: unknown }) && (payload as { data?: unknown }).data
				? (payload as { data: DataStoreFolder }).data
				: (payload as DataStoreFolder);
		}
		return null;
	};

	const renameFolder = async (
		folderId: number,
		body: RenameFolderBody,
		options: ApiOptions = {}
	) => {
		const caseId = getCaseId();
		if (caseId === null) return false;
		const res = await CaseDatastoreService.renameFolder(caseId, folderId, body, options);
		await loadTree(options);
		return res.ok ?? false;
	};

	const moveFolder = async (
		folderId: number,
		destinationNode: number,
		options: ApiOptions = {}
	) => {
		const caseId = getCaseId();
		if (caseId === null) return false;
		const res = await CaseDatastoreService.moveFolder(
			caseId,
			folderId,
			{ destination_node: destinationNode },
			options
		);
		await loadTree(options);
		return res.ok ?? false;
	};

	const deleteFolder = async (folderId: number, options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return false;
		const res = await CaseDatastoreService.deleteFolder(caseId, folderId, options);
		if (ui.selectedFolderId === folderId) ui.selectedFolderId = undefined;
		await loadTree(options);
		return res.ok ?? false;
	};

	const uploadFile = async (
		folderId: number,
		fields: UploadFileFields,
		file: File
	): Promise<DataStoreFile | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const res = await CaseDatastoreService.uploadFile(caseId, folderId, fields, file);
		await loadTree();

		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as unknown as { data: DataStoreFile } | DataStoreFile;
			const created =
				'data' in (payload as { data?: unknown }) && (payload as { data?: unknown }).data
					? (payload as { data: DataStoreFile }).data
					: (payload as DataStoreFile);
			fileById[created.file_id] = created;
			ui.selectedFileId = created.file_id;
			return created;
		}
		return null;
	};

	const updateFile = async (
		fileId: number,
		fields: UpdateFileMetadataFields,
		file?: File
	): Promise<DataStoreFile | null> => {
		const caseId = getCaseId();
		if (caseId === null) return null;

		const res = await CaseDatastoreService.updateFile(caseId, fileId, fields, file);
		await loadTree();

		if (res.ok && res.data && typeof res.data !== 'string') {
			const payload = res.data as unknown as { data: DataStoreFile } | DataStoreFile;
			const updated =
				'data' in (payload as { data?: unknown }) && (payload as { data?: unknown }).data
					? (payload as { data: DataStoreFile }).data
					: (payload as DataStoreFile);
			fileById[updated.file_id] = updated;
			return updated;
		}
		return null;
	};

	const moveFile = async (fileId: number, destinationNode: number, options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return false;
		const res = await CaseDatastoreService.moveFile(
			caseId,
			fileId,
			{ destination_node: destinationNode },
			options
		);
		await loadTree(options);
		return res.ok ?? false;
	};

	const deleteFile = async (fileId: number, options: ApiOptions = {}) => {
		const caseId = getCaseId();
		if (caseId === null) return false;
		const res = await CaseDatastoreService.deleteFile(caseId, fileId, options);
		if (ui.selectedFileId === fileId) ui.selectedFileId = undefined;
		await loadTree(options);
		return res.ok ?? false;
	};

	const selectFolder = (id?: number) => {
		ui.selectedFolderId = id;
	};

	const selectFile = (id?: number) => {
		ui.selectedFileId = id;
	};

	const reset = () => {
		tree.data = {};
		tree.rootId = null;
		tree.status = 'idle';
		tree.error = null;
		for (const id of Object.keys(fileById)) delete fileById[Number(id)];
		ui.selectedFolderId = undefined;
		ui.selectedFileId = undefined;
		ui.showAddFileModal = false;
		ui.showAddFolderModal = false;
	};

	return {
		tree,
		fileById,
		ui,
		currentCaseId,
		currentFolder,
		currentFile,
		files,
		total,
		loadTree,
		createFolder,
		renameFolder,
		moveFolder,
		deleteFolder,
		uploadFile,
		updateFile,
		moveFile,
		deleteFile,
		selectFolder,
		selectFile,
		reset
	};
};

export type CaseDatastoreContext = ReturnType<typeof createCaseDatastoreContext>;
