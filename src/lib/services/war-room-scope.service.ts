/**
 * War-room Scope — the assets and IOCs of every attached case the caller
 * can read, in one place, plus the war-room staging inbox (objects spotted
 * at war-room level that do not belong to a case yet).
 *
 * Every write fans out per case on the server and reports one result row
 * per (object, case) pair, so a partial failure (a case the caller only
 * has read access to, a duplicate…) never aborts the rest of the batch.
 */
import { browser } from '$app/environment';
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type {
	ExploitationStatus,
	RemediationStatus,
	VulnerabilitySeverity
} from './vulnerabilities.service';
import { auth } from '$lib/stores/auth.store';
import { SCOPE_MAX_TARGET_CASES, chunkIds, mergeCaseBatchResults } from './war-room-scope-batches';
import { AuthService } from './auth.service';

/** An attached case the caller can read (the server never lists the others). */
export interface ScopeCase {
	case_id: number;
	case_name: string;
	customer_id: number | null;
	customer_name: string | null;
	accessible: true;
}

export interface ScopeCustomer {
	customer_id: number;
	customer_name: string;
}

/** One vulnerability finding recorded on a scope asset. */
export interface ScopeAssetVulnerability {
	finding_id: number;
	vulnerability_id: number;
	identifier: string;
	severity: VulnerabilitySeverity;
	kev: boolean;
	remediation_status: RemediationStatus;
	exploitation_status: ExploitationStatus;
}

export interface ScopeAsset {
	asset_id: number;
	asset_uuid: string | null;
	asset_name: string;
	asset_type_id: number;
	asset_type_name: string | null;
	asset_ip: string | null;
	asset_domain: string | null;
	asset_description: string | null;
	asset_tags: string | null;
	asset_compromise_status_id: number | null;
	analysis_status_id: number | null;
	analysis_status_name: string | null;
	stage_id: number | null;
	stage_reason: string | null;
	stage_decision_id: number | null;
	stage_updated_at: string | null;
	case_id: number;
	case_name: string;
	customer_id: number | null;
	customer_name: string | null;
	ioc_count: number;
	date_update: string | null;
	/** Vulnerability findings of this case asset. */
	vuln_open_count: number;
	vuln_total_count: number;
	vuln_exploited_count: number;
	vuln_exploited_open_count: number;
	/** Worst severity among the open findings, `null` without any. */
	vuln_max_severity: VulnerabilitySeverity | null;
	/** Every finding of the asset (any status), worst severity first. */
	vulnerabilities: ScopeAssetVulnerability[];
	/** `${asset_type_id}:${lowercased name}` — same asset seen in several cases. */
	group_key: string;
	/**
	 * Paginated listing only: the other readable attached cases holding an
	 * asset of the same type and name (capped list, full count).
	 */
	sighting_case_ids?: number[];
	sighting_count?: number;
}

export interface ScopeIoc {
	ioc_id: number;
	ioc_value: string;
	ioc_type_id: number;
	ioc_type_name: string | null;
	ioc_tlp_id: number | null;
	tlp_name: string | null;
	ioc_description: string | null;
	ioc_tags: string | null;
	case_id: number;
	case_name: string;
	customer_id: number | null;
	customer_name: string | null;
	/** `${ioc_type_id}:${value}` — same IOC seen in several cases. */
	group_key: string;
}

export interface ScopeList<T> {
	data: T[];
	truncated: boolean;
	limit: number;
	cases: ScopeCase[];
	/** Set when a `page` was requested. */
	total?: number;
	page?: number;
	per_page?: number;
	sort?: string;
}

/** Totals of one case over every asset matching the filters. */
export interface ScopeAssetCaseTotals {
	case_id: number;
	assets: number;
	done: number;
	vuln_open: number;
	vuln_exploited_open: number;
}

export interface ScopeAssetStageTotals {
	/** null = assets without a stage. */
	stage_id: number | null;
	assets: number;
}

export interface ScopeAssetPage extends ScopeList<ScopeAsset> {
	total?: number;
	case_totals?: ScopeAssetCaseTotals[];
	stage_totals?: ScopeAssetStageTotals[];
}

