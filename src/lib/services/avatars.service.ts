/**
 * Avatar service.
 *
 * `avatarUrl(userId)` returns the canonical URL for any user's
 * avatar — the same URL whether the bytes exist or not. The
 * `UserAvatar` component uses `<AvatarImage>` whose error fallback
 * fires on the 404 returned for users without an upload, so this
 * doesn't need to know upfront which users have set one.
 *
 * `uploadMyAvatar(file)` and `removeMyAvatar()` go through the
 * `/api/v2/me/avatar` endpoints. Upload bypasses the JSON-serialising
 * `ApiService.post` because the backend expects a `multipart/form-data`
 * body with an `avatar` field; the bearer token is still pulled from
 * the auth store so the request stays authenticated.
 */
import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth.store';
import { apiOrigin } from '$lib/config/api.config';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AvatarUpdateResponse = {
	user_id: number;
	avatar_updated_at: string;
	mime: string;
};

const apiBaseUrl = (): string => apiOrigin();

/**
 * Canonical avatar URL for a user. Append `v=<updatedAt>` when the
 * caller knows the avatar revision so the browser cache busts on
 * upload. When `updatedAt` is missing we just emit the bare URL —
 * the response carries `Cache-Control: must-revalidate` so a stale
 * cached blob is short-lived anyway.
 */
export function avatarUrl(userId: number | null | undefined, updatedAt?: string | null): string {
	if (userId == null) return '';
	const base = `${apiBaseUrl()}/api/v2/users/${userId}/avatar`;
	if (!updatedAt) return base;
	return `${base}?v=${encodeURIComponent(updatedAt)}`;
}

export class AvatarsService {
	static async uploadMyAvatar(
		file: File,
		options: ApiOptions = {}
	): Promise<RequestResponse<AvatarUpdateResponse>> {
		if (!browser) {
			return {
				status: 0,
				data: null,
				ok: false,
				error: { message: 'Avatar upload requires a browser', type: 'invalid', status: 0 }
			};
		}

		const form = new FormData();
		form.append('avatar', file, file.name);

		const accessToken = auth.getAccessToken();
		const headers: Record<string, string> = {};
		if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

		try {
			// No `credentials: 'include'` — we authenticate purely
			// with the bearer token attached above. Including
			// credentials would force the backend to set
			// `Access-Control-Allow-Credentials: true` *and* echo a
			// specific origin (no `*`), which it doesn't, and the
			// browser would block the request as a CORS failure.
			const response = await fetch(`${apiBaseUrl()}/api/v2/me/avatar`, {
				method: 'POST',
				body: form,
				headers,
				...((options as { signal?: AbortSignal }).signal
					? { signal: (options as { signal?: AbortSignal }).signal }
					: {})
			});

			const responseHeaders: Record<string, string> = {};
			response.headers.forEach((v, k) => (responseHeaders[k] = v));

			let body: unknown = null;
			try {
				body = await response.json();
			} catch {
				body = null;
			}

			const ok = response.ok;
			const envelope = body as { data?: AvatarUpdateResponse; message?: string } | null;
			return {
				status: response.status,
				data: envelope?.data ?? (envelope as unknown as AvatarUpdateResponse) ?? null,
				ok,
				error: ok
					? undefined
					: {
							message: envelope?.message ?? `Avatar upload failed (${response.status})`,
							type: 'api-error',
							status: response.status
						}
			};
		} catch (err) {
			return {
				status: 0,
				data: null,
				ok: false,
				error: {
					message: err instanceof Error ? err.message : 'Network error',
					type: 'network',
					status: 0
				}
			};
		}
	}

	static async removeMyAvatar(options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>('/me/avatar', options);
	}
}
