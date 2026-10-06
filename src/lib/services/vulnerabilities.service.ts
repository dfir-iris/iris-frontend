/**
 * Vulnerabilities — an instance-wide catalogue (CVEs, advisories, and
 * private `IRIS-VULN-YYYY-NNNN` entries that never leave the instance)
 * plus findings: a catalogue entry recorded against a case asset or a
 * registry (managed) asset, with its remediation and exploitation status.
 *
 * Catalogue counts and exposure only ever cover the cases the caller can
 * read, plus the registry assets they can see.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export const VULNERABILITY_KINDS = [
	'cve',
	'advisory',
	'misconfiguration',
	'weak-credentials',
	'exposed-service',
	'design-flaw',
	'zero-day',
	'other'
] as const;
export type VulnerabilityKind = (typeof VULNERABILITY_KINDS)[number];

export const VULNERABILITY_SEVERITIES = [
	'critical',
	'high',
	'medium',
	'low',
	'none',
	'unknown'
] as const;
export type VulnerabilitySeverity = (typeof VULNERABILITY_SEVERITIES)[number];

export const EXPLOIT_MATURITIES = ['unknown', 'none', 'poc', 'weaponized', 'in-the-wild'] as const;
export type ExploitMaturity = (typeof EXPLOIT_MATURITIES)[number];

export const PATCH_AVAILABILITIES = ['unknown', 'patch', 'workaround', 'none'] as const;
export type PatchAvailability = (typeof PATCH_AVAILABILITIES)[number];

export const FINDING_OPEN_STATUSES = ['under-analysis', 'affected', 'mitigated'] as const;
export const FINDING_FIXED_STATUSES = ['patched', 'verified'] as const;
export const FINDING_DISMISSED_STATUSES = [
	'not-affected',
	'risk-accepted',
	'false-positive'
] as const;
export const FINDING_REMEDIATION_STATUSES = [
	...FINDING_OPEN_STATUSES,
	...FINDING_FIXED_STATUSES,
	...FINDING_DISMISSED_STATUSES
] as const;
export type RemediationStatus = (typeof FINDING_REMEDIATION_STATUSES)[number];
export type FindingStatusGroup = 'open' | 'fixed' | 'dismissed';

export const FINDING_EXPLOITATION_STATUSES = [
	'unknown',
	'not-exploited',
	'attempted',
	'suspected',
	'exploited'
] as const;
export type ExploitationStatus = (typeof FINDING_EXPLOITATION_STATUSES)[number];

/** CISA VEX justifications, required (or a reason) for `not-affected`. */
export const NOT_AFFECTED_JUSTIFICATIONS = [
	'component_not_present',
	'vulnerable_code_not_present',
	'vulnerable_code_not_in_execute_path',
	'vulnerable_code_cannot_be_controlled_by_adversary',
	'inline_mitigations_already_exist'
] as const;
export type NotAffectedJustification = (typeof NOT_AFFECTED_JUSTIFICATIONS)[number];

export const PRIVATE_IDENTIFIER_PREFIX = 'IRIS-VULN-';

export function findingStatusGroup(status: RemediationStatus | string): FindingStatusGroup {
	if ((FINDING_FIXED_STATUSES as readonly string[]).includes(status)) return 'fixed';
	if ((FINDING_DISMISSED_STATUSES as readonly string[]).includes(status)) return 'dismissed';
	return 'open';
}

/** Statuses that need a `status_reason`. */
export function remediationNeedsReason(status: RemediationStatus | string): boolean {
	return status === 'risk-accepted' || status === 'false-positive';
}

export interface VulnerabilityCounts {
	findings: number;
	open: number;
	fixed: number;
	dismissed: number;
	exploited: number;
	cases: number;
	registry_assets: number;
}

export interface AffectedProduct {
	vendor?: string | null;
	product?: string | null;
	versions?: string | null;
}

export interface Vulnerability {
	vulnerability_id: number;
	vulnerability_uuid: string | null;
	identifier: string;
	is_private: boolean;
	kind: VulnerabilityKind;
	title: string;
	description: string | null;
	cvss_version: string | null;
	cvss_vector: string | null;
	cvss_score: number | null;
	severity: VulnerabilitySeverity;
	epss_score: number | null;
	epss_percentile: number | null;
	epss_date: string | null;
	kev: boolean;
	kev_date_added: string | null;
	kev_due_date: string | null;
	kev_ransomware: boolean;
	exploit_maturity: ExploitMaturity;
	patch_availability: PatchAvailability;
	cwes: string[];
	affected_products: AffectedProduct[];
	reference_urls: string[];
	published_at: string | null;
	modified_at: string | null;
	tlp_id: number | null;
	tags: string | null;
	source: 'manual' | 'module' | 'import';
	enrichment: Record<string, unknown> | null;
	aliases: string[];
	created_at: string | null;
	updated_at: string | null;
	created_by_id: number | null;
	created_by_name: string | null;
	updated_by_id: number | null;
	updated_by_name: string | null;
	counts?: VulnerabilityCounts;
}

