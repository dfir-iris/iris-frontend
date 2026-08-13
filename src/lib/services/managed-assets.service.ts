import { browser } from '$app/environment';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import { auth } from '$lib/stores/auth.store';
import { AuthService } from './auth.service';
import type {
	ApplyManagedAssetImportBody,
	CreateManagedAssetBody,
	ExportManagedAssetsBody,
	ManagedAsset,
	ManagedAssetAuditEntry,
	ManagedAssetDetail,
	ManagedAssetImportReport,
	ManagedAssetListParams,
	ManagedAssetPage,
	ManagedAssetSighting,
	ManagedAssetTimelineEntry,
	ReconcileManagedAssetsResponse,
	SightingKind,
	TransferFormat,
	UpdateManagedAssetBody
} from '$lib/types/resources/managed-asset';

const BASE = '/api/v2/manage/managed-assets';

const EXPORT_FALLBACK_NAME = 'managed-assets.csv';

/** A generated export: `blob` is the file, `filename` comes from the server. */
export interface ManagedAssetDownload {
	blob: Blob;
	filename: string;
}

export interface ManagedAssetTransferFailure {
	message: string;
	status: number;
}

export type ManagedAssetTransferResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: ManagedAssetTransferFailure };

export interface SightingsParams {
	kind?: SightingKind;
	page?: number;
	per_page?: number;
}

export interface PageParams {
	page?: number;
	per_page?: number;
}

// The export (binary body) and the import (multipart body) both bypass
// ApiService, which forces `Content-Type: application/json` outbound and
// parses JSON inbound. Its auth behaviour is still wanted, so the pre-flight
// refresh and the bearer header are reproduced here — same shape as
// case-transfer.service.ts, which faces the same two-way mismatch.
const authorizedFetch = async (
	url: string,
	init: RequestInit & { headers: Record<string, string> }
): Promise<Response> => {
	if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
		await AuthService.refreshToken();
	}

	const token = auth.getAccessToken();
	if (token) init.headers.Authorization = `Bearer ${token}`;

	const base = browser ? (ApiService.baseUrl ?? '').replace(/\/$/, '') : '';
	return fetch(`${base}${url}`, init);
};

// Failures from these endpoints are `{message, data?}` JSON even when the
// success path is a file download, so both branches read errors the same way.
const readFailure = async (response: Response): Promise<ManagedAssetTransferFailure> => {
	let message = `Request failed (HTTP ${response.status})`;

	try {
		if ((response.headers.get('content-type') ?? '').includes('application/json')) {
			const body = (await response.json()) as { message?: string };
			if (body?.message) message = body.message;
		}
	} catch {
		// Keep the generic message — an unparseable error body is still an error.
	}

	return { message, status: response.status };
};

const filenameFrom = (response: Response): string => {
	const disposition = response.headers.get('Content-Disposition');
	if (!disposition) return EXPORT_FALLBACK_NAME;

	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
	if (!match) return EXPORT_FALLBACK_NAME;

	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
};

