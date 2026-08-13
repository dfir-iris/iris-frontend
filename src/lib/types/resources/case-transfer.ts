/**
 * Types for moving a case between two IRIS instances.
 *
 * Mirrors `app/business/case_transfer/` on the backend. Nothing here carries a
 * primary key from the source instance — every cross-reference is a bundle-local
 * ref string of the form `"<entity>:<source_pk>"`, and the target resolves it to
 * one of its own ids at import time.
 */

/** `"user:12"`, `"ioc_type:3"`, … — only ever meaningful inside one bundle. */
export type BundleRef = string;

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export interface ExportCaseBody {
	/** Ship the Datastore file contents. False exports metadata only. */
	include_blobs?: boolean;
	/**
	 * Encrypt the archive with this passphrase. Never stored anywhere — if it's
	 * lost, so is the archive.
	 */
	passphrase?: string;
}

// ---------------------------------------------------------------------------
// Inspect (step 1 of the import)
// ---------------------------------------------------------------------------

export interface BundleManifestSummary {
	format_version: number | null;
	source_organisation: string | null;
	source_iris_version: string | null;
	source_case_uuid: string | null;
	exported_at: string | null;
	exported_by: string | null;
	include_blobs: boolean | null;
}

export interface BundleCaseSummary {
	name: string | null;
	soc_id: string | null;
	description: string | null;
}

/** How `inspect` found a local user for a bundle principal, if it did. */
export type PrincipalMatchAxis = 'uuid' | 'external_id' | 'email' | 'login' | 'placeholder';

export interface BundlePrincipalSource {
	uuid: string | null;
	login: string | null;
	name: string | null;
	email: string | null;
	external_id: string | null;
}

export interface BundlePrincipal {
	ref: BundleRef;
	source: BundlePrincipalSource;
	/** Null when nothing on this instance matches — the operator has to decide. */
	matched_user_id: number | null;
	matched_by: PrincipalMatchAxis | null;
	/** How many rows in the bundle point at this principal. Sorted descending. */
	reference_count: number;
}

export interface BundleLookupEntry {
	ref: BundleRef;
	name: string | null;
	matched_id: number | null;
	/** Absent on the target and creatable — import will create it. */
	will_create: boolean;
	/**
	 * Absent on the target and *not* creatable (case states, review statuses and
	 * the like drive workflow rather than labelling it). The operator must map
	 * these to an existing row or the import is refused.
	 */
	requires_decision: boolean;
}

/** Keyed by lookup table: `customer`, `ioc_type`, `tag`, … */
export type BundleLookups = Record<string, BundleLookupEntry[]>;

/** Keyed by entity: `ioc`, `asset`, `event`, `note`, `dsfile`, … */
export type BundleCounts = Record<string, number>;

export interface BundleInspection {
	/** Capability for the staged upload. Required by `apply`, freed by `discard`. */
	staging_token: string;
	manifest: BundleManifestSummary;
	case: BundleCaseSummary;
	counts: BundleCounts;
	datastore_blobs: number;
	principals: BundlePrincipal[];
	lookups: BundleLookups;
	warnings: string[];
}

// ---------------------------------------------------------------------------
// Apply (step 3 of the import)
// ---------------------------------------------------------------------------

/**
 * `map`         — attribute the rows to an existing user on this instance.
 * `placeholder` — mint an inactive stand-in account. Server administrators only.
 * `importer`    — collapse onto whoever is running the import; the original
 *                 login is recorded in the case's modification history.
 */
export type PrincipalAction = 'map' | 'placeholder' | 'importer';

export interface PrincipalDecision {
	action: PrincipalAction;
	/** Required for `map`, ignored otherwise. */
	target_user_id?: number;
}

export type LookupAction = 'map' | 'create';

export interface LookupDecision {
	action: LookupAction;
	/** Required for `map`, ignored otherwise. */
	target_id?: number;
}

export interface CaseAclGrant {
	group_id: number;
	/** 1 = deny, 2 = read only, 4 = full access. */
	access_level: number;
}

export interface ApplyImportBody {
	staging_token: string;
	/** Keyed by principal ref. Anything left out defaults to `importer`. */
	principal_mapping?: Record<BundleRef, PrincipalDecision>;
	/** Keyed by lookup ref. Anything left out is matched by name, then created. */
	lookup_decisions?: Record<BundleRef, LookupDecision>;
	/** Overrides the customer for the imported case wholesale. */
	customer_id?: number;
	acl_grants?: CaseAclGrant[];
}

export interface CreatedLookup {
	lookup: string;
	name: string | null;
	id: number;
}

export interface AppliedPrincipal {
	ref: BundleRef;
	action: PrincipalAction;
	target_user_id: number | null;
	/** True only when this import is what minted the placeholder. */
	created: boolean;
	source_login: string | null;
	source_uuid: string | null;
}

export interface ImportReport {
	created_lookups: CreatedLookup[];
	principals: AppliedPrincipal[];
	blobs_restored: number;
}

/**
 * `POST /import` answers with the full case payload plus the report. Typed
 * loosely on the case side: the caller only needs `case_id` to redirect.
 */
export interface ImportedCase {
	case_id: number;
	case_name?: string;
	case_uuid?: string;
	import_report: ImportReport;
	[key: string]: unknown;
}