/** The catalogue fields a finding embeds. */
export interface VulnerabilityShort {
	vulnerability_id: number;
	identifier: string;
	is_private: boolean;
	kind: VulnerabilityKind;
	title: string;
	cvss_score: number | null;
	cvss_version: string | null;
	severity: VulnerabilitySeverity;
	epss_score: number | null;
	kev: boolean;
	exploit_maturity: ExploitMaturity;
	patch_availability: PatchAvailability;
}

export interface VulnerabilityInput {
	/** Public entries only; private entries get an allocated identifier. */
	identifier?: string;
	is_private?: boolean;
	kind?: VulnerabilityKind;
	title?: string;
	description?: string | null;
	cvss_vector?: string | null;
	cvss_version?: string | null;
	cvss_score?: number | null;
	/** `null` lets the server derive it from the CVSS score. */
	severity?: VulnerabilitySeverity | null;
	epss_score?: number | null;
	epss_percentile?: number | null;
	epss_date?: string | null;
	kev?: boolean;
	kev_date_added?: string | null;
	kev_due_date?: string | null;
	kev_ransomware?: boolean;
	exploit_maturity?: ExploitMaturity;
	patch_availability?: PatchAvailability;
	cwes?: string[];
	affected_products?: AffectedProduct[];
	reference_urls?: string[];
	published_at?: string | null;
	modified_at?: string | null;
	tlp_id?: number | null;
	tags?: string | null;
	aliases?: string[];
	/**
	 * Opaque provenance block. Send back the `enrichment` of a
	 * `cveLookup` when the form was filled from it, so later syncs know
	 * which values came from cve.org.
	 */
	enrichment?: Record<string, unknown> | null;
}

export interface VulnerabilitySearchQuery {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
	search?: string;
	severity?: VulnerabilitySeverity[];
	kind?: VulnerabilityKind[];
	kev?: boolean;
	private?: boolean;
	/** Only entries with an open finding in a readable case. */
	affected?: boolean;
}

export interface VulnerabilityPage {
	total: number;
	data: Vulnerability[];
	last_page: number;
	current_page: number;
	next_page: number | null;
}

export interface VulnerabilityExposureCase {
	case_id: number;
	case_name: string;
	customer_id: number | null;
	customer_name: string | null;
	case_closed: boolean;
	findings: number;
	open: number;
	fixed: number;
	dismissed: number;
	exploited: number;
}

export interface VulnerabilityExposureRegistry {
	finding_id: number;
	managed_asset_id: number;
	asset_name: string;
	customer_id: number | null;
	customer_name: string | null;
	criticality: string | null;
	remediation_status: RemediationStatus;
	exploitation_status: ExploitationStatus;
	due_date: string | null;
}

export interface VulnerabilityExposure {
	vulnerability_id: number;
	identifier: string;
	cases: VulnerabilityExposureCase[];
	registry: VulnerabilityExposureRegistry[];
	totals: {
		cases: number;
		case_findings: number;
		open: number;
		exploited: number;
		registry_assets: number;
	};
}

export interface VulnerabilityMergeResult extends Vulnerability {
	merge: { moved: number; dropped: number; source_identifier: string };
}

/** The catalogue fields a cve.org record fills. */
export interface CveLookupFields {
	kind: VulnerabilityKind;
	title: string;
	description: string | null;
	cvss_vector: string | null;
	cvss_version: string | null;
	cvss_score: number | null;
	severity: VulnerabilitySeverity | null;
	cwes: string[];
	affected_products: AffectedProduct[];
	reference_urls: string[];
	published_at: string | null;
	modified_at: string | null;
	kev: boolean;
	kev_date_added: string | null;
	exploit_maturity: ExploitMaturity;
}

/** A CVE fetched from cve.org; nothing is saved. */
export interface CveLookup {
	identifier: string;
	cve_id: string;
	state: string;
	assigner: string | null;
	date_published: string | null;
	date_updated: string | null;
	fields: CveLookupFields;
	/** Catalogue entry already holding this CVE (or as an alias). */
	existing_id: number | null;
	/** Opaque; send back as `enrichment` when creating from this lookup. */
	enrichment: Record<string, unknown>;
}

