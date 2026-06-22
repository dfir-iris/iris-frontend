export interface DataStoreFolder {
	path_id: number;
	path_uuid: string;
	path_name: string;
	path_parent_id: number | null;
	path_is_root: boolean;
	path_case_id: number;
}

export interface DataStoreFile {
	file_id: number;
	file_uuid: string;
	file_original_name: string;
	file_description: string | null;
	file_date_added: string | null;
	file_tags: string | null;
	file_size: number | null;
	file_is_ioc: boolean | null;
	file_is_evidence: boolean | null;
	file_password: string | null;
	file_parent_id: number;
	file_sha256: string | null;
	added_by_user_id: number | null;
	file_case_id: number;
	modification_history: Record<string, unknown> | null;
}

// Tree node shape returned by the v2 tree endpoint. Files and folders share
// the dict keyed by `<type>-<id>` (eg. `d-12`, `f-34`); files have type:'file'
// and folders type:'directory'. Folders carry a `children` map; files carry
// the file fields directly.
export type DataStoreTreeNode =
	| ({ type: 'directory'; name: string; is_root?: boolean; children: DataStoreTree })
	| ({ type: 'file' } & DataStoreFile);

export type DataStoreTree = Record<string, DataStoreTreeNode>;