export class ManagedAssetsService {
	/**
	 * Page through the registry.
	 *
	 * Repeatable filters (`client_id`, `criticality`, `tag`, …) are arrays and
	 * serialise as repeated keys, which is what the backend reads with
	 * `getlist`. Every sighting-derived number in the response covers only the
	 * cases and alerts the caller can open; `scope.restricted` says whether
	 * that filtering was applied.
	 */
	static async list(
		params: ManagedAssetListParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetPage<ManagedAsset>>> {
		return ApiService.get<ManagedAssetPage<ManagedAsset>>(
			ApiService.withQuery(BASE, params as Record<string, unknown>),
			options
		);
	}

	static async get(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetDetail>> {
		return ApiService.get<ManagedAssetDetail>(`${BASE}/${id}`, options);
	}

	static async create(
		body: CreateManagedAssetBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetDetail>> {
		return ApiService.post<ManagedAssetDetail, CreateManagedAssetBody>(BASE, body, options);
	}

	/**
	 * Partial update. `client_id` and `asset_type_id` are absent from the body
	 * type on purpose: they are half of the dedup identity and the server
	 * strips them rather than silently re-homing the asset.
	 */
	static async update(
		id: number,
		body: UpdateManagedAssetBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetDetail>> {
		return ApiService.put<ManagedAssetDetail, UpdateManagedAssetBody>(
			`${BASE}/${id}`,
			body,
			options
		);
	}

	/** Delete the registry entry. Case and alert observations are untouched. */
	static async remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/${id}`, options);
	}

	/** Where the asset has been seen, restricted to visible cases and alerts. */
	static async sightings(
		id: number,
		params: SightingsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetPage<ManagedAssetSighting>>> {
		return ApiService.get<ManagedAssetPage<ManagedAssetSighting>>(
			ApiService.withQuery(`${BASE}/${id}/sightings`, params as Record<string, unknown>),
			options
		);
	}

	/** Timeline events referencing the asset, in cases the caller can open. */
	static async timeline(
		id: number,
		params: PageParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetPage<ManagedAssetTimelineEntry>>> {
		return ApiService.get<ManagedAssetPage<ManagedAssetTimelineEntry>>(
			ApiService.withQuery(`${BASE}/${id}/timeline`, params as Record<string, unknown>),
			options
		);
	}

	/** Change log for the asset — who changed what, and when. */
	static async audit(
		id: number,
		params: PageParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetPage<ManagedAssetAuditEntry>>> {
		return ApiService.get<ManagedAssetPage<ManagedAssetAuditEntry>>(
			ApiService.withQuery(`${BASE}/${id}/audit`, params as Record<string, unknown>),
			options
		);
	}

	/**
	 * Change log across the whole visible registry.
	 *
	 * Deletions only appear here: an entry's asset id is nulled when the asset
	 * goes, so the per-asset log has nothing left to look up.
	 */
	static async auditLog(
		params: PageParams & { client_id?: number[] } = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetPage<ManagedAssetAuditEntry>>> {
		return ApiService.get<ManagedAssetPage<ManagedAssetAuditEntry>>(
			ApiService.withQuery(`${BASE}/audit`, params as Record<string, unknown>),
			options
		);
	}

	/**
	 * Download the registry as CSV or JSON.
	 *
	 * POST rather than GET: the filter payload names customers and hostnames,
	 * and a GET would leave all of it in access logs, proxies and browser
	 * history. Only rows the caller can see are exported.
	 */
	static async exportAssets(
		body: ExportManagedAssetsBody = {}
	): Promise<ManagedAssetTransferResult<ManagedAssetDownload>> {
		const response = await authorizedFetch(`${BASE}/export`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: '*/*' },
			body: JSON.stringify(body)
		});

		if (!response.ok) return { ok: false, error: await readFailure(response) };

		return {
			ok: true,
			value: { blob: await response.blob(), filename: filenameFrom(response) }
		};
	}

	/**
	 * Stage an uploaded file and report what importing it would do. Writes
	 * nothing: the returned `staging_token` is what turns the report into
	 * registry rows.
	 *
	 * The customer comes from `clientId` here and is pinned to the staged
	 * upload — a `client_name` column in the file is informational only and
	 * cannot retarget the import.
	 */
	static async importInspect(
		file: File,
		clientId: number,
		format: TransferFormat = 'csv'
	): Promise<ManagedAssetTransferResult<ManagedAssetImportReport>> {
		const form = new FormData();
		form.append('file', file, file.name);
		form.append('client_id', String(clientId));
		form.append('format', format);

		const response = await authorizedFetch(`${BASE}/import/inspect`, {
			method: 'POST',
			headers: { Accept: 'application/json' },
			body: form
		});

		if (!response.ok) return { ok: false, error: await readFailure(response) };

		// v2 success bodies are the payload itself — there is no `data` envelope.
		return { ok: true, value: (await response.json()) as ManagedAssetImportReport };
	}

	/** Apply a staged import. Customer access is re-checked at this point. */
	static async importApply(
		body: ApplyManagedAssetImportBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedAssetImportReport>> {
		return ApiService.post<ManagedAssetImportReport, ApplyManagedAssetImportBody>(
			`${BASE}/import`,
			body,
			options
		);
	}

	/**
	 * Throw a staged upload away. Staging expires on its own, but an operator
	 * who backs out of the wizard shouldn't leave their file on the server
	 * until then.
	 */
	static async importDiscard(
		token: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/import/${token}`, options);
	}

	/**
	 * Backfill registry entries for assets already present in the customer's
	 * cases and alerts. Idempotent, and never removes anything.
	 */
	static async reconcile(
		clientId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ReconcileManagedAssetsResponse>> {
		return ApiService.post<ReconcileManagedAssetsResponse, { client_id: number }>(
			`${BASE}/reconcile`,
			{ client_id: clientId },
			options
		);
	}

	/** Hand a generated export to the browser's downloader. */
	static saveFile({ blob, filename }: ManagedAssetDownload): void {
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