/** Catalogue fields a cve.org sync reports as updated or kept. */
export type CveSyncField =
	| 'title'
	| 'description'
	| 'cwes'
	| 'affected_products'
	| 'reference_urls'
	| 'published_at'
	| 'modified_at'
	| 'kev_date_added'
	| 'cvss'
	| 'kev'
	| 'exploit_maturity';

export interface VulnerabilitySyncReport {
	cve_id: string;
	state: string;
	assigner: string | null;
	date_published: string | null;
	date_updated: string | null;
	synced_at: string;
	/** Fields overwritten with the cve.org values. */
	updated_fields: (CveSyncField | string)[];
	/** Locally edited fields left alone (non-forced sync). */
	kept_fields: (CveSyncField | string)[];
}

export type VulnerabilityWithSync = Vulnerability & { sync: VulnerabilitySyncReport };

export interface FindingBase {
	finding_id: number;
	finding_uuid: string | null;
	vulnerability: VulnerabilityShort;
	remediation_status: RemediationStatus;
	status_group: FindingStatusGroup;
	not_affected_justification: NotAffectedJustification | null;
	status_reason: string | null;
	exploitation_status: ExploitationStatus;
	exploited_at: string | null;
	detection_source: string | null;
	detected_at: string | null;
	component: string | null;
	installed_version: string | null;
	fixed_version: string | null;
	notes: string | null;
	due_date: string | null;
	overdue: boolean;
	verified_at: string | null;
	verified_by_id: number | null;
	verification_method: string | null;
	owner_id: number | null;
	owner_name: string | null;
	created_at: string | null;
	updated_at: string | null;
	created_by_id: number | null;
	updated_by_id: number | null;
}

export interface CaseFinding extends FindingBase {
	scope: 'case';
	asset_id: number;
	asset_name: string;
	asset_type_id: number | null;
	asset_type_name: string | null;
	asset_compromise_status_id: number | null;
	case_id: number;
	case_name: string;
	decision_id: number | null;
	events?: { event_id: number; event_title: string; event_date: string | null }[];
	iocs?: { ioc_id: number; ioc_value: string; ioc_type_name: string | null }[];
}

export interface ManagedFinding extends FindingBase {
	scope: 'registry';
	managed_asset_id: number;
}

export interface FindingInput {
	/** Catalogue entry, or `identifier` for a quick add of a public one. */
	vulnerability_id?: number;
	identifier?: string;
	title?: string;
	remediation_status?: RemediationStatus;
	not_affected_justification?: NotAffectedJustification | null;
	status_reason?: string | null;
	exploitation_status?: ExploitationStatus;
	exploited_at?: string | null;
	detection_source?: string | null;
	detected_at?: string | null;
	component?: string | null;
	installed_version?: string | null;
	fixed_version?: string | null;
	notes?: string | null;
	due_date?: string | null;
	verified_at?: string | null;
	verification_method?: string | null;
	owner_id?: number | null;
	/** Case findings only. */
	decision_id?: number | null;
	event_ids?: number[];
	ioc_ids?: number[];
}

export interface CaseFindingCreateInput extends FindingInput {
	asset_ids?: number[];
	asset_id?: number;
}

export interface CaseFindingCreateResult {
	created: CaseFinding[];
	skipped_asset_ids: number[];
	vulnerability: VulnerabilityShort;
}

export interface FindingsQuery {
	asset_id?: number;
	vulnerability_id?: number;
	status?: RemediationStatus[];
	status_group?: FindingStatusGroup;
	exploitation?: ExploitationStatus[];
	severity?: VulnerabilitySeverity[];
	kev?: boolean;
	overdue?: boolean;
	search?: string;
}

export interface FindingsSummary {
	findings: number;
	open: number;
	fixed: number;
	dismissed: number;
	exploited_open: number;
	overdue: number;
	assets_open: number;
	vulnerabilities: number;
	kev_open: number;
	/** War-room matrix only: entries the room tracks, and those with no finding yet. */
	tracked?: number;
	tracked_unobserved?: number;
}

export interface CaseFindingList {
	findings: CaseFinding[];
	truncated: boolean;
	summary: FindingsSummary;
}

export interface ManagedFindingList {
	findings: ManagedFinding[];
	/** Findings of the case sightings of this asset the caller can see. */
	from_cases: CaseFinding[];
}

