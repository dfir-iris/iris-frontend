import { browser } from '$app/environment';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import { auth } from '$lib/stores/auth.store';
import type {
	DataStoreFile,
	DataStoreFolder,
	DataStoreTree
} from '$lib/types/resources/datastore';

export type SortDir = 'asc' | 'desc';

export interface ListCaseDatastoreFilesParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: SortDir;
}

export interface PaginatedFiles {
	total: number;
	data: DataStoreFile[];
	last_page: number | null;
	current_page: number;
	next_page: number | null;
}

export interface CreateFolderBody {
	parent_node: number;
	folder_name: string;
}

export interface RenameFolderBody {
	folder_name: string;
}

export interface MoveBody {
	destination_node: number;
}

export interface UpdateFileMetadataFields {
	file_original_name?: string;
	file_description?: string;
	file_tags?: string;
	file_password?: string;
	file_is_ioc?: boolean;
	file_is_evidence?: boolean;
}

export interface UploadFileFields extends UpdateFileMetadataFields {
	file_original_name: string;
}

const buildFormData = (fields: Record<string, string | number | boolean | undefined>, file?: File) => {
	const fd = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined) continue;
		if (typeof value === 'boolean') {
			fd.append(key, value ? 'true' : 'false');
		} else {
			fd.append(key, String(value));
		}
	}
	if (file) fd.append('file_content', file, file.name);
	return fd;
};