export interface ScopeIocPage extends ScopeList<ScopeIoc> {
	/** Distinct indicators per case. */
	case_totals?: { case_id: number; iocs: number }[];
}

export interface ScopePageQuery {
	/** 1-based; omitted = unpaginated listing capped at the server limit. */
	page?: number;
	per_page?: number;
}

export interface ScopeAssetsQuery extends ScopePageQuery {
	q?: string;
	/** A stage id, or `'none'` for assets without a stage. */
	stage_id?: number | 'none';
	case_id?: number;
	compromised?: boolean;
	/** Open findings, exploited findings, or no open finding. */
	vulnerable?: 'open' | 'exploited' | 'none';
	/** A vulnerability identifier or alias: assets with a finding on it. */
	vulnerability?: string;
	/** With `page`: by name (default) or by case. */
	sort?: 'name' | 'case';
}

export interface ScopeIocsQuery extends ScopePageQuery {
	q?: string;
	case_id?: number;
	/** With `page`: by value (default) or seen in the most cases first. */
	sort?: 'value' | 'spread';
}

export interface ScopeAssetInput {
	asset_name: string;
	asset_type_id: number;
	asset_description?: string;
	asset_ip?: string;
	asset_domain?: string;
	asset_tags?: string;
	asset_compromise_status_id?: number;
	analysis_status_id?: number;
}

export interface ScopeIocInput {
	ioc_value: string;
	ioc_type_id: number;
	ioc_tlp_id?: number;
	ioc_description?: string;
	ioc_tags?: string;
}

export type ScopeResultStatus = 'created' | 'exists' | 'error' | 'denied';

export interface ScopeCreateResult {
	case_id: number;
	status: ScopeResultStatus;
	asset_id?: number;
	ioc_id?: number;
	message?: string;
}

export interface ScopeCreateResponse {
	results: ScopeCreateResult[];
	customers: ScopeCustomer[];
}

export interface ScopePushResult {
	case_id: number;
	status: ScopeResultStatus;
	asset_id?: number;
	ioc_id?: number;
	new_asset_id?: number;
	new_ioc_id?: number;
	message?: string;
}

export interface ScopePushResponse {
	results: ScopePushResult[];
	customers: ScopeCustomer[];
}

export interface ScopeCreateAssetBody {
	asset: ScopeAssetInput;
	case_ids: number[];
	stage_id?: number;
	stage_reason?: string;
}

export interface ScopeCreateIocBody {
	ioc: ScopeIocInput;
	case_ids: number[];
}

export interface ScopeSetStageBody {
	asset_ids: number[];
	stage_id: number | null;
	reason?: string;
	decision_id?: number | null;
}

export type ScopeStageResultStatus = 'updated' | 'unchanged' | 'denied' | 'error';

export interface ScopeStageResult {
	asset_id: number;
	/** null when the asset does not exist. */
	case_id: number | null;
	status: ScopeStageResultStatus;
	message?: string;
}

export interface ScopeSetStageResponse {
	results: ScopeStageResult[];
}

export type StagedObjectType = 'asset' | 'ioc';

export interface StagedObject {
	id: number;
	object_type: StagedObjectType;
	payload: Record<string, unknown>;
	proposed_case_ids: number[] | null;
	note: string | null;
	source_message_id: number | null;
	created_at: string | null;
	created_by_id: number | null;
	created_by_name: string | null;
}

export interface StagedObjectCreateBody {
	object_type: StagedObjectType;
	payload: ScopeAssetInput | ScopeIocInput;
	proposed_case_ids?: number[];
	note?: string;
	source_message_id?: number;
}

export interface StagedObjectUpdateBody {
	payload?: ScopeAssetInput | ScopeIocInput;
	proposed_case_ids?: number[];
	note?: string | null;
}

/** Minimal decision reference, used to link a stage change to a decision. */
export interface ScopeDecisionRef {
	decision_id: number;
	ref: string;
	title: string;
	status: string;
}

export type ScopeExportFormat = 'txt' | 'csv' | 'stix';

export interface ScopeDownload {
	blob: Blob;
	filename: string;
}

export interface ScopeDownloadFailure {
	message: string;
	status: number;
}