export interface FindingHistoryEntry {
	history_id: number;
	action: 'create' | 'update';
	changes: Record<string, unknown> | null;
	reason: string | null;
	decision_id: number | null;
	decision_number: number | null;
	decision_war_room_id: number | null;
	changed_by_id: number | null;
	changed_by_name: string | null;
	changed_at: string | null;
}

export interface VulnerabilityMatrixCounts {
	findings: number;
	open: number;
	fixed: number;
	dismissed: number;
	exploited: number;
}

export interface VulnerabilityMatrixRow {
	vulnerability: VulnerabilityShort;
	totals: VulnerabilityMatrixCounts & { cases: number };
	/** Keyed by `String(case_id)`. */
	cases: Record<string, VulnerabilityMatrixCounts>;
	/** Set when the war room tracks the entry, observed on an asset or not. */
	tracked: WarRoomTracking | null;
}

export interface WarRoomTracking {
	note: string | null;
	added_at: string | null;
	added_by_id: number | null;
	added_by_name: string | null;
}

export interface WarRoomTrackedVulnerability extends WarRoomTracking {
	vulnerability: VulnerabilityShort;
}

/** Track by catalogue id, or by identifier (quick add of a public entry). */
export interface WarRoomTrackInput {
	vulnerability_id?: number;
	identifier?: string;
	title?: string;
	note?: string | null;
}

/** One page of the war-room matrix, worst first. */
export interface VulnerabilityMatrix {
	vulnerabilities: VulnerabilityMatrixRow[];
	/** Over every attached case the caller can read, unfiltered. */
	summary: FindingsSummary;
	/** Per-case column totals over every filtered entry (all pages). */
	case_totals: Record<string, VulnerabilityMatrixCounts>;
	total: number;
	page: number;
	per_page: number;
}

export interface VulnerabilityMatrixQuery {
	page?: number;
	per_page?: number;
	/** Substring of the identifier or title. */
	search?: string;
	/** Only the entries found in this attached case. */
	case_id?: number | null;
	/** Only the entries the war room tracks. */
	tracked?: boolean;
}

function findingsQuery(query: FindingsQuery): Record<string, unknown> {
	const search = query.search?.trim();
	return {
		asset_id: query.asset_id,
		vulnerability_id: query.vulnerability_id,
		status: query.status?.length ? query.status.join(',') : undefined,
		status_group: query.status_group,
		exploitation: query.exploitation?.length ? query.exploitation.join(',') : undefined,
		severity: query.severity?.length ? query.severity.join(',') : undefined,
		kev: query.kev === undefined ? undefined : String(query.kev),
		overdue: query.overdue ? 'true' : undefined,
		search: search ? search : undefined
	};
}

const CATALOGUE = '/manage/vulnerabilities';
const caseBase = (caseId: number) => `/cases/${caseId}/vulnerabilities`;
const managedBase = (managedAssetId: number) =>
	`/manage/managed-assets/${managedAssetId}/vulnerabilities`;

export class VulnerabilitiesService {
	// ---- Catalogue ------------------------------------------------------

