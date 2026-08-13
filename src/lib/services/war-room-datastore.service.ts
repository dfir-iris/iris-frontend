/** War-room datastore REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomDatastoreFile {
	file_id: number;
	war_room_id: number;
	filename: string;
	description: string | null;
	size_bytes: number;
	mime_type: string | null;
	sha256: string | null;
	uploaded_at: string | null;
	uploaded_by_id: number | null;
	tags: string | null;
}

export interface WarRoomDatastoreListing {
	files: WarRoomDatastoreFile[];
	attached_case_ids: number[];
}

// FormData requests bypass ApiService (which forces JSON); we mirror the
// pattern used by case-datastore.service.ts so the auth header, base
// URL, and RequestResponse shape stay consistent across the SPA.
const multipart = async <T>(
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
		method: 'POST',
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

export class WarRoomDatastoreService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomDatastoreListing>> {
		return ApiService.get(`/war-rooms/${warRoomId}/datastore`, options);
	}

	static upload(
		warRoomId: number,
		file: File,
		extras: { description?: string; tags?: string } = {}
	): Promise<RequestResponse<WarRoomDatastoreFile>> {
		const form = new FormData();
		form.append('file', file, file.name);
		if (extras.description) form.append('description', extras.description);
		if (extras.tags) form.append('tags', extras.tags);
		return multipart<WarRoomDatastoreFile>(
			`/api/v2/war-rooms/${warRoomId}/datastore`,
			form
		);
	}

	static downloadUrl(warRoomId: number, fileId: number): string {
		return `/api/v2/war-rooms/${warRoomId}/datastore/${fileId}/content`;
	}

	/**
	 * Fetch a file's bytes with the current bearer token and return an
	 * object URL suitable for `<img src>` or `<a href download>`. The
	 * caller is responsible for `URL.revokeObjectURL(...)` when the
	 * element goes away — otherwise the blob leaks.
	 */
	static async fetchFileBlobUrl(
		warRoomId: number,
		fileId: number
	): Promise<string | null> {
		const { auth } = await import('$lib/stores/auth.store');
		const { AuthService } = await import('./auth.service');
		const { browser } = await import('$app/environment');
		const { apiOrigin } = await import('$lib/config/api.config');

		if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
			await AuthService.refreshToken();
		}

		const baseUrl = apiOrigin();
		const fullUrl = `${baseUrl}/api/v2/war-rooms/${warRoomId}/datastore/${fileId}/content`;
		const headers: Record<string, string> = {};
		const token = auth.getAccessToken();
		if (token) headers.Authorization = `Bearer ${token}`;
		try {
			const resp = await (browser ? window.fetch : global.fetch)(fullUrl, { headers });
			if (!resp.ok) return null;
			const blob = await resp.blob();
			return URL.createObjectURL(blob);
		} catch {
			return null;
		}
	}

	static remove(
		warRoomId: number,
		fileId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/datastore/${fileId}`,
			options
		);
	}
}