export type ScopeDownloadResult =
	| { ok: true; value: ScopeDownload }
	| { ok: false; error: ScopeDownloadFailure };

const base = (warRoomId: number) => `/war-rooms/${warRoomId}/scope`;

/**
 * Send a per-case fan-out in batches of SCOPE_MAX_TARGET_CASES, one after
 * the other, and merge the per-case results. A batch refused as a whole
 * (network, 400…) does not lose the batches already applied: its cases
 * come back as `error` rows carrying the server message, and the next
 * batches are not sent.
 */
const runInCaseBatches = async <
	T extends { results: { case_id: number }[]; customers: ScopeCustomer[] }
>(
	caseIds: number[],
	send: (caseIds: number[]) => Promise<RequestResponse<T>>
): Promise<RequestResponse<T>> => {
	const batches = chunkIds(caseIds, SCOPE_MAX_TARGET_CASES);
	if (batches.length <= 1) return send(caseIds);
	const done: T[] = [];
	for (let i = 0; i < batches.length; i++) {
		const res = await send(batches[i]);
		if (res.ok && res.data && typeof res.data === 'object') {
			done.push(res.data as T);
			continue;
		}
		if (done.length === 0) return res;
		const message = res.error?.message || 'The server refused the request.';
		const failed = batches.slice(i).flat();
		const merged = mergeCaseBatchResults(done) as T;
		merged.results = [
			...merged.results,
			...failed.map((case_id) => ({ case_id, status: 'error' as const, message }))
		] as T['results'];
		return { status: 200, ok: true, data: merged };
	}
	return { status: 200, ok: true, data: mergeCaseBatchResults(done) as T };
};

const EXPORT_FALLBACK_NAME: Record<ScopeExportFormat, string> = {
	txt: 'blocklist.txt',
	csv: 'iocs.csv',
	stix: 'iocs-stix.json'
};

// The export is a file, which ApiService cannot hand back (it parses JSON or
// text). Auth is reproduced the same way as managed-assets.service.ts so the
// download goes through the bearer token instead of an unauthenticated link.
// `null` = no response at all (offline, DNS, TLS) — fetch rejects then.
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

		const origin = browser ? (ApiService.baseUrl ?? '').replace(/\/$/, '') : '';
		return await fetch(`${origin}${url}`, init);
	} catch {
		return null;
	}
};

const readFailure = async (response: Response): Promise<ScopeDownloadFailure> => {
	let message = `Request failed (HTTP ${response.status})`;
	try {
		if ((response.headers.get('content-type') ?? '').includes('application/json')) {
			const body = (await response.json()) as { message?: string };
			if (body?.message) message = body.message;
		}
	} catch {
		// Keep the generic message.
	}
	return { message, status: response.status };
};

const filenameFrom = (response: Response, fallback: string): string => {
	const disposition = response.headers.get('Content-Disposition');
	if (!disposition) return fallback;
	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
	if (!match) return fallback;
	try {
		return decodeURIComponent(match[1]);
	} catch {
		return match[1];
	}
};