	static search(
		query: VulnerabilitySearchQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<VulnerabilityPage>> {
		const search = query.search?.trim();
		return ApiService.get(
			ApiService.withQuery(CATALOGUE, {
				page: query.page,
				per_page: query.per_page,
				order_by: query.order_by,
				sort_dir: query.sort_dir,
				search: search ? search : undefined,
				severity: query.severity?.length ? query.severity.join(',') : undefined,
				kind: query.kind?.length ? query.kind.join(',') : undefined,
				kev: query.kev === undefined ? undefined : String(query.kev),
				private: query.private === undefined ? undefined : String(query.private),
				affected: query.affected ? 'true' : undefined
			}),
			options
		);
	}

	/** The entry an identifier or alias designates, `null` when unknown. */
	static lookup(
		identifier: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<Vulnerability | null>> {
		return ApiService.get(ApiService.withQuery(`${CATALOGUE}/lookup`, { identifier }), options);
	}

	static get(id: number, options: ApiOptions = {}): Promise<RequestResponse<Vulnerability>> {
		return ApiService.get(`${CATALOGUE}/${id}`, options);
	}

	static create(
		body: VulnerabilityInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<Vulnerability>> {
		return ApiService.post(CATALOGUE, body, options);
	}

	static update(
		id: number,
		body: VulnerabilityInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<Vulnerability>> {
		return ApiService.put(`${CATALOGUE}/${id}`, body, options);
	}

	static remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${CATALOGUE}/${id}`, options);
	}

	/** Merge `id` into `targetId`: findings move, identifiers become aliases. */
	static merge(
		id: number,
		targetId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<VulnerabilityMergeResult>> {
		return ApiService.post(`${CATALOGUE}/${id}/merge`, { target_id: targetId }, options);
	}

	/** Fetch a CVE from cve.org without saving anything. */
	static cveLookup(
		identifier: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<CveLookup>> {
		return ApiService.get(ApiService.withQuery(`${CATALOGUE}/cve-lookup`, { identifier }), options);
	}

	/**
	 * Refresh a public CVE entry from cve.org. Without `force`, only empty
	 * fields and fields still equal to the previous sync are touched;
	 * `force` overwrites local edits and needs edit rights.
	 */
	static sync(
		id: number,
		force = false,
		options: ApiOptions = {}
	): Promise<RequestResponse<VulnerabilityWithSync>> {
		return ApiService.post(`${CATALOGUE}/${id}/sync`, { force }, options);
	}

	static exposure(
		id: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<VulnerabilityExposure>> {
		return ApiService.get(`${CATALOGUE}/${id}/exposure`, options);
	}

	// ---- Case findings --------------------------------------------------

	static listCase(
		caseId: number,
		query: FindingsQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseFindingList>> {
		return ApiService.get(ApiService.withQuery(caseBase(caseId), findingsQuery(query)), options);
	}

	static createCase(
		caseId: number,
		body: CaseFindingCreateInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseFindingCreateResult>> {
		return ApiService.post(caseBase(caseId), body, options);
	}

	static getCase(
		caseId: number,
		findingId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseFinding>> {
		return ApiService.get(`${caseBase(caseId)}/${findingId}`, options);
	}

	static updateCase(
		caseId: number,
		findingId: number,
		body: FindingInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseFinding>> {
		return ApiService.put(`${caseBase(caseId)}/${findingId}`, body, options);
	}

	static removeCase(
		caseId: number,
		findingId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${caseBase(caseId)}/${findingId}`, options);
	}

	static caseHistory(
		caseId: number,
		findingId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<FindingHistoryEntry[]>> {
		return ApiService.get(`${caseBase(caseId)}/${findingId}/history`, options);
	}

	// ---- Registry findings ----------------------------------------------

	static listManaged(
		managedAssetId: number,
		query: FindingsQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedFindingList>> {
		return ApiService.get(
			ApiService.withQuery(managedBase(managedAssetId), findingsQuery(query)),
			options
		);
	}

	static createManaged(
		managedAssetId: number,
		body: FindingInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedFinding>> {
		return ApiService.post(managedBase(managedAssetId), body, options);
	}

	static updateManaged(
		managedAssetId: number,
		findingId: number,
		body: FindingInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<ManagedFinding>> {
		return ApiService.put(`${managedBase(managedAssetId)}/${findingId}`, body, options);
	}

	static removeManaged(
		managedAssetId: number,
		findingId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${managedBase(managedAssetId)}/${findingId}`, options);
	}

	static managedHistory(
		managedAssetId: number,
		findingId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<FindingHistoryEntry[]>> {
		return ApiService.get(`${managedBase(managedAssetId)}/${findingId}/history`, options);
	}

	// ---- War room -------------------------------------------------------

	static warRoomMatrix(
		warRoomId: number,
		query: VulnerabilityMatrixQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<VulnerabilityMatrix>> {
		const search = query.search?.trim();
		return ApiService.get(
			ApiService.withQuery(`/war-rooms/${warRoomId}/scope/vulnerabilities`, {
				page: query.page,
				per_page: query.per_page,
				search: search || undefined,
				case_id: query.case_id ?? undefined,
				tracked: query.tracked ? 'true' : undefined
			}),
			options
		);
	}

	static warRoomTracked(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTrackedVulnerability[]>> {
		return ApiService.get(`/war-rooms/${warRoomId}/vulnerabilities`, options);
	}

	static warRoomTrack(
		warRoomId: number,
		body: WarRoomTrackInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTrackedVulnerability>> {
		return ApiService.post(`/war-rooms/${warRoomId}/vulnerabilities`, body, options);
	}

	static warRoomUpdateTracked(
		warRoomId: number,
		vulnerabilityId: number,
		note: string | null,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTrackedVulnerability>> {
		return ApiService.patch(
			`/war-rooms/${warRoomId}/vulnerabilities/${vulnerabilityId}`,
			{ note },
			options
		);
	}

	static warRoomUntrack(
		warRoomId: number,
		vulnerabilityId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/vulnerabilities/${vulnerabilityId}`,
			options
		);
	}
}
