import { browser } from '$app/environment';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import { auth } from '$lib/stores/auth.store';
import { AuthService } from './auth.service';
import type {
	ApplyImportBody,
	BundleInspection,
	ExportCaseBody,
	ImportedCase
} from '$lib/types/resources/case-transfer';

/** Outcome of an export. `blob` is the archive; `filename` comes from the server. */
export interface ArchiveDownload {
	blob: Blob;
	filename: string;
}

export interface CaseTransferFailure {
	message: string;
	status: number;
	/**
	 * Set by `inspect` when the upload turned out to be an encrypted archive and
	 * no passphrase was supplied. The caller should prompt and retry rather than
	 * telling the operator their passphrase was wrong.
	 */
	encrypted?: boolean;
}

export type CaseTransferResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: CaseTransferFailure };

const ARCHIVE_FALLBACK_NAME = 'case-export.iris';

// Binary and multipart requests both bypass ApiService, which forces
// `Content-Type: application/json` on the way out and parses JSON on the way
// back. We still want its auth behaviour, so the pre-flight refresh and the
// bearer header are reproduced here — same shape as the Datastore panel's
// upload path in case-datastore.service.ts.
// Returns `null` when the request never produced a response at all — the
// browser is offline, DNS failed, the TLS handshake was rejected. `fetch`
// signals that by REJECTING, not by an `ok: false` response, so without this
// catch the rejection escapes every caller below (none of which are awaited
// inside a try) and lands in `window.onerror` as an uncaught
// "TypeError: Failed to fetch". ApiService swallows this case for JSON
// requests; these binary/multipart paths bypass it and have to do it here.
const authorizedFetch = async (
	url: string,
	init: RequestInit & { headers: Record<string, string> }
): Promise<Response | null> => {
	try {
		if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
			await AuthService.refreshToken();
		}

		const token = auth.getAccessToken();
		if (token) init.headers.Authorization = `Bearer ${token}`;

		const base = browser ? (ApiService.baseUrl ?? '').replace(/\/$/, '') : '';
		return await fetch(`${base}${url}`, init);
	} catch {
		return null;
	}
};

// `status: 0` mirrors what ApiService reports for a network-level failure, so
// callers that branch on status see one convention across both paths.
const NETWORK_FAILURE: CaseTransferFailure = {
	message: 'Network request failed',
	status: 0
};

// Errors from these endpoints are `{message, data?}` JSON even when the success
// path is binary, so failures are read the same way regardless of which branch
// produced them.
const readFailure = async (response: Response): Promise<CaseTransferFailure> => {
	let message = `Request failed (HTTP ${response.status})`;
	let encrypted: boolean | undefined;

	try {
		if ((response.headers.get('content-type') ?? '').includes('application/json')) {
			const body = (await response.json()) as {
				message?: string;
				data?: { encrypted?: boolean };
			};
			if (body?.message) message = body.message;
			if (body?.data?.encrypted) encrypted = true;
		}
	} catch {
		// Keep the generic message — an unparseable error body is still an error.
	}

	return { message, status: response.status, encrypted };
};

const filenameFrom = (response: Response): string => {
	const disposition = response.headers.get('Content-Disposition');
	if (!disposition) return ARCHIVE_FALLBACK_NAME;

	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
	if (!match) return ARCHIVE_FALLBACK_NAME;

	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
};

export class CaseTransferService {
	/**
	 * Download a case as a transferable archive.
	 *
	 * POST rather than GET because the passphrase travels in the body — a GET
	 * would leave it in access logs, proxies and browser history.
	 */
	static async exportCase(
		caseId: number,
		body: ExportCaseBody = {}
	): Promise<CaseTransferResult<ArchiveDownload>> {
		const response = await authorizedFetch(`/api/v2/cases/${caseId}/export`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: '*/*' },
			body: JSON.stringify(body)
		});

		if (!response) return { ok: false, error: NETWORK_FAILURE };
		if (!response.ok) return { ok: false, error: await readFailure(response) };

		return {
			ok: true,
			value: { blob: await response.blob(), filename: filenameFrom(response) }
		};
	}

	/**
	 * Stage an uploaded archive and report what importing it would do. Writes
	 * nothing: the returned `staging_token` is what turns the report into a case.
	 *
	 * A `CaseTransferFailure` with `encrypted: true` means the archive is sealed
	 * and needs a passphrase — prompt and call this again.
	 */
	static async inspect(
		archive: File,
		passphrase?: string
	): Promise<CaseTransferResult<BundleInspection>> {
		const form = new FormData();
		form.append('archive', archive, archive.name);
		if (passphrase) form.append('passphrase', passphrase);

		const response = await authorizedFetch('/api/v2/cases/import/inspect', {
			method: 'POST',
			headers: { Accept: 'application/json' },
			body: form
		});

		if (!response) return { ok: false, error: NETWORK_FAILURE };
		if (!response.ok) return { ok: false, error: await readFailure(response) };

		return { ok: true, value: (await response.json()) as BundleInspection };
	}

	/** Turn a staged archive into a real case. */
	static async apply(
		body: ApplyImportBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ImportedCase>> {
		return ApiService.post<ImportedCase>('/api/v2/cases/import', body, options);
	}

	/**
	 * Throw a staged archive away. Staging directories expire on their own, but
	 * an operator who backs out of the wizard shouldn't have to leave a
	 * decrypted copy of their case sitting on the server until then.
	 */
	static async discard(token: string, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/import/${token}`, options);
	}

	/** Hand the downloaded archive to the browser's downloader. */
	static saveArchive({ blob, filename }: ArchiveDownload): void {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(url);
	}
}