export class WarRoomScopeService {
	static listAssets(
		warRoomId: number,
		query: ScopeAssetsQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeAssetPage>> {
		const q = query.q?.trim();
		return ApiService.get(
			ApiService.withQuery(`${base(warRoomId)}/assets`, {
				q: q ? q : undefined,
				stage_id: query.stage_id,
				case_id: query.case_id,
				compromised: query.compromised ? 1 : undefined,
				vulnerable: query.vulnerable,
				vulnerability: query.vulnerability?.trim() || undefined,
				page: query.page,
				per_page: query.page ? query.per_page : undefined,
				sort: query.page ? query.sort : undefined
			}),
			options
		);
	}

	static listIocs(
		warRoomId: number,
		query: ScopeIocsQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeIocPage>> {
		const q = query.q?.trim();
		return ApiService.get(
			ApiService.withQuery(`${base(warRoomId)}/iocs`, {
				q: q ? q : undefined,
				case_id: query.case_id,
				page: query.page,
				per_page: query.page ? query.per_page : undefined,
				sort: query.page ? query.sort : undefined
			}),
			options
		);
	}

	// The server takes at most SCOPE_MAX_TARGET_CASES target cases per
	// request: larger fan-outs are sent as sequential batches and the
	// per-case results concatenated (see runInCaseBatches).
	static createAsset(
		warRoomId: number,
		body: ScopeCreateAssetBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeCreateResponse>> {
		return runInCaseBatches(body.case_ids, (case_ids) =>
			ApiService.post<ScopeCreateResponse>(
				`${base(warRoomId)}/assets`,
				{ ...body, case_ids },
				options
			)
		);
	}

	static pushAssets(
		warRoomId: number,
		body: { asset_ids: number[]; case_ids: number[] },
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopePushResponse>> {
		return runInCaseBatches(body.case_ids, (case_ids) =>
			ApiService.post<ScopePushResponse>(
				`${base(warRoomId)}/assets/push`,
				{ ...body, case_ids },
				options
			)
		);
	}

	static createIoc(
		warRoomId: number,
		body: ScopeCreateIocBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeCreateResponse>> {
		return runInCaseBatches(body.case_ids, (case_ids) =>
			ApiService.post<ScopeCreateResponse>(
				`${base(warRoomId)}/iocs`,
				{ ...body, case_ids },
				options
			)
		);
	}

	static pushIocs(
		warRoomId: number,
		body: { ioc_ids: number[]; case_ids: number[] },
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopePushResponse>> {
		return runInCaseBatches(body.case_ids, (case_ids) =>
			ApiService.post<ScopePushResponse>(
				`${base(warRoomId)}/iocs/push`,
				{ ...body, case_ids },
				options
			)
		);
	}

	static setStage(
		warRoomId: number,
		body: ScopeSetStageBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeSetStageResponse>> {
		return ApiService.post(`${base(warRoomId)}/assets/stage`, body, options);
	}

	static listStaging(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<StagedObject[]>> {
		return ApiService.get(`${base(warRoomId)}/staging`, options);
	}

	static createStaged(
		warRoomId: number,
		body: StagedObjectCreateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<StagedObject>> {
		return ApiService.post(`${base(warRoomId)}/staging`, body, options);
	}

	static updateStaged(
		warRoomId: number,
		stagedId: number,
		body: StagedObjectUpdateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<StagedObject>> {
		return ApiService.patch(`${base(warRoomId)}/staging/${stagedId}`, body, options);
	}

	static removeStaged(
		warRoomId: number,
		stagedId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${base(warRoomId)}/staging/${stagedId}`, options);
	}

	/** Push a staged row; without `case_ids` the server uses its proposed targets. */
	static pushStaged(
		warRoomId: number,
		stagedId: number,
		caseIds?: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeCreateResponse>> {
		return ApiService.post(
			`${base(warRoomId)}/staging/${stagedId}/push`,
			caseIds ? { case_ids: caseIds } : {},
			options
		);
	}

	/** Decisions of the room, to link a stage change to one. */
	static listDecisionRefs(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<ScopeDecisionRef[]>> {
		return ApiService.get(`/war-rooms/${warRoomId}/decisions`, options);
	}

	static exportIocsPath(warRoomId: number, format: ScopeExportFormat, includeRed = false): string {
		return ApiService.withQuery(`/api/v2${base(warRoomId)}/iocs/export`, {
			format,
			include_red: includeRed ? 1 : undefined
		});
	}

	/** Download the blocklist of every IOC the caller can see (deduplicated). */
	static async exportIocs(
		warRoomId: number,
		format: ScopeExportFormat,
		includeRed = false
	): Promise<ScopeDownloadResult> {
		const response = await authorizedFetch(
			WarRoomScopeService.exportIocsPath(warRoomId, format, includeRed),
			{ method: 'GET', headers: { Accept: '*/*' } }
		);

		if (!response) return { ok: false, error: { message: 'Network request failed', status: 0 } };
		if (!response.ok) return { ok: false, error: await readFailure(response) };

		return {
			ok: true,
			value: {
				blob: await response.blob(),
				filename: filenameFrom(response, EXPORT_FALLBACK_NAME[format])
			}
		};
	}

	/** Hand a downloaded file to the browser's downloader. */
	static saveFile({ blob, filename }: ScopeDownload): void {
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