// FormData requests bypass ApiService (which forces JSON) — we still need the
// auth header, the configured base URL, and a consistent RequestResponse
// shape so the calling code reads results the same way as JSON endpoints.
const multipart = async <T>(
	method: 'POST' | 'PUT',
	url: string,
	formData: FormData
): Promise<RequestResponse<T>> => {
	const { auth } = await import('$lib/stores/auth.store');
	const { AuthService } = await import('./auth.service');
	const { browser } = await import('$app/environment');
	const { apiOrigin } = await import('$lib/config/api.config');

	if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
		await AuthService.refreshToken();
	}

	const baseUrl = apiOrigin();
	const fullUrl = `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;

	const headers: Record<string, string> = { Accept: 'application/json' };
	const token = auth.getAccessToken();
	if (token) headers.Authorization = `Bearer ${token}`;

	const response = await (browser ? window.fetch : global.fetch)(fullUrl, {
		method,
		headers,
		body: formData
	});

	let data: T | string | null = null;
	try {
		const ct = response.headers.get('content-type') ?? '';
		if (ct.includes('application/json')) {
			data = (await response.json()) as T;
		} else {
			data = await response.text();
		}
	} catch {
		data = null;
	}

	return { data, status: response.status, headers: response.headers, ok: response.ok };
};

export class CaseDatastoreService {
	// ------------------------------------------------------------------
	// Tree
	// ------------------------------------------------------------------
	static async getTree(caseId: number, options: ApiOptions = {}) {
		return ApiService.get<DataStoreTree>(`/api/v2/cases/${caseId}/datastore/tree`, options);
	}

	// ------------------------------------------------------------------
	// Folders
	// ------------------------------------------------------------------
	static async listFolders(caseId: number, options: ApiOptions = {}) {
		return ApiService.get<DataStoreFolder[]>(`/api/v2/cases/${caseId}/datastore/folders`, options);
	}

	static async createFolder(caseId: number, body: CreateFolderBody, options: ApiOptions = {}) {
		return ApiService.post<DataStoreFolder>(
			`/api/v2/cases/${caseId}/datastore/folders`,
			body,
			options
		);
	}

	static async renameFolder(
		caseId: number,
		folderId: number,
		body: RenameFolderBody,
		options: ApiOptions = {}
	) {
		return ApiService.post<DataStoreFolder>(
			`/api/v2/cases/${caseId}/datastore/folders/${folderId}/rename`,
			body,
			options
		);
	}

	static async moveFolder(
		caseId: number,
		folderId: number,
		body: MoveBody,
		options: ApiOptions = {}
	) {
		return ApiService.post<DataStoreFolder>(
			`/api/v2/cases/${caseId}/datastore/folders/${folderId}/move`,
			body,
			options
		);
	}

	static async deleteFolder(caseId: number, folderId: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(
			`/api/v2/cases/${caseId}/datastore/folders/${folderId}`,
			options
		);
	}

	// ------------------------------------------------------------------
	// Files
	// ------------------------------------------------------------------
	static async listFiles(
		caseId: number,
		params: ListCaseDatastoreFilesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message?: string; data?: PaginatedFiles } | PaginatedFiles>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/datastore/files`,
			params as Record<string, unknown>
		);
		return ApiService.get(path, options);
	}

	static async getFileInfo(caseId: number, fileId: number, options: ApiOptions = {}) {
		return ApiService.get<DataStoreFile>(
			`/api/v2/cases/${caseId}/datastore/files/${fileId}/info`,
			options
		);
	}

	// Returns the canonical view URL. Useful for `copy-link` / markdown
	// embeds where the receiver will perform their own authenticated
	// fetch. NOT safe to drop into `<a href>` / `window.open` directly —
	// those produce un-authenticated browser navigations that the v2
	// endpoint will 401 on. Use `fetchFileBlobUrl` for in-app preview /
	// download instead.
	static getViewUrl(caseId: number, fileId: number): string {
		const path = `/api/v2/cases/${caseId}/datastore/files/${fileId}`;
		if (typeof window === 'undefined') return path;
		const base = (ApiService.baseUrl ?? '').replace(/\/$/, '');
		return base ? `${base}${path}` : path;
	}

	static getMarkdownLink(caseId: number, fileId: number, label: string): string {
		const safeLabel = label.replace(/[\[\]]/g, '');
		return `[${safeLabel}](${CaseDatastoreService.getViewUrl(caseId, fileId)})`;
	}

	// Downloads the file with the standard bearer token attached and
	// hands back a transient blob URL the caller can plug into
	// `window.open`, `<a href download>`, or `<img src>`. The caller is
	// responsible for `URL.revokeObjectURL()` once the URL is no longer
	// in use. Returns `null` on auth / network failure so the caller can
	// surface a toast.
	static async fetchFileBlobUrl(
		caseId: number,
		fileId: number
	): Promise<{ url: string; filename: string | null } | null> {
		const path = `/api/v2/cases/${caseId}/datastore/files/${fileId}`;
		const url = browser
			? (ApiService.baseUrl ?? '').replace(/\/$/, '') + path
			: path;

		const headers: Record<string, string> = { Accept: '*/*' };
		const token = auth.getAccessToken();
		if (token) headers['Authorization'] = `Bearer ${token}`;

		const res = await fetch(url, { headers, credentials: 'include' });
		if (!res.ok) return null;

		// Best-effort filename extraction from Content-Disposition so the
		// browser's "Save as…" pre-fills correctly even when the caller
		// doesn't already know the original filename.
		let filename: string | null = null;
		const cd = res.headers.get('Content-Disposition');
		if (cd) {
			const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
			if (m) {
				try {
					filename = decodeURIComponent(m[1]);
				} catch {
					filename = m[1];
				}
			}
		}

		const blob = await res.blob();
		return { url: URL.createObjectURL(blob), filename };
	}

	static async uploadFile(
		caseId: number,
		folderId: number,
		fields: UploadFileFields,
		file: File
	): Promise<RequestResponse<DataStoreFile>> {
		const fd = buildFormData(fields as unknown as Record<string, string | number | boolean | undefined>, file);
		return multipart<DataStoreFile>(
			'POST',
			`/api/v2/cases/${caseId}/datastore/folders/${folderId}/files`,
			fd
		);
	}

	static async updateFile(
		caseId: number,
		fileId: number,
		fields: UpdateFileMetadataFields,
		file?: File
	): Promise<RequestResponse<DataStoreFile>> {
		const fd = buildFormData(fields as unknown as Record<string, string | number | boolean | undefined>, file);
		return multipart<DataStoreFile>(
			'POST',
			`/api/v2/cases/${caseId}/datastore/files/${fileId}`,
			fd
		);
	}

	static async moveFile(caseId: number, fileId: number, body: MoveBody, options: ApiOptions = {}) {
		return ApiService.post<DataStoreFile>(
			`/api/v2/cases/${caseId}/datastore/files/${fileId}/move`,
			body,
			options
		);
	}

	static async deleteFile(caseId: number, fileId: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(
			`/api/v2/cases/${caseId}/datastore/files/${fileId}`,
			options
		);
	}
}
